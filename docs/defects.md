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
- [x] `DEF-UI-17` **Refusal dialog drops the server's reason** - MINOR; a card whose display name is shared by kernels in two directories gets a dialog that guesses between two causes; the server's 409 names the kernels, but fetchKernelPath logs it to the console and returns null; src/index.ts
  - evidence: Galata 29/29 green 2026-09-28 port 8937; ACC-API-32 red on the old build (dialog showed the guessed message), green on the new; jest 37/37; lint clean
  - related: DEF-UI-18, DEF-MATCH-13, ACC-API-32 - one fix in fetchKernelPath
  - repro: two user kernelspecs named Twin Kernel in different dirs, Remove on one card, read the dialog
  - test-tags: E2E
  - root-cause: 2026-09-28T20:12:52Z @kj fetchKernelPath returns null on a failed lookup, so callers never see data.error
  - log: 2026-09-28T20:12:52Z @kj added
  - log: 2026-09-28T20:19:58Z @kj closed
- [x] `DEF-UI-18` **Resolve-failure message copied into four dialogs** - MINOR; one 170-character message is written out at 4 sites in src/index.ts (Show in File Browser, Open Terminal, Unregister, Remove); a wording change must edit all 4
  - evidence: grep -c 'Could not resolve kernel' src/index.ts gives 1 (network-failure fallback); the four dialogs show the reason from fetchKernelPath; Galata 29/29 green 2026-09-28 port 8937; ACC-API-32 red on the old build (dialog showed the guessed message), green on the new; jest 37/37; lint clean
  - related: DEF-UI-17 - same fix
  - repro: grep -c 'Could not resolve kernel' src/index.ts gives 4
  - test-tags: E2E
  - root-cause: 2026-09-28T20:12:52Z @kj with no reason from fetchKernelPath, each dialog wrote its own copy of the guessed message
  - log: 2026-09-28T20:12:52Z @kj added
  - log: 2026-09-28T20:19:58Z @kj closed
- [x] `DEF-UI-19` **Empty server error gives an empty dialog** - MINOR; fetchKernelPath falls back to 'Server answered <status>' only when data.error is null or undefined; a 500 whose exception has an empty message (str(e) == '') shows a dialog with a title and no body; src/index.ts
  - evidence: built bundle has n.error||`Server answered ${e.status}`; node: ({error:''}).error || 'Server answered 500' gives 'Server answered 500'; str(asyncio.TimeoutError()) is ''; jest 37/37, Galata 29/29 2026-09-28
  - related: DEF-UI-17 - same fetchKernelPath change
  - repro: make get_all_specs raise a bare TimeoutError, run any of the four menu items
  - test-tags: MANUAL
  - root-cause: 2026-09-28T20:25:54Z @kj the fallback uses ?? instead of ||, so an empty string is kept
  - log: 2026-09-28T20:25:54Z @kj added
  - log: 2026-09-28T20:29:25Z @kj closed
- [x] `DEF-UI-20` **Shared-name refusal does not say how to fix it** - MINOR; the 409 text from /api/kernel-path names the colliding kernels but ends with 'the card cannot be resolved to one kernel'; it no longer tells the user to give each kernelspec its own display_name; handlers.py
  - evidence: ACC-API-32 now asserts 'distinct display_name' in all four dialogs: red on the round-4 build, green on the new; Galata 29/29 2026-09-28 port 8937; jest 37/37; lint clean
  - related: DEF-UI-18, ACC-API-32 - fix instruction lost with the copied message
  - repro: two user kernelspecs named Twin Kernel, Remove on one card, read the dialog
  - test-tags: E2E
  - root-cause: 2026-09-28T20:25:54Z @kj the 409 message states the cause only; the fix instruction lived in the frontend copy that DEF-UI-18 removed
  - log: 2026-09-28T20:25:54Z @kj added
  - log: 2026-09-28T20:29:25Z @kj closed
- [x] `DEF-UI-21` **Shared-name hint points at kernel.json wrongly** - MINOR; the 409 text says 'give each a distinct display_name in its kernel.json'; when both kernels sit in one managed venv, nb_venv_kernels builds both names from name_format, so editing kernel.json changes nothing; handlers.py
  - evidence: 409 text now ends 'give each a distinct display_name'; ACC-API-32 asserts no 'kernel.json': red on the round-5 build, green on the new; Galata 29/29 2026-09-28 port 8937; jest 37/37; lint clean
  - related: DEF-UI-20 - hint added there
  - repro: one managed venv with two Python kernelspecs, default name_format, Remove on its card
  - test-tags: E2E
  - root-cause: 2026-09-28T20:34:34Z @kj the hint names kernel.json as the place to fix, but for managed envs the launcher name comes from name_format
  - log: 2026-09-28T20:34:34Z @kj added
  - log: 2026-09-28T20:37:57Z @kj closed

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

## Agent Skill `AGENT`

The agent skill for the nb_venv_kernels CLI

- [x] `DEF-AGENT-22` **Kernelspec delete rule does not ask first** - MAJOR; SKILL.md rule for standalone kernelspecs prescribes jupyter kernelspec remove -f with no ask, while the .venv rule asks; -f skips jupyter's own prompt, so an agent deletes without the user's word; the menu shows a Cancel/Remove dialog first
  - evidence: kernelspec rule now ends 'Ask user first; cannot undo', same as the .venv rule; both delete rules ask; quick_validate.py passes; lint clean
  - related: ACC-AGENT-33
  - repro: read the kernelspec rule in .agents/skills/jupyterlab-nb-venv-kernels-ui-extension/SKILL.md
  - test-tags: MANUAL
  - root-cause: 2026-09-29T12:49:45Z @kj the ask was written on the .venv rule only
  - log: 2026-09-29T12:49:45Z @kj added
  - log: 2026-09-29T12:50:14Z @kj closed
- [x] `DEF-AGENT-23` **README link line loops on re-run** - MINOR; ln -s run a second time creates a loop link .agents/skills/<name>/<name> inside the clone, and fails with 'No such file or directory' when ~/.claude/skills is absent
  - evidence: README line now 'mkdir -p ~/.claude/skills && ln -sfn ...'; run twice in a scratch HOME: both exit 0, no loop link inside the skill dir
  - related: ACC-AGENT-33
  - repro: run the README ln -s line twice, then ls .agents/skills/jupyterlab-nb-venv-kernels-ui-extension
  - test-tags: MANUAL
  - root-cause: 2026-09-29T12:49:45Z @kj ln -s follows an existing link to a directory and creates the new link inside it; nothing creates ~/.claude/skills
  - log: 2026-09-29T12:49:45Z @kj added
  - log: 2026-09-29T12:50:14Z @kj closed
- [x] `DEF-AGENT-24` **Link line breaks the link when run outside the clone root** - MINOR; ln -sfn with $PWD run from a subdirectory replaces a working link with a dangling one and exits 0; the README said only 'from a clone'
  - evidence: README now says 'from the root of a clone', where $PWD is the clone root; the ln -sfn line stays; prettier and lint clean
  - related: DEF-AGENT-23 - -f added there
  - repro: link from the clone root, then run the README line from docs/, then test -e ~/.claude/skills/jupyterlab-nb-venv-kernels-ui-extension
  - test-tags: MANUAL
  - root-cause: 2026-09-29T12:53:55Z @kj -f replaces the link, and $PWD is the current directory, not the clone root
  - log: 2026-09-29T12:53:55Z @kj added
  - log: 2026-09-29T12:54:15Z @kj closed
