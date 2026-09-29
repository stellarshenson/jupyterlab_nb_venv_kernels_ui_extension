---
name: jupyterlab-nb-venv-kernels-ui-extension
description: Manage per-project venv and uv Jupyter kernels from the shell - register, unregister, scan, list, remove a project .venv or a stale kernelspec - through the `nb_venv_kernels` CLI that the jupyterlab_nb_venv_kernels_ui_extension launcher menu builds on. Use when registering or unregistering a venv kernel, removing a project .venv, finding which kernel a launcher card is, or "my venv kernel does not show in JupyterLab".
---

# nb_venv_kernels

CLI of nb_venv_kernels. This extension's launcher menu (Show in File Browser, Open Terminal, Unregister, Remove) acts on same registry: `~/.venv/environments.txt`, `~/.uv/environments.txt`. Commands, flags, output: `nb_venv_kernels --help`, `nb_venv_kernels <command> --help`. Read first.

## Rules

- Workspace root = `$JUPYTER_SERVER_ROOT`, else `$JUPYTERHUB_ROOT_DIR`, else `ServerApp.root_dir` in user `jupyter_server_config.json`, else cwd. Run CLI with server's env; `register` refuses path outside root (exit 1), global conda env exempt
- `list --json` gives paths under root relative to its `workspace_root` field; paths outside (global conda) absolute. Join relative ones before use; `unregister` resolves relative path against shell cwd
- `unregister` exits 0 when path not registered. Check line: `Unregistered:` vs `Not found in registry:`
- Display name no identity. Two kernelspecs in different dirs can share one card name. Act by env path or kernel name (`jupyter kernelspec list --json`)
- Project root = dir above `.venv`, where Show in File Browser and Open Terminal go
- Remove env = `unregister` first, then `rm -rf` realpath whose basename is `.venv`. Nothing else. Ask user first; cannot undo
- Standalone kernelspec (not in registry): `jupyter kernelspec remove -f <name>` only when its dir under `$HOME`. Never system kernelspec (`/opt/conda/share/jupyter/kernels`, `/usr/share/jupyter/kernels`). Ask user first; cannot undo
- Running JupyterLab shows change within ~2 min: server spec cache 60 s, launcher poll 61 s
- Kernel missing from JupyterLab: `nb_venv_kernels config show`; `config enable` sets `VEnvKernelSpecManager`
