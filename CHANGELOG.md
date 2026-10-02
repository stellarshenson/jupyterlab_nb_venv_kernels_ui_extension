# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## [1.2.35] - 2026-10-02

### Added

- `test` and `dev` extras in `pyproject.toml`; `dev` pulls `test`, so `pip install "jupyterlab_nb_venv_kernels_ui_extension[dev]"` installs the testing packages

### Changed

- Dependency ranges are `jupyter_server>=2.21,<3` and `jupyter_client>=8.10,<9`: the tested minor version is the floor and the next major version is the ceiling, so older versions of both are no longer accepted
- README "Agent Skill" section states where the skill is and gives two link lines, one for the installed copy under `sys.prefix` and one for a clone
- CI build job installs `.[test]`

## [1.2.34] - 2026-09-29

### Added

- Test that the installed agent skill matches the repository copy; CI runs it after `pip install .`

### Changed

- README "Agent Skill" section moved below Install, with a link command for the installed copy that prints the missing path and keeps any existing link when that Python has no copy, the `pip install --user` and Claude Code substitutions, and the step for a copied directory at the link path

### Fixed

- The wheel now ships the agent skill: `pip install` puts it at `share/jupyter/agents/skills/jupyterlab-nb-venv-kernels-ui-extension/SKILL.md` under the Python's data directory; 1.2.32 had it in the repository only

## [1.2.32] - 2026-09-29

### Added

- Agent skill `.agents/skills/jupyterlab-nb-venv-kernels-ui-extension/SKILL.md` that lets an AI coding assistant manage these kernels from the shell with the `nb_venv_kernels` CLI, asking before any delete
- README "Agent Skill" section with the line that links the skill into Claude Code from a clone

## [1.2.31] - 2026-09-28

### Added

- Galata browser test suite (29 tests) run in CI on a scratch home directory

### Changed

- Kernel card details (kernel name, kind, executable, resource directory, environment path) show in the browser's standard hover tooltip instead of a custom popup
- Resolve-failure dialogs show the server's reason; for a display name shared by kernels in different directories they name both kernels

### Fixed

- Remove Environment deletes the `.venv` through a new server endpoint (`POST /api/venv-remove`), so it works on servers that refuse hidden paths (the default `allow_hidden=False`)
- Kernel lookup uses the server's configured kernel spec manager, so a custom `name_format` no longer breaks Unregister and Remove
- A card whose display name is shared by kernels in different directories is refused instead of acting on the first match
- Unregister posts the environment's absolute path and reports a failed unregister
- Paths convert against the server root reported by the backend instead of a home directory guessed from `/home/<name>`
- Kernel cards without a logo get the context menu
- Production build pins webpack 5.106.0, because later versions crash license-webpack-plugin

## 1.2.11

- Added 6 new tests for schema/plugin.json menu configuration validation
- Tests verify Kernel menu scan command and all context menu commands
- Total test count increased from 47 to 53

## 1.2.9

- **Package renamed** from `jupyterlab_launcher_navigate_to_kernel_extension` to `jupyterlab_nb_venv_kernels_ui_extension`
- Added comprehensive test suite with 47 unit tests
- Added `test` target to Makefile
- Added "Scan for Virtual Environments" to Kernel menu (invokes `nb_venv_kernels:scan`)
- Added package rename warning to README

## 1.2.6

- Auto-refresh kernel list after unregister and remove operations
- Calls `nb_venv_kernels:refresh` command for immediate UI update

## 1.2.5

- Fixed path conversion for relative paths from nb_venv_kernels
- Added fallback for absolute paths when serverRoot is empty
- Fixed confirmation dialog wording for remove environment

## 1.2.0

- Added "Remove Environment" context menu item
- Permanently deletes local `.venv` folders with confirmation dialog
- Unregisters kernel before removing directory
- Only available for local environments containing `.venv`

## 1.1.15

- Removed Node.js version restriction from Makefile
- Builds work with Node.js 25.x thanks to chalk resolution fix

## 1.1.8

- Fixed Node.js 24/25 compatibility with yarn resolution for chalk
- Forced `duplicate-package-checker-webpack-plugin/chalk` to version 4.1.2

## 1.1.4

- Added "Unregister Kernel" context menu item for nb_venv_kernels environments
- Uses nb_venv_kernels REST API directly
- Only appears for venv/uv environments, not conda

## 1.0.14

- Fixed conda local environments where `argv[0]` is relative `python` instead of absolute path - now checks `resource_dir` for `.venv` pattern first
- Added GitHub CI/CD workflows for build, test, release automation
- Updated CI to use Python 3.10 to match package requirements
- Added screenshot and reference to sister extension in README

## 1.0.13

- Fixed navigation for local conda environments stored in `.venv` subdirectories
- Extended `.venv` detection to validate segment boundaries

## 1.0.12

- Fixed terminal opening in wrong location (now uses relative path)
- Improved `.venv` detection for conda local environments

## 1.0.11

- Added dynamic kernel provider support (`nb_conda_kernels`, `nb_venv_kernels`)
- Project-aware path resolution - navigates to project root for `.venv` environments
- Pinned Node.js to `>=22,<25` to avoid chalk incompatibility
- Added `skipLibCheck` to fix TypeScript build issues

## 1.0.0

- Initial release
- Right-click context menu on kernel launcher cards
- "Show in File Browser" command
- "Open Terminal at Location" command
- Support for conda and virtualenv environments

<!-- <END NEW CHANGELOG ENTRY> -->
