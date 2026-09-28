# Defects

Context menu for kernel cards in the JupyterLab launcher. Behaviour these defects are measured against is asserted in [acc-crit.md](acc-crit.md).

## Authors

- `@kj` Konrad Jelen

## Environment Matching `MATCH`

Resolving the clicked kernel card to its nb_venv_kernels environment or standalone kernelspec

- [x] `DEF-MATCH-1` **wrong env removed when names share a prefix** - CRITICAL; Unregister/Remove on `demo-prod` acted on `demo`; fix: match by executable path, not name substring; `src/index.ts`
  - evidence: jest 29 green on 2026-09-28, incl. "selects correct env by executable path when names overlap"
  - repro: register envs `demo` and `demo-prod`, Remove on the `demo-prod` card
  - test-tags: UNIT
  - root-cause: 2026-09-28T13:31:12Z @kj `findVenvEnvironment` used `displayName.includes(env.name)`; `"Python [uv env:demo-prod]"` contains `demo`, first match won
  - log: 2026-09-28T13:31:12Z @kj added
  - log: 2026-09-28T13:31:12Z @kj closed: fixed in 8eb704c (v1.2.20)
- [x] `DEF-MATCH-2` **every uv kernel reported as not managed** - MAJOR; Unregister/Remove said "not managed by nb_venv_kernels" for every uv kernel; regression from the DEF-MATCH-1 fix; fix: resolve env path against `workspace_root`; `src/index.ts`
  - evidence: jest 29 green on 2026-09-28, incl. "matches when env.path is relative to workspace_root"
  - related: DEF-MATCH-1 - the fix that introduced this
  - repro: register a uv env, Unregister its card
  - test-tags: UNIT
  - root-cause: 2026-09-28T13:31:12Z @kj nb_venv_kernels reports `env.path` relative to `workspace_root`; the absolute `executable_path` never started with it
  - log: 2026-09-28T13:31:12Z @kj added
  - log: 2026-09-28T13:31:13Z @kj closed: fixed in e30ccb0 (v1.2.22)
- [x] `DEF-MATCH-3` **Remove on dbm-ds acted on the managed dbm-improvements env** - CRITICAL; Remove on standalone kernelspec `dbm-ds` resolved to the managed `dbm-improvements` env and unregistered it; fix: require `resource_dir` inside the env too; deleting the .venv dbm-ds runs from stays by design (ACC-REMOVE-24); `src/index.ts`
  - related: ACC-REMOVE-24 - Remove on a standalone kernelspec deletes the .venv it runs from, by design
  - evidence: jest 29 green on 2026-09-28, incl. "does not match when resource_dir is outside the env (standalone kernelspec)"
  - repro: user kernelspec whose argv[0] is in a managed `.venv`, Remove on its card
  - test-tags: UNIT
  - root-cause: 2026-09-28T13:31:13Z @kj matching used `executable_path` alone; both kernels share one `.venv`, so the standalone one resolved to the managed env
  - log: 2026-09-28T13:31:13Z @kj added
  - log: 2026-09-28T13:31:13Z @kj closed: fixed in 7577d30 (v1.2.29)
  - log: 2026-09-28T18:37:35Z @kj amended title "Remove on dbm-ds deleted the dbm-improvements env" -> "Remove on dbm-ds acted on the managed dbm-improvements env"; text "Remove on standalone kernelspec `dbm-ds` unregistered and deleted the managed `dbm-improvements` env; fix: require `resource_dir` inside the env too; `src/index.ts`" -> "CRITICAL; Remove on standalone kernelspec `dbm-ds` resolved to the managed `dbm-improvements` env and unregistered it; fix: require `resource_dir` inside the env too; deleting the .venv dbm-ds runs from stays by design (ACC-REMOVE-24); `src/index.ts`"
- [x] `DEF-MATCH-13` **managed card resolved to a same-named standalone kernelspec** - CRITICAL; user kernelspec rizz-assistant and managed venv-rizz-assistant-py share the name `Python [uv env:rizz-assistant]`; Unregister on the managed card deleted the standalone kernelspec; `handlers.py`, `src/index.ts`
  - evidence: Galata 27/27 green 2026-09-28 (port 8937), jest 37/37 green; ACC-API-30 test: two user kernelspecs named Twin Kernel give 409; ACC-API-26: shared-dir conda base card still 200
  - repro: two kernelspecs in different dirs with one display name, Unregister on either card
  - test-tags: E2E
  - root-cause: 2026-09-28T18:37:35Z @kj `/api/kernel-path` took the first spec with the display name; a failed lookup then fell through to the env-name substring match
  - log: 2026-09-28T18:37:35Z @kj added
  - log: 2026-09-28T18:37:35Z @kj reported: adversarial review round 1 (architect, bug-hunter), confirmed live on the workstation
  - log: 2026-09-28T18:37:35Z @kj closed: fixed: kernel-path answers 409 when the name spans more than one realpath(resource_dir); Unregister and Remove stop on any failed lookup
- [x] `DEF-MATCH-16` **Kernel lookup ignores the server's kernel manager config** - MAJOR; GET /api/kernel-path built fresh KernelSpecManager, CondaKernelSpecManager and VEnvKernelSpecManager objects with no config, so a configured name_format gives card names it cannot find; Unregister and Remove then answer 'Could not resolve kernel'; handlers.py \_get_all_kernelspecs
  - evidence: Galata 28/28 green 2026-09-28 port 8937 with a custom name_format; ACC-UNREG-11, ACC-UNREG-15 red on the old build; jest 37/37
  - related: ACC-UNREG-11, ACC-UNREG-15 - red on the old build with a custom name_format
  - repro: set c.VEnvKernelSpecManager.name_format, Unregister on a managed venv card
  - test-tags: E2E
  - root-cause: 2026-09-28T19:31:58Z @kj \_get_all_kernelspecs created unconfigured managers instead of using the server's kernel_spec_manager, which the launcher lists from
  - log: 2026-09-28T19:31:58Z @kj added
  - log: 2026-09-28T19:36:47Z @kj closed: fixed: KernelPathHandler.get uses the server's kernel_spec_manager via ensure_async; \_get_all_kernelspecs removed

## Context Menu `MENU`

Which launcher cards get the extension's context menu

- [x] `DEF-MENU-4` **context menu on every launcher card** - MEDIUM; kernel commands showed on Terminal, Text File and service cards; fix: stamp kernel cards with `data-jp-kernel-display-name`, select on it; `src/index.ts`, `schema/plugin.json`
  - evidence: jest 29 green on 2026-09-28, incl. "stamped kernel cards match the context menu selector; others do not"
  - repro: right-click the Terminal card in the launcher
  - test-tags: UNIT
  - root-cause: 2026-09-28T13:31:13Z @kj selector `.jp-LauncherCard` matched every card; JupyterLab marks kernel cards only by the `jp-Launcher-kernelIcon` image
  - log: 2026-09-28T13:31:13Z @kj added
  - log: 2026-09-28T13:31:13Z @kj closed: fixed in 2626ee1 (v1.2.21)
- [x] `DEF-MENU-12` **kernel without a logo gets no context menu** - MEDIUM; a kernelspec with no `logo-64x64.png` shows a letter placeholder card with no descriptor and no extension menu; `src/index.ts`
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; Galata logo-less card stamped; jest 'stamps a kernel card that has no logo, using the label text'
  - repro: user kernelspec with only `kernel.json`, right-click its launcher card
  - test-tags: UNIT, E2E
  - root-cause: 2026-09-28T14:08:46Z @kj `kernelDisplayNameForCard` treats a card as a kernel card only when it holds `img.jp-Launcher-kernelIcon`; logo-less kernels render `div.jp-LauncherCard-noKernelIcon`
  - log: 2026-09-28T14:08:46Z @kj added
  - log: 2026-09-28T14:08:46Z @kj reported: found by the Galata suite 2026-09-28; ACC-CARD-1 logo-less test red, card attribute absent
  - log: 2026-09-28T15:52:55Z @kj edited test-tags "E2E" -> "UNIT, E2E"
  - log: 2026-09-28T15:52:55Z @kj closed: fixed: kernelDisplayNameForCard also accepts div.jp-LauncherCard-noKernelIcon, name from the label; src/utils.ts

## Standalone Kernelspecs `KSPEC`

Kernelspecs installed outside the nb_venv_kernels registry

- [x] `DEF-KSPEC-5` **standalone kernelspec cannot be removed from the UI** - MEDIUM; `Python [uv env:henryk-sim]` gave "is not managed by nb_venv_kernels", its `.venv` already deleted; fix: delete local kernelspecs, refuse global ones; `src/index.ts`, `handlers.py`
  - test-tags: E2E
  - evidence: shipped v1.2.27; 22 jest green, build and lint clean at release; deletion itself failed until DEF-KSPEC-6
  - repro: install a kernelspec with `--user`, delete its `.venv`, Unregister its card
  - root-cause: 2026-09-28T13:31:13Z @kj both commands stopped when no nb_venv_kernels env matched; no path handled kernelspecs outside the registry
  - log: 2026-09-28T13:31:13Z @kj added
  - log: 2026-09-28T13:31:13Z @kj closed: fixed in 686525e (v1.2.27)
  - log: 2026-09-28T15:53:06Z @kj edited test-tags added "E2E"
- [x] `DEF-KSPEC-6` **kernelspec delete returns 405** - MEDIUM; Unregister on a standalone kernelspec failed with `Server error: 405 Method Not Allowed`; fix: own endpoint `DELETE /api/kernelspec-remove/<name>`; `handlers.py`
  - test-tags: E2E
  - evidence: shipped v1.2.28; 22 jest green, build and lint clean at release
  - related: DEF-KSPEC-5 - the fix that shipped the failing call
  - repro: install a kernelspec with `--user`, Unregister its card
  - root-cause: 2026-09-28T13:31:13Z @kj jupyter_server `/api/kernelspecs/<name>` implements GET only
  - log: 2026-09-28T13:31:13Z @kj added
  - log: 2026-09-28T13:31:13Z @kj closed: fixed in f45b64a (v1.2.28)
  - log: 2026-09-28T15:53:06Z @kj edited test-tags added "E2E"

## Build and CI `BUILD`

Production build and the GitHub workflows

- [x] `DEF-BUILD-7` **Check Release fails in license-webpack-plugin** - MAJOR; CI Check Release failed since v1.2.27 with `TypeError: Cannot read properties of undefined (reading 'trim')`; fix: pin webpack 5.106.0; `package.json`
  - test-tags: INTEGRATION
  - evidence: Build and Check Release workflows green on 7223f89
  - repro: clean clone, `python -m build` with webpack >= 5.106.1
  - root-cause: 2026-09-28T13:31:14Z @kj webpack 5.106.1 changed share identifiers from `=` to `|`; the plugin does `split('=')[1].trim()`
  - log: 2026-09-28T13:31:14Z @kj added
  - log: 2026-09-28T13:31:23Z @kj closed: fixed in 7223f89 (v1.2.30)
  - log: 2026-09-28T15:53:06Z @kj edited test-tags added "INTEGRATION"

## User Interface `UI`

Spinners, dialogs and tooltips the user sees

- [x] `DEF-UI-8` **no feedback between click and first dialog** - MINOR; after clicking Unregister or Remove nothing showed while the environment was resolved; fix: "Resolving environment..." spinner; `src/index.ts`
  - test-tags: E2E
  - evidence: shipped v1.2.24; 18 jest green, build and lint clean at release; spinner has no automated test
  - repro: slow server, click Unregister on a kernel card
  - root-cause: 2026-09-28T13:31:23Z @kj two server round-trips ran before any dialog was shown
  - log: 2026-09-28T13:31:23Z @kj added
  - log: 2026-09-28T13:31:23Z @kj closed: fixed in d7ed355 (v1.2.24)
  - log: 2026-09-28T15:53:06Z @kj edited test-tags added "E2E"
- [x] `DEF-UI-9` **kernel tooltip shown as a detached panel** - MINOR; the v1.2.29 hover popup rendered away from the kernel card; fix: native `title` attribute with line breaks; `src/index.ts`
  - evidence: jest 29 green on 2026-09-28, incl. "uses newline separators (browser title attribute honors \n)"
  - repro: hover a kernel card in v1.2.29
  - test-tags: UNIT
  - root-cause: 2026-09-28T13:31:23Z @kj custom singleton `<div>` popup positioned outside the card; the user wanted the standard browser tooltip
  - log: 2026-09-28T13:31:23Z @kj added
  - log: 2026-09-28T13:31:24Z @kj closed: fixed in 7223f89 (v1.2.30)

## Unregister `UNREG`

Removing an environment from the nb_venv_kernels registry

- [x] `DEF-UNREG-10` **Unregister reports success and unregisters nothing** - MAJOR; "Kernel Unregistered" shown, entry stays in `~/.venv/environments.txt` and the card stays; Remove leaves a stale entry for the deleted `.venv`; `src/index.ts`
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-UNREG-15 and ACC-REMOVE-23 assert the registry no longer lists the env; jest 'returns the matched env with its path made absolute'
  - repro: server cwd not the workspace root, register `unregproj/.venv`, Unregister its card, read the registry
  - test-tags: UNIT, E2E
  - root-cause: 2026-09-28T14:08:46Z @kj frontend posts `env.path` relative to `workspace_root`; nb_venv_kernels applies `abspath()` against the server cwd, replies `unregistered: false`, frontend ignores it
  - log: 2026-09-28T14:08:46Z @kj added
  - log: 2026-09-28T14:08:46Z @kj reported: found by the Galata suite 2026-09-28; ACC-UNREG-15 and ACC-UNREG-11 red; registry still lists unregproj/.venv and demo-prod/.venv after the success dialog
  - log: 2026-09-28T15:52:55Z @kj edited test-tags "E2E" -> "UNIT, E2E"
  - log: 2026-09-28T15:52:55Z @kj closed: fixed: matched env carries its absolute path; unregister treats unregistered:false as failure; src/utils.ts matchVenvEnvironment, src/index.ts unregisterVenvKernel

## Path Conversion `PATH`

Turning absolute server paths into paths relative to the server root

- [x] `DEF-PATH-11` **home directory guessed from /home/<name>** - MEDIUM; with HOME outside `/home/<name>` or `/Users/<name>` (e.g. `/root`), Show in File Browser opens the root, the terminal starts in the server cwd, a standalone kernelspec keeps its `.venv`; `src/index.ts`
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; with a HOME outside /home/<name>, ACC-NAV-6 sees cd /navproj, ACC-NAV-8 pwd is termproj, ACC-REMOVE-24 deletes the .venv; jest toRelativePath cases
  - repro: HOME=/root or any non-/home path, Show in File Browser on a venv kernel card
  - test-tags: UNIT, E2E
  - root-cause: 2026-09-28T14:08:46Z @kj jupyter_server publishes `serverRoot` with HOME collapsed to `~`; `expandTilde` rebuilds HOME by regex `^/(home|Users)/[^/]+` from the target path
  - log: 2026-09-28T14:08:46Z @kj added
  - log: 2026-09-28T14:08:46Z @kj reported: found by the Galata suite 2026-09-28 with a scratch HOME; ACC-NAV-6, ACC-NAV-8, ACC-REMOVE-24 red
  - log: 2026-09-28T15:52:55Z @kj edited test-tags "E2E" -> "UNIT, E2E"
  - log: 2026-09-28T15:52:55Z @kj closed: fixed: /api/kernel-path returns the contents manager absolute server_root; frontend converts against it; expandTilde and the /home/<name> fallback removed
- [x] `DEF-PATH-14` **TypeError when the backend sends no server_root** - MINOR; frontend served newer than the running server after an upgrade without restart; Show in File Browser, Open Terminal and standalone Remove throw with no dialog; `src/utils.ts`
  - evidence: Galata 27/27 green 2026-09-28 (port 8937), jest 37/37 green; jest 'returns null when the root is missing'
  - repro: upgrade the wheel, keep the old server running, Show in File Browser
  - test-tags: UNIT
  - root-cause: 2026-09-28T18:37:35Z @kj `toRelativePath` called `serverRoot.startsWith` on an undefined `server_root`
  - log: 2026-09-28T18:37:35Z @kj added
  - log: 2026-09-28T18:37:35Z @kj reported: adversarial review round 1 (bug-hunter, ux-designer)
  - log: 2026-09-28T18:37:35Z @kj closed: fixed: toRelativePath returns null for a missing root

## Remove Environment `REMOVE`

Deleting an environment or kernelspec from disk

- [x] `DEF-REMOVE-15` **Remove cannot delete a .venv on a default jupyter_server** - MAJOR; the contents API answers 400 for hidden paths unless ContentsManager.allow_hidden is True, so Remove fails on every default install; works here only via /opt/conda/etc/jupyter/jupyter_lab_config.py; `src/index.ts` removeDirectory
  - evidence: ACC-REMOVE-23, ACC-REMOVE-24 green with allow_hidden=False, red with the handler disabled; Galata 27/27 green 2026-09-28 port 8937
  - related: ACC-REMOVE-23, ACC-REMOVE-24, ACC-API-31 - the tests that cover the fix
  - test-tags: E2E
  - repro: default jupyter_server config, Remove Environment on a managed .venv kernel
  - root-cause: 2026-09-28T18:37:35Z @kj removeDirectory deletes through DELETE /api/contents, which refuses hidden paths such as .venv under the default allow_hidden=False
  - log: 2026-09-28T18:37:35Z @kj added
  - log: 2026-09-28T18:37:35Z @kj reported: adversarial review round 1 (bug-hunter); fix approach is the user's decision
  - log: 2026-09-28T19:13:58Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T19:13:58Z @kj closed: fixed: new POST /api/venv-remove runs shutil.rmtree on the .venv; frontend removeVenv calls it instead of DELETE /api/contents
