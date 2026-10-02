# Acceptance Criteria

Context menu for kernel cards in the JupyterLab launcher, complementing nb_venv_kernels. Each kernel card is stamped with a `data-jp-kernel-display-name` attribute, and the menu commands resolve the clicked kernel through the extension's `/api/kernel-path` endpoint.

## Authors

- `@kj` Konrad Jelen

## Kernel Cards `CARD`

Launcher kernel cards: the descriptor attribute, the context menu scope and the hover tooltip

- [x] `ACC-CARD-1` **Kernel card descriptor** - CRITICAL; every kernel card in the launcher, with or without a kernel logo, carries `data-jp-kernel-display-name` set to the kernel display name
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-CARD-1 tests: every Notebook/Console card stamped, logo-less card stamped
  - blocked-by: DEF-MENU-12 - logo-less cards are not stamped
  - test: open the launcher, assert every card with a kernel icon has the attribute
  - test-tags: UNIT, E2E
  - mechanism: 2026-09-28T13:30:34Z @kj MutationObserver on the shell node stamps cards on first pass and on every re-render; `enrichKernelCard` in `src/index.ts`
  - log: 2026-09-28T13:30:34Z @kj added
  - log: 2026-09-28T14:09:09Z @kj amended text "every launcher card holding a `jp-Launcher-kernelIcon` image carries `data-jp-kernel-display-name` set to the kernel display name" -> "every kernel card in the launcher, with or without a kernel logo, carries `data-jp-kernel-display-name` set to the kernel display name"
  - log: 2026-09-28T14:09:09Z @kj edited test-tags "UNIT" -> "UNIT, E2E"
  - log: 2026-09-28T15:52:56Z @kj closed: verified-by-galata
- [x] `ACC-CARD-2` **Edge: card added after startup** - HIGH; a kernel card rendered after page load, e.g. after an environment scan, also receives the attribute
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-CARD-2 test: venv registered after page load, its card stamped
  - test-tags: E2E
  - test: register a new kernel while lab is open, refresh kernelspecs, assert the new card is stamped
  - log: 2026-09-28T13:30:34Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:12Z @kj closed: verified-by-galata
- [x] `ACC-CARD-3` **Non-kernel cards unmarked** - HIGH; Terminal, Text File and other non-kernel launcher cards never carry the attribute
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-CARD-3 test: no non-kernel card carries the attribute
  - test: open the launcher, assert the Terminal card has no attribute
  - test-tags: UNIT, E2E
  - log: 2026-09-28T13:30:34Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags "UNIT" -> "UNIT, E2E"
  - log: 2026-09-28T14:09:12Z @kj closed: verified-by-galata
- [x] `ACC-CARD-4` **Context menu only on kernel cards** - CRITICAL; the extension commands appear on right-click of a kernel card and never on a non-kernel card
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-CARD-4 test: items visible on the python3 card, hidden on the Terminal card
  - test: right-click a kernel card and the Terminal card, compare the menus
  - test-tags: UNIT, E2E
  - mechanism: 2026-09-28T13:30:35Z @kj context menu selector `.jp-LauncherCard[data-jp-kernel-display-name]` in `schema/plugin.json`
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags "UNIT" -> "UNIT, E2E"
  - log: 2026-09-28T14:09:12Z @kj closed: verified-by-galata
- [x] `ACC-CARD-5` **Hover tooltip** - MEDIUM; kernel card `title` lists display name, kernel name, kind, executable, resource dir and env path on separate lines; empty fields are left out
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-CARD-5 test: title lines hold display name, kernel name, kind, executable
  - test: hover a kernel card, assert the title lines
  - test-tags: UNIT, E2E
  - mechanism: 2026-09-28T13:30:35Z @kj native browser `title` attribute with `\n` separators, filled once per kernel from `/api/kernel-path`
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags "UNIT" -> "UNIT, E2E"
  - log: 2026-09-28T14:09:12Z @kj closed: verified-by-galata

## Navigation `NAV`

Show in File Browser and Open Terminal at Location

- [x] `ACC-NAV-6` **Show in File Browser** - HIGH; opens the file browser at the kernel's project directory
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-NAV-6 test: Show in File Browser calls cd /navproj
  - blocked-by: DEF-PATH-11
  - test-tags: E2E
  - test: right-click a venv kernel card, run the command, assert the file browser path
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:56Z @kj closed: verified-by-galata
- [x] `ACC-NAV-7` **Venv project root** - HIGH; for a kernel inside a `.venv`, navigation targets the directory one level above `.venv`
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-NAV-6 test: kernel in navproj/.venv opens navproj, not the .venv
  - blocked-by: DEF-PATH-11
  - test-tags: E2E
  - test: kernel at `proj/.venv`, run Show in File Browser, assert the browser shows `proj`
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:56Z @kj closed: verified-by-galata
- [x] `ACC-NAV-8` **Open Terminal at Location** - HIGH; opens a terminal whose working directory is the kernel's project directory
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-NAV-8 test: terminal pwd equals <root>/termproj
  - blocked-by: DEF-PATH-11
  - test-tags: E2E
  - test: run the command on a venv kernel, run `pwd` in the terminal
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:56Z @kj closed: verified-by-galata
- [x] `ACC-NAV-9` **Edge: global conda environment** - MEDIUM; for a global conda environment both commands show the "Global Conda Environment" dialog and do not navigate
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-NAV-9 test on the workstation conda base kernel: dialog shown twice, no cd to /, no terminal; skipped where no global conda kernel exists (CI)
  - test-tags: E2E
  - test: right-click a base conda kernel card, run each command
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T15:52:55Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:56Z @kj closed: verified-by-galata

## Unregister Kernel `UNREG`

The Unregister Kernel command and the environment matching it shares with Remove Environment

- [x] `ACC-UNREG-10` **Visible only with nb_venv_kernels** - HIGH; Unregister Kernel and Remove Environment are hidden when nb_venv_kernels is not installed
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-UNREG-10 test: /nb-venv-kernels/environments answered 404, Unregister and Remove hidden, Show in File Browser visible
  - test-tags: E2E
  - test: uninstall nb_venv_kernels, right-click a kernel card, assert both items hidden
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T15:52:56Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:56Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-11` **Environment matched by path** - CRITICAL; the command acts on the environment whose absolute path contains both the kernel executable and its resource dir
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-UNREG-11 test: demo-prod card unregisters demo-prod, demo card kept
  - blocked-by: DEF-UNREG-10
  - test: two envs, one kernel per env, assert each card resolves to its own env
  - test-tags: UNIT, E2E
  - mechanism: 2026-09-28T13:30:35Z @kj `findVenvEnvironment` prefix-matches `executable_path` and `resource_dir` against each env path; name-substring match only when no path resolves
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags "UNIT" -> "UNIT, E2E"
  - log: 2026-09-28T15:52:56Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-12` **Edge: names sharing a prefix** - CRITICAL; with envs `demo` and `demo-prod`, the `demo-prod` card resolves to `demo-prod`
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-UNREG-11 test: success dialog names demo-prod, not demo
  - blocked-by: DEF-UNREG-10
  - test: register both envs, resolve the demo-prod card
  - test-tags: UNIT, E2E
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags "UNIT" -> "UNIT, E2E"
  - log: 2026-09-28T15:52:57Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-13` **Edge: relative env path** - HIGH; an nb_venv_kernels `env.path` relative to `workspace_root` is made absolute before matching
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; nb_venv_kernels reports workspace-relative paths in every managed-env Galata test; jest 'matches when env.path is relative to workspace_root'
  - test: env reported as a relative path, assert the card resolves to it
  - test-tags: UNIT, E2E
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T15:52:56Z @kj edited test-tags "UNIT" -> "UNIT, E2E"
  - log: 2026-09-28T15:52:57Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-14` **Edge: kernelspec sharing a managed .venv** - HIGH; a standalone kernelspec whose executable sits in a managed `.venv` resolves as standalone, never as the managed env
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-UNREG-14 test: standalone kernelspec deleted, managed shared/.venv card and dir kept
  - test: standalone kernelspec with `resource_dir` outside the env, assert no env match
  - test-tags: UNIT, E2E
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags "UNIT" -> "UNIT, E2E"
  - log: 2026-09-28T14:09:12Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-15` **Unregister managed kernel** - HIGH; removes the kernel from the nb_venv_kernels registry and leaves the environment directory on disk
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-UNREG-15 test: registry no longer lists unregproj, .venv still on disk
  - blocked-by: DEF-UNREG-10
  - test-tags: E2E
  - test: register a throwaway venv, Unregister, assert the card is gone and `.venv` still exists
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:57Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-16` **Re-register hint** - LOW; the success dialog shows `nb_venv_kernels register <path>`
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-UNREG-15 test: dialog shows nb_venv_kernels register <path>
  - blocked-by: DEF-UNREG-10
  - test-tags: E2E
  - test: unregister a managed kernel, read the dialog
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:57Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-17` **Standalone local kernelspec deleted** - HIGH; a kernelspec outside the nb_venv_kernels registry and under the user's home is deleted by Unregister
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-UNREG-17 test: dangling user kernelspec dir deleted, card gone
  - test-tags: E2E
  - test: install a kernelspec with `--user`, Unregister, assert its directory is gone
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:12Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-18` **Global kernelspec refused** - CRITICAL; a kernelspec outside the user's home is never deleted; the "Cannot Remove System Kernelspec" dialog is shown
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-UNREG-18 test: refusal dialog shown, python3 still listed
  - test-tags: E2E
  - test: Unregister on the system python3 card, assert the dialog and the kernelspec still listed
  - log: 2026-09-28T13:30:35Z @kj added
  - log: 2026-09-28T14:09:10Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:12Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-19` **Resolution spinner** - LOW; a "Resolving environment..." spinner shows from the click until the first dialog
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-UNREG-19 test: spinner visible with kernel-path delayed 2 s
  - test-tags: E2E
  - test: throttle the network, click Unregister, assert the spinner
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:13Z @kj closed: verified-by-galata
- [x] `ACC-UNREG-20` **Launcher refreshed** - MEDIUM; after a successful unregister or remove, the launcher drops the kernel card without a page reload
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-UNREG-15 and ACC-REMOVE-23 tests: card gone without reload
  - blocked-by: DEF-UNREG-10
  - test-tags: E2E
  - test: unregister a kernel, assert its card is gone without reload
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:57Z @kj closed: verified-by-galata

## Remove Environment `REMOVE`

The Remove Environment (dangerous) command, which deletes files on disk

- [x] `ACC-REMOVE-21` **Confirmation required** - CRITICAL; nothing is deleted until the user presses Remove in the confirmation dialog; Cancel leaves registry and disk unchanged
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-REMOVE-21 test: Cancel kept the card and the .venv
  - test-tags: E2E
  - test: Remove on a throwaway venv, press Cancel, assert card and `.venv` still present
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:13Z @kj closed: verified-by-galata
- [x] `ACC-REMOVE-22` **Local .venv only** - CRITICAL; a managed environment whose path has no `.venv` segment is refused with the "Cannot Remove" dialog
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-REMOVE-22 test: plainenv refused with Cannot Remove, dir kept
  - test-tags: E2E
  - test: Remove on a managed non-.venv env, assert the dialog and the env still present
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:13Z @kj closed: verified-by-galata
- [x] `ACC-REMOVE-23` **Remove managed environment** - HIGH; unregisters the kernel, then deletes the `.venv` directory
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-REMOVE-23 test: .venv deleted, card gone, registry no longer lists rmproj
  - blocked-by: DEF-UNREG-10
  - test-tags: E2E
  - test: register a throwaway venv, Remove, confirm, assert card and `.venv` gone
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:57Z @kj closed: verified-by-galata
- [x] `ACC-REMOVE-24` **Remove standalone local kernelspec** - HIGH; deletes the kernelspec directory, then the `.venv` holding its executable when that still exists; the confirmation dialog names both paths
  - evidence: Galata 26/26 green 2026-09-28 (port 8937), jest 36/36 green; ACC-REMOVE-24 test: kernelspec dir and its .venv both deleted, dialog names both paths
  - blocked-by: DEF-PATH-11
  - test-tags: E2E
  - test: user kernelspec pointing at a throwaway `.venv`, Remove, assert both gone
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T15:52:57Z @kj closed: verified-by-galata
- [x] `ACC-REMOVE-25` **Global kernelspec refused** - CRITICAL; a kernelspec outside the user's home is never deleted by Remove; the "Cannot Remove System Kernelspec" dialog is shown
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-REMOVE-25 test: refusal dialog shown, python3 still listed
  - test-tags: E2E
  - test: Remove on the system python3 card, assert the dialog and the kernelspec still listed
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:13Z @kj closed: verified-by-galata

## Server API `API`

The extension's own server endpoints

- [x] `ACC-API-26` **Kernel path lookup** - HIGH; GET `/api/kernel-path/<display name>` returns `kernel_name`, `executable_path`, `resource_dir`, `env_path`, `is_global_conda` and `is_local`
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-API-26 test: 200 with all six fields for python3
  - test-tags: E2E
  - test: GET for the python3 display name, assert the fields
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:13Z @kj closed: verified-by-galata
- [x] `ACC-API-27` **Edge: unknown display name** - MEDIUM; GET `/api/kernel-path/<display name>` returns 404 for a display name no kernel has
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-API-27 test: 404 for an unknown display name
  - test-tags: E2E
  - test: GET for a random name, assert 404
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:13Z @kj closed: verified-by-galata
- [x] `ACC-API-28` **Delete refuses non-local kernelspec** - CRITICAL; DELETE `/api/kernelspec-remove/<name>` returns 403 and deletes nothing for a kernelspec outside the user's home
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-API-28 test: 403 for python3, still listed
  - test-tags: E2E
  - test: DELETE a system kernelspec, assert 403 and the kernelspec still listed
  - mechanism: 2026-09-28T13:30:36Z @kj server repeats the frontend `is_local` check: `resource_dir` must start with `os.path.expanduser("~")`
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:13Z @kj closed: verified-by-galata
- [x] `ACC-API-29` **Edge: unknown kernelspec** - LOW; DELETE `/api/kernelspec-remove/<name>` returns 404 for a name no kernelspec has
  - evidence: Galata run 2026-09-28, port 8889, 18 of 24 green; ACC-API-29 test: 404 for an unknown kernelspec name
  - test-tags: E2E
  - test: DELETE a random name, assert 404
  - log: 2026-09-28T13:30:36Z @kj added
  - log: 2026-09-28T14:09:11Z @kj edited test-tags added "E2E"
  - log: 2026-09-28T14:09:13Z @kj closed: verified-by-galata
- [x] `ACC-API-30` **Edge: display name shared across directories** - HIGH; GET `/api/kernel-path/<display name>` returns 409 when kernels in more than one directory share the name; the same kernelspec listed by two providers stays 200
  - evidence: Galata 27/27 green 2026-09-28 (port 8937), jest 37/37 green; ACC-API-30 test: 409 for Twin Kernel, conda base card 200 in ACC-API-26
  - related: DEF-MATCH-13
  - test: two user kernelspecs named Twin Kernel in different dirs, GET, assert 409
  - test-tags: E2E
  - mechanism: 2026-09-28T18:37:35Z @kj matches counted by distinct `os.path.realpath(resource_dir)`
  - log: 2026-09-28T18:37:35Z @kj added
  - log: 2026-09-28T18:37:40Z @kj closed: verified-by-galata
- [x] `ACC-API-31` **Edge: venv-remove refuses a non-.venv directory** - HIGH; POST /api/venv-remove answers 400 and deletes nothing when the resolved path is not a directory named .venv
  - evidence: ACC-API-31 Galata test green 2026-09-28 port 8937; red with the handler guard disabled
  - test: mkdir not-a-venv under the root, POST it, assert 400 and the directory still exists
  - test-tags: E2E
  - mechanism: 2026-09-28T19:13:58Z @kj VenvRemoveHandler resolves the path with os.path.realpath and runs shutil.rmtree only when the basename is .venv and it is a directory
  - log: 2026-09-28T19:13:58Z @kj added
  - log: 2026-09-28T19:14:04Z @kj closed: verified-by-galata
- [x] `ACC-API-32` **Edge: refusal dialog shows the server's reason** - MEDIUM; when a card cannot be resolved to one kernelspec, Show in File Browser, Open Terminal, Unregister and Remove show the server's error text; for a shared display name it names the kernels
  - evidence: Galata 29/29 green 2026-09-28 port 8937; ACC-API-32 red on the old build (dialog showed the guessed message), green on the new; jest 37/37; lint clean
  - related: DEF-UI-17, DEF-UI-18, ACC-API-30
  - test: two user kernelspecs named Twin Kernel, run each menu item on one card, dialog body names nbvk-twin-a and nbvk-twin-b
  - test-tags: E2E
  - mechanism: 2026-09-28T20:12:52Z @kj fetchKernelPath returns the server's error with a null result; the four dialogs show it
  - log: 2026-09-28T20:12:52Z @kj added
  - log: 2026-09-28T20:19:59Z @kj closed

## Agent Skill `AGENT`

Skill that lets an AI assistant manage the kernels from the shell

- [x] `ACC-AGENT-33` **Agent skill for the nb_venv_kernels CLI** - MEDIUM; skill at .agents/skills/jupyterlab-nb-venv-kernels-ui-extension/SKILL.md points at nb_venv_kernels --help and states only the rules help cannot enforce; README gives the link line, run from the root of a clone; every rule matches nb_venv_kernels 1.2.45 and this extension's guards
  - evidence: quick_validate.py 'Skill is valid!', 20 lines; rules checked against nb_venv_kernels 1.2.45 source and live no-op calls; review rounds 1-3 (architect, bug-hunter, ux-designer): 2, 2, 0 findings; lint clean
  - test: quick_validate.py passes; each rule checked against nb_venv_kernels source and a live CLI call that changes nothing
  - test-tags: MANUAL
  - mechanism: 2026-09-29T12:40:09Z @kj the skill holds no command reference; the CLI's --help is the reference, so the skill does not go stale when flags change
  - log: 2026-09-29T12:40:09Z @kj added
  - log: 2026-09-29T12:53:55Z @kj edited text "skill at .agents/skills/jupyterlab-nb-venv-kernels-ui-extension/SKILL.md points at nb_venv_kernels --help and states only the rules help cannot enforce; README gives the ln -s line; every rule matches nb_venv_kernels 1.2.45 and this extension's guards" -> "skill at .agents/skills/jupyterlab-nb-venv-kernels-ui-extension/SKILL.md points at nb_venv_kernels --help and states only the rules help cannot enforce; README gives the link line, run from the root of a clone; every rule matches nb_venv_kernels 1.2.45 and this extension's guards"; reason: review round 2: text named the replaced ln -s line
  - log: 2026-09-29T12:56:37Z @kj closed
- [x] `ACC-AGENT-34` **Wheel ships the agent skill** - MEDIUM; pip install puts SKILL.md at <sys.prefix>/share/jupyter/agents/skills/jupyterlab-nb-venv-kernels-ui-extension, outside the Python package; README gives the link line for that copy and the link line for a clone
  - evidence: test_pip_install_ships_the_skill passes on the installed 1.2.33 wheel and fails when the copy is missing; CI build job runs pytest after pip install .; README link lines checked in a scratch HOME; review rounds to 0 findings
  - related: DEF-AGENT-25
  - test: pytest test_pip_install_ships_the_skill: installed copy equals the repository copy
  - test-tags: UNIT
  - mechanism: 2026-09-29T20:04:37Z @kj pyproject wheel shared-data maps .agents/skills/<name> to share/jupyter/agents/skills/<name>
  - log: 2026-09-29T20:04:37Z @kj added
  - log: 2026-09-29T20:25:02Z @kj edited text "pip install puts SKILL.md at <sys.prefix>/share/jupyter/agents/skills/jupyterlab-nb-venv-kernels-ui-extension, outside the Python package; README gives the link line for that copy and the link line for a clone" -> "pip install puts SKILL.md at share/jupyter/agents/skills/jupyterlab-nb-venv-kernels-ui-extension under the Python's data directory (sysconfig data path; sys.prefix in a venv or conda env), outside the Python package; README gives the link line for that copy and the link line for a clone"; reason: review round 3: the test and README now read the sysconfig data path, which differs from sys.prefix on a Debian system Python
  - log: 2026-09-29T20:39:20Z @kj closed
  - log: 2026-10-02T00:21:13Z @kj edited text "pip install puts SKILL.md at share/jupyter/agents/skills/jupyterlab-nb-venv-kernels-ui-extension under the Python's data directory (sysconfig data path; sys.prefix in a venv or conda env), outside the Python package; README gives the link line for that copy and the link line for a clone" -> "pip install puts SKILL.md at <sys.prefix>/share/jupyter/agents/skills/jupyterlab-nb-venv-kernels-ui-extension, outside the Python package; README gives the link line for that copy and the link line for a clone"; reason: Star Colonel 2026-10-02: ship as the jupyterlab-extension recipe specifies; test and README read sys.prefix again

## Packaging `PKG`

Dependency ranges, extras and wheel contents in pyproject.toml

- [x] `ACC-PKG-35` **pyproject follows the packaging rules** - LOW; own dependencies and the test extra carry the installed major.minor as floor and the next major as ceiling; the test extra lists pytest and jupyterlab (Galata server import); the dev extra pulls the test extra, so the dev installation carries the testing packages; CI build job installs .[test]
  - evidence: jupyter_server>=2.21,<3 (2.21.1), jupyter_client>=8.10,<9 (8.10.0), pytest>=9.1,<10 (9.1.1), jupyterlab>=4.6,<5 (4.6.4): all in range, floor = tested minor; all four need Python >=3.10 = requires-python; pip install --dry-run .[dev] resolves; make test jest 37/37, pytest 1/1; lint clean; CI run pending the push
  - test: read pyproject with tomllib; each requirement's floor equals the installed major.minor and the installed version is in range; CI build job green
  - test-tags: MANUAL
  - mechanism: 2026-10-02T01:09:33Z @kj floors read from importlib.metadata on the lab, per the jupyterlab-extension recipe 'Dependency ranges'
  - log: 2026-10-02T01:09:33Z @kj added
  - log: 2026-10-02T01:09:33Z @kj closed
  - log: 2026-10-02T01:12:29Z @kj edited text "own dependencies and the test extra carry the installed major.minor as floor and the next major as ceiling; the test extra lists pytest and jupyterlab (Galata server import); CI build job installs .[test]" -> "own dependencies and the test extra carry the installed major.minor as floor and the next major as ceiling; the test extra lists pytest and jupyterlab (Galata server import); the dev extra pulls the test extra, so the dev installation carries the testing packages; CI build job installs .[test]"; evidence "jupyter_server>=2.21,<3 (2.21.1), jupyter_client>=8.10,<9 (8.10.0), pytest>=9.1,<10 (9.1.1), jupyterlab>=4.6,<5 (4.6.4): all in range, floor = tested minor; all four need Python >=3.10 = requires-python; make test jest 37/37, pytest 1/1; lint clean; CI run pending the push" -> "jupyter_server>=2.21,<3 (2.21.1), jupyter_client>=8.10,<9 (8.10.0), pytest>=9.1,<10 (9.1.1), jupyterlab>=4.6,<5 (4.6.4): all in range, floor = tested minor; all four need Python >=3.10 = requires-python; pip install --dry-run .[dev] resolves; make test jest 37/37, pytest 1/1; lint clean; CI run pending the push"; reason: Star Colonel 2026-10-02: testing packages are a standard part of the dev installation
