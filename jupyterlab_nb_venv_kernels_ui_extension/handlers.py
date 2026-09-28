"""
API handlers for kernel path resolution.
"""
import json
import os
import re
import shutil

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import ensure_async, url_path_join
from jupyter_client.kernelspec import KernelSpecManager
import tornado


class KernelPathHandler(APIHandler):
    """Handler for getting kernel installation path by display name."""

    @tornado.web.authenticated
    async def get(self, display_name: str):
        """Get the path information for a kernel by its display name.

        Args:
            display_name: The display name of the kernel (URL-decoded by tornado)
        """
        try:
            # The server's configured manager lists what the launcher shows;
            # a fresh manager would ignore its config (e.g. name_format)
            all_specs = await ensure_async(self.kernel_spec_manager.get_all_specs())

            # Find the kernels matching the display name
            matches = [
                (name, spec_data)
                for name, spec_data in all_specs.items()
                if spec_data.get("spec", {}).get("display_name") == display_name
            ]

            if not matches:
                self.set_status(404)
                self.finish(json.dumps({
                    "error": f"Kernel with display name '{display_name}' not found"
                }))
                return

            # The launcher card carries only the display name. Two kernelspecs
            # in different directories under one name (a user kernelspec and a
            # managed env's kernel) cannot be told apart, and acting on the
            # first would act on the wrong kernel. The same kernelspec listed
            # under two names by two providers shares one directory and stays
            # resolvable.
            resource_dirs = {
                os.path.realpath(spec_data.get("resource_dir", ""))
                for _, spec_data in matches
            }
            if len(resource_dirs) > 1:
                self.set_status(409)
                self.finish(json.dumps({
                    "error": (
                        f"Display name '{display_name}' is shared by kernels "
                        f"{', '.join(sorted(name for name, _ in matches))} in "
                        f"different directories; give each a distinct "
                        f"display_name"
                    )
                }))
                return

            kernel_name, kernel_info = matches[0]

            spec = kernel_info.get("spec", {})
            resource_dir = kernel_info.get("resource_dir", "")

            # Extract executable path from argv
            argv = spec.get("argv", [])
            executable_path = argv[0] if argv else None

            # Try to determine the environment path (for conda environments)
            env_path, is_global_conda = self._extract_env_path(
                executable_path, resource_dir
            )

            # Classify kernelspec as local (under user's home) or global
            # (system-wide). The launcher context menu uses this to decide
            # whether a non-nb_venv_kernels-managed kernel may be deleted
            # via DELETE /api/kernelspecs/<name>: local yes, global no.
            is_local = self._is_local_kernelspec(resource_dir)

            # Absolute root of the contents manager, so the frontend can turn
            # the paths above into contents-API paths. The page config's
            # `serverRoot` has the home directory collapsed to `~`, which the
            # browser cannot expand.
            root_dir = getattr(self.contents_manager, "root_dir", "") or ""
            server_root = os.path.abspath(root_dir) if root_dir else ""

            self.finish(json.dumps({
                "kernel_name": kernel_name,
                "display_name": display_name,
                "resource_dir": resource_dir,
                "executable_path": executable_path,
                "env_path": env_path,
                "is_global_conda": is_global_conda,
                "is_local": is_local,
                "server_root": server_root
            }))

        except Exception as e:
            self.log.error(f"Error getting kernel path: {e}")
            self.set_status(500)
            self.finish(json.dumps({
                "error": str(e)
            }))

    def _is_local_kernelspec(self, resource_dir: str) -> bool:
        """Return True if the kernelspec lives under the current user's home.

        Local kernelspecs (e.g. `~/.local/share/jupyter/kernels/<name>` on
        Linux, `~/Library/Jupyter/kernels/<name>` on macOS) are safe for the
        plugin to delete via `DELETE /api/kernelspecs/<name>` when not
        managed by nb_venv_kernels. System / global kernelspecs (e.g.
        `/opt/conda/share/jupyter/kernels/`, `/usr/local/share/jupyter/...`,
        `/usr/share/jupyter/...`) are not - touching those needs admin
        action, so the launcher menu refuses to remove them.

        Args:
            resource_dir: The kernelspec's filesystem directory

        Returns:
            True if `resource_dir` is under the user's home directory
        """
        if not resource_dir:
            return False
        try:
            home = os.path.expanduser("~")
        except Exception:
            return False
        if not home or home == "~":
            return False
        home = home.rstrip(os.sep) + os.sep
        return resource_dir.startswith(home)

    def _extract_env_path(
        self,
        executable_path: str | None,
        resource_dir: str
    ) -> tuple[str | None, bool]:
        """Extract the project path from the executable.

        For uv/venv environments (.venv folder), returns the project root
        (one level up from .venv). For conda local environments, returns
        two levels up. For system/global conda, returns the environment root.

        Args:
            executable_path: Path to the Python executable
            resource_dir: The kernel's resource directory

        Returns:
            Tuple of (path, is_global_conda):
            - path: The project or environment root path, or None if not determinable
            - is_global_conda: True if this is a global conda environment
        """
        # PRIORITY CHECK: If .venv is in resource_dir, extract project root
        # This handles conda local envs where argv[0] is just "python" (relative)
        # but resource_dir contains the full path like:
        # /project/.venv/envname/share/jupyter/kernels/python3
        if resource_dir and "/.venv/" in resource_dir:
            venv_idx = resource_dir.find("/.venv/")
            project_root = resource_dir[:venv_idx]
            if os.path.isdir(project_root):
                return (project_root, False)

        if not executable_path:
            return (None, False)

        # Use original path first (before symlink resolution) for .venv detection
        # This is important because .venv/bin/python often symlinks to system Python
        original_path = executable_path

        # Resolve symlinks for additional pattern matching
        try:
            real_path = os.path.realpath(executable_path)
        except (OSError, ValueError):
            real_path = executable_path

        # Priority check: If .venv is anywhere in the path (original OR resolved),
        # navigate to one level up from .venv
        # Handles both: /project/.venv/bin/python and /project/.venv/envname/bin/python
        for path_to_check in [original_path, real_path]:
            # Check for /.venv/ (with trailing slash - .venv as intermediate directory)
            if "/.venv/" in path_to_check:
                venv_idx = path_to_check.find("/.venv/")
                project_root = path_to_check[:venv_idx]
                if os.path.isdir(project_root):
                    return (project_root, False)
            # Check for /.venv at end of a path segment (e.g., if path ends with .venv)
            elif "/.venv" in path_to_check:
                venv_idx = path_to_check.find("/.venv")
                # Make sure it's actually .venv directory, not something like .venv-backup
                remaining = path_to_check[venv_idx + 6:]  # after "/.venv"
                if remaining == "" or remaining.startswith("/"):
                    project_root = path_to_check[:venv_idx]
                    if os.path.isdir(project_root):
                        return (project_root, False)

        # Pattern 1: uv/venv with .venv folder - /project/.venv/bin/python
        # Return project root (one level up from .venv)
        # Check original path first (before symlink resolution)
        venv_dot_match = re.match(r"^(.*)/(\.venv)/bin/python.*$", original_path)
        if venv_dot_match:
            project_root = venv_dot_match.group(1)
            if os.path.isdir(project_root):
                return (project_root, False)

        # Pattern 2: Named virtualenv - /path/to/venv/bin/python (not .venv)
        # Check if there's a pyvenv.cfg in the parent of bin/
        venv_match = re.match(r"^(.*)/bin/python.*$", original_path)
        if venv_match:
            potential_venv = venv_match.group(1)
            pyvenv_cfg = os.path.join(potential_venv, "pyvenv.cfg")
            if os.path.exists(pyvenv_cfg):
                # For named venvs, return the venv directory itself
                return (potential_venv, False)

        # Pattern 3: Conda local environment - /project/subdir/envs/envname/bin/python
        # Return project root (two levels up from envs/envname)
        conda_local_match = re.match(
            r"^(.*)/([^/]+)/envs/([^/]+)/bin/python.*$",
            real_path
        )
        if conda_local_match:
            # Check if this looks like a local project env (not system conda)
            potential_project = conda_local_match.group(1)
            subdir = conda_local_match.group(2)
            # If it's under a typical project structure, go to project root
            if subdir not in ("opt", "usr", "home"):
                project_root = potential_project
                if os.path.isdir(project_root):
                    return (project_root, False)

        # Pattern 4: Global conda environment - /opt/conda/envs/envname/bin/python
        # or ~/miniconda3/envs/envname/bin/python
        # Return the environment root (this is a global conda environment)
        conda_global_match = re.match(
            r"^(.*/(?:envs|conda)/[^/]+)(?:/bin/python.*)?$",
            real_path
        )
        if conda_global_match:
            return (conda_global_match.group(1), True)

        # Pattern 5: Base conda - /opt/conda/bin/python or similar
        # This is also a global conda environment
        base_conda_match = re.match(
            r"^(/opt/conda|/home/[^/]+/(?:mini)?conda3?|/usr/local/conda)(?:/bin/python.*)?$",
            real_path
        )
        if base_conda_match:
            return (base_conda_match.group(1), True)

        # Pattern 6: System Python with kernelspec in share/jupyter/kernels
        # Return the directory containing the kernelspec
        if "/share/jupyter/kernels/" in resource_dir:
            # Go up to the environment root
            # e.g., /opt/conda/share/jupyter/kernels/python3 -> /opt/conda
            parts = resource_dir.split("/share/jupyter/kernels/")
            if parts[0]:
                return (parts[0], True)

        # Fallback: try to find environment root from executable path structure
        bin_match = re.match(r"^(.*)/bin/python.*$", real_path)
        if bin_match:
            potential_env = bin_match.group(1)
            # Verify it looks like an environment (has bin, lib, etc.)
            if os.path.isdir(os.path.join(potential_env, "lib")):
                return (potential_env, False)

        return (None, False)


class KernelspecDeleteHandler(APIHandler):
    """Delete a Jupyter kernelspec by name.

    Provided because jupyter_server's standard `/api/kernelspecs/<name>`
    handler only implements GET - there is no upstream DELETE, so the
    frontend cannot remove a standalone kernelspec without this endpoint.

    Refuses to delete a kernelspec whose `resource_dir` is not under the
    current user's home directory (system / global kernelspecs).
    """

    @tornado.web.authenticated
    async def delete(self, kernel_name: str):
        """Delete the kernelspec named `kernel_name` if it is local.

        Args:
            kernel_name: The kernelspec name (URL-decoded by tornado)
        """
        try:
            ksm = KernelSpecManager()
            try:
                spec = ksm.get_kernel_spec(kernel_name)
            except Exception as e:
                self.set_status(404)
                self.finish(json.dumps({
                    "error": f"Kernelspec '{kernel_name}' not found: {e}"
                }))
                return

            resource_dir = spec.resource_dir or ""
            home = ""
            try:
                home = os.path.expanduser("~")
            except Exception:
                home = ""
            if not home or home == "~":
                self.set_status(500)
                self.finish(json.dumps({
                    "error": "Could not determine user home directory"
                }))
                return
            home_prefix = home.rstrip(os.sep) + os.sep
            if not resource_dir.startswith(home_prefix):
                self.set_status(403)
                self.finish(json.dumps({
                    "error": (
                        f"Refusing to delete non-local kernelspec at "
                        f"{resource_dir}"
                    ),
                    "resource_dir": resource_dir
                }))
                return

            ksm.remove_kernel_spec(kernel_name)
            self.finish(json.dumps({
                "success": True,
                "kernel_name": kernel_name,
                "resource_dir": resource_dir
            }))

        except Exception as e:
            self.log.error(f"Error deleting kernelspec: {e}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


class VenvRemoveHandler(APIHandler):
    """Delete a `.venv` directory from disk (`rm -rf`).

    The contents API cannot do it: it refuses dot-directories unless
    `ContentsManager.allow_hidden` is set, which a default server does not.
    """

    @tornado.web.authenticated
    def post(self):
        path = os.path.realpath((self.get_json_body() or {}).get("path") or "")
        if os.path.basename(path) != ".venv" or not os.path.isdir(path):
            self.set_status(400)
            self.finish(json.dumps({"error": f"Not a .venv directory: {path}"}))
            return
        try:
            shutil.rmtree(path)
        except OSError as e:
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))
            return
        self.finish(json.dumps({"success": True, "path": path}))


def setup_handlers(web_app):
    """Setup the API handlers.

    Args:
        web_app: The Jupyter server web application
    """
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    # Route pattern for kernel path endpoint
    # The display_name may contain special characters, so we use a broad pattern
    kernel_path_route = url_path_join(
        base_url,
        "api",
        "kernel-path",
        "(.+)"  # display_name parameter (URL-encoded)
    )

    # Route pattern for kernelspec deletion - separate path from the
    # standard /api/kernelspecs/<name> (which only supports GET upstream).
    kernelspec_delete_route = url_path_join(
        base_url,
        "api",
        "kernelspec-remove",
        "(.+)"  # kernel_name parameter (URL-encoded)
    )

    handlers = [
        (kernel_path_route, KernelPathHandler),
        (kernelspec_delete_route, KernelspecDeleteHandler),
        (url_path_join(base_url, "api", "venv-remove"), VenvRemoveHandler)
    ]
    web_app.add_handlers(host_pattern, handlers)
