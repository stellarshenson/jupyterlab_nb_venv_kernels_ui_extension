"""
API handlers for kernel path resolution.
"""
import json
import os
import re

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from jupyter_client.kernelspec import KernelSpecManager
import tornado


class KernelPathHandler(APIHandler):
    """Handler for getting kernel installation path by display name."""

    def _get_all_kernelspecs(self) -> dict:
        """Get all kernelspecs from standard and dynamic providers.

        Queries the standard KernelSpecManager plus any installed dynamic
        kernel providers like nb_conda_kernels and nb_venv_kernels.

        Returns:
            Combined dict of all available kernelspecs
        """
        all_specs = {}

        # Standard kernelspecs
        ksm = KernelSpecManager()
        all_specs.update(ksm.get_all_specs())

        # Try nb_conda_kernels if available
        try:
            from nb_conda_kernels import CondaKernelSpecManager
            cksm = CondaKernelSpecManager()
            all_specs.update(cksm.get_all_specs())
        except ImportError:
            pass
        except Exception as e:
            self.log.debug(f"Error loading conda kernels: {e}")

        # Try nb_venv_kernels if available
        try:
            from nb_venv_kernels import VEnvKernelSpecManager
            vksm = VEnvKernelSpecManager()
            all_specs.update(vksm.get_all_specs())
        except ImportError:
            pass
        except Exception as e:
            self.log.debug(f"Error loading venv kernels: {e}")

        return all_specs

    @tornado.web.authenticated
    async def get(self, display_name: str):
        """Get the path information for a kernel by its display name.

        Args:
            display_name: The display name of the kernel (URL-decoded by tornado)
        """
        try:
            # Get all available kernelspecs including dynamic providers
            all_specs = self._get_all_kernelspecs()

            # Find the kernel matching the display name
            kernel_info = None
            kernel_name = None

            for name, spec_data in all_specs.items():
                spec = spec_data.get("spec", {})
                if spec.get("display_name") == display_name:
                    kernel_name = name
                    kernel_info = spec_data
                    break

            if kernel_info is None:
                self.set_status(404)
                self.finish(json.dumps({
                    "error": f"Kernel with display name '{display_name}' not found"
                }))
                return

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

            self.finish(json.dumps({
                "kernel_name": kernel_name,
                "display_name": display_name,
                "resource_dir": resource_dir,
                "executable_path": executable_path,
                "env_path": env_path,
                "is_global_conda": is_global_conda,
                "is_local": is_local
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


def setup_handlers(web_app):
    """Setup the API handlers.

    Args:
        web_app: The Jupyter server web application
    """
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    # Route pattern for kernel path endpoint
    # The display_name may contain special characters, so we use a broad pattern
    route_pattern = url_path_join(
        base_url,
        "api",
        "kernel-path",
        "(.+)"  # display_name parameter (URL-encoded)
    )

    handlers = [(route_pattern, KernelPathHandler)]
    web_app.add_handlers(host_pattern, handlers)
