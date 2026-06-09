import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { ILauncher } from '@jupyterlab/launcher';
import { ITerminalTracker } from '@jupyterlab/terminal';
import { showErrorMessage, showDialog, Dialog } from '@jupyterlab/apputils';
import { ServerConnection } from '@jupyterlab/services';
import { URLExt, PageConfig } from '@jupyterlab/coreutils';
import { Widget } from '@lumino/widgets';

/**
 * Command IDs for the extension.
 */
const SHOW_IN_BROWSER_CMD = 'launcher:show-kernel-in-file-browser';
const OPEN_TERMINAL_CMD = 'launcher:open-terminal-at-kernel';
const UNREGISTER_KERNEL_CMD = 'launcher:unregister-venv-kernel';
const REMOVE_ENVIRONMENT_CMD = 'launcher:remove-venv-environment';

/**
 * Command ID for nb_venv_kernels refresh (provided by that extension).
 */
const NB_VENV_KERNELS_REFRESH_CMD = 'nb_venv_kernels:refresh';

/**
 * Interface for the kernel path API response.
 */
interface IKernelPathResponse {
  kernel_name: string;
  display_name: string;
  resource_dir: string;
  executable_path: string | null;
  env_path: string | null;
  is_global_conda: boolean;
  /**
   * True when the kernelspec's `resource_dir` is under the user's home
   * directory (e.g. `~/.local/share/jupyter/kernels/`). Local kernelspecs
   * may be removed by the plugin via `DELETE /api/kernelspecs/<name>`
   * when not managed by nb_venv_kernels; global / system kernelspecs may
   * not - they require admin action.
   */
  is_local: boolean;
  error?: string;
}

/**
 * Interface for nb_venv_kernels environment entry.
 */
interface IVenvEnvironment {
  name: string;
  custom_name: string | null;
  type: string;
  exists: boolean;
  has_kernel: boolean;
  path: string;
}

/**
 * Interface for nb_venv_kernels environments list response.
 */
interface IVenvEnvironmentsResponse {
  environments: IVenvEnvironment[];
  workspace_root: string;
}

/**
 * Interface for nb_venv_kernels unregister response.
 */
interface IUnregisterResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Show loading dialog with spinner
 *
 * @param message - The message to display next to the spinner
 * @returns The dialog instance that can be disposed to close it
 */
function showLoadingDialog(message: string): Dialog<unknown> {
  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.alignItems = 'center';
  content.style.gap = '12px';
  content.style.padding = '8px 0';
  content.innerHTML = `
    <div style="
      width: 24px;
      height: 24px;
      border: 3px solid var(--jp-border-color2);
      border-top-color: var(--jp-brand-color1);
      border-radius: 50%;
      animation: launcher-ext-spin 1s linear infinite;
    "></div>
    <span>${message}</span>
    <style>
      @keyframes launcher-ext-spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;

  const body = new Widget({ node: content });

  const dialog = new Dialog({
    title: 'Please Wait',
    body,
    buttons: []
  });

  dialog.launch();
  return dialog;
}

/**
 * Data attribute stamped on launcher cards that represent a kernel.
 *
 * Presence of the attribute is the explicit "this card is a kernel" marker
 * that the context menu selector in `schema/plugin.json` keys off - so the
 * menu never appears on Terminal, Text File, service, or other non-kernel
 * cards. The attribute value is the kernel display name, used for path
 * resolution when a command runs.
 */
const KERNEL_CARD_ATTR = 'data-jp-kernel-display-name';

/**
 * Flag indicating whether nb_venv_kernels extension is available.
 * Checked once at startup.
 */
let nbVenvKernelsAvailable = false;

/**
 * Fetch the kernel path information from the server.
 *
 * @param displayName - The display name of the kernel
 * @returns Promise resolving to kernel path info or null if not available
 */
async function fetchKernelPath(
  displayName: string
): Promise<IKernelPathResponse | null> {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(
    settings.baseUrl,
    'api',
    'kernel-path',
    encodeURIComponent(displayName)
  );

  try {
    const response = await ServerConnection.makeRequest(url, {}, settings);

    if (!response.ok) {
      const data = (await response.json()) as IKernelPathResponse;
      console.warn(`Failed to get kernel path: ${data.error}`);
      return null;
    }

    const data = (await response.json()) as IKernelPathResponse;
    return data;
  } catch (error) {
    console.error('Error fetching kernel path:', error);
    return null;
  }
}

/**
 * Check if nb_venv_kernels extension is available.
 *
 * @returns Promise resolving to true if available, false otherwise
 */
async function checkNbVenvKernelsAvailable(): Promise<boolean> {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(settings.baseUrl, 'nb-venv-kernels', 'environments');

  try {
    const response = await ServerConnection.makeRequest(url, {}, settings);
    return response.ok;
  } catch (error) {
    console.debug('nb_venv_kernels extension not installed:', error);
    return false;
  }
}

/**
 * Fetch list of venv environments from nb_venv_kernels API.
 *
 * @returns Promise resolving to environments list or null if not available
 */
async function fetchVenvEnvironments(): Promise<IVenvEnvironmentsResponse | null> {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(settings.baseUrl, 'nb-venv-kernels', 'environments');

  try {
    const response = await ServerConnection.makeRequest(url, {}, settings);

    if (!response.ok) {
      console.warn('nb_venv_kernels API not available');
      return null;
    }

    const data = (await response.json()) as IVenvEnvironmentsResponse;
    return data;
  } catch (error) {
    console.debug('nb_venv_kernels extension not installed:', error);
    return null;
  }
}

/**
 * Resolve an nb_venv_kernels environment path to an absolute path.
 *
 * nb_venv_kernels reports `env.path` relative to its `workspace_root` (e.g.
 * `delaval/.../datascience/.venv`); the kernelspec `argv[0]` we compare it
 * against is absolute. Join them so the prefix check works.
 *
 * @param envPath - The `path` field from an nb_venv_kernels environment
 * @param workspaceRoot - The `workspace_root` field from the environments response
 * @returns The absolute path, or null if it cannot be resolved
 */
function absoluteEnvPath(
  envPath: string,
  workspaceRoot: string | undefined
): string | null {
  if (!envPath) {
    return null;
  }
  if (envPath.startsWith('/')) {
    return envPath.replace(/\/+$/, '');
  }
  if (!workspaceRoot || !workspaceRoot.startsWith('/')) {
    return null;
  }
  return (
    workspaceRoot.replace(/\/+$/, '') + '/' + envPath.replace(/^\/+|\/+$/g, '')
  );
}

/**
 * Find a venv environment matching the given display name.
 *
 * Deterministic path-based matching: a kernel "belongs to" an env only if
 * BOTH its `executable_path` AND its `resource_dir` are under the env's
 * absolute path. The first prefix alone is not enough - a standalone
 * kernelspec (installed via `ipython kernel install`) whose `argv[0]` just
 * happens to point at another env's `.venv/bin/python` lives in
 * `~/.local/share/jupyter/kernels/<name>/`, not inside the env tree, so it
 * must NOT be resolved to that env (otherwise Remove Environment would
 * delete the shared .venv when the user only wanted to drop the
 * standalone kernel). nb_venv_kernels' synthesized dynamic kernels have
 * their `resource_dir` under the env (typically
 * `<env_path>/share/jupyter/kernels/...`), so they pass both checks.
 *
 * Falls back to substring matching on env names when neither path is
 * available, or when none of the env paths could be resolved to absolute
 * (old nb_venv_kernels without `workspace_root`).
 *
 * @param displayName - The kernel display name (used for fallback match)
 * @param executablePath - The kernel's `argv[0]` python path, if known
 * @param resourceDir - The kernelspec's `resource_dir`, if known
 * @returns The matching environment or null
 */
async function findVenvEnvironment(
  displayName: string,
  executablePath?: string | null,
  resourceDir?: string | null
): Promise<IVenvEnvironment | null> {
  const envData = await fetchVenvEnvironments();
  if (!envData) {
    return null;
  }

  // Path-based match (preferred) - both prefixes must be under the env's
  // absolute path. If we have absolute paths AND at least one env path
  // resolved, we trust the result: a non-match is then definitive (kernel
  // not registered with nb_venv_kernels), so we do NOT fall back to
  // substring matching - that would re-introduce the very collision bug
  // this function prevents.
  if (
    executablePath &&
    executablePath.startsWith('/') &&
    resourceDir &&
    resourceDir.startsWith('/')
  ) {
    let attemptedPathMatch = false;
    for (const env of envData.environments) {
      if (env.type === 'conda') {
        continue;
      }
      const envAbs = absoluteEnvPath(env.path, envData.workspace_root);
      if (!envAbs) {
        continue;
      }
      attemptedPathMatch = true;
      const prefix = envAbs + '/';
      if (executablePath.startsWith(prefix) && resourceDir.startsWith(prefix)) {
        return env;
      }
    }
    if (attemptedPathMatch) {
      return null;
    }
    // No env path could be resolved to absolute - fall through to substring.
  }

  // Fallback: substring match on env names, used when executablePath is
  // missing or relative (e.g. nb_venv_kernels did not rewrite argv[0] for
  // the current env). Sort by name length descending so longer names try
  // first - mitigates substring collisions when path matching is
  // unavailable.
  const candidates = envData.environments
    .filter(env => env.type !== 'conda')
    .slice()
    .sort((a, b) => {
      const aLen = Math.max(
        (a.name || '').length,
        (a.custom_name || '').length
      );
      const bLen = Math.max(
        (b.name || '').length,
        (b.custom_name || '').length
      );
      return bLen - aLen;
    });

  for (const env of candidates) {
    const envName = env.name || '';
    const customName = env.custom_name || '';
    if (
      (envName && displayName.includes(envName)) ||
      (customName && displayName.includes(customName))
    ) {
      return env;
    }
  }

  return null;
}

/**
 * Unregister a venv environment via nb_venv_kernels API.
 *
 * @param envPath - The path of the environment to unregister
 * @returns Promise resolving to unregister result
 */
async function unregisterVenvKernel(
  envPath: string
): Promise<IUnregisterResponse> {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(settings.baseUrl, 'nb-venv-kernels', 'unregister');

  try {
    const response = await ServerConnection.makeRequest(
      url,
      {
        method: 'POST',
        body: JSON.stringify({ path: envPath })
      },
      settings
    );

    const data = (await response.json()) as IUnregisterResponse;

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to unregister kernel'
      };
    }

    return { success: true, message: data.message };
  } catch (error) {
    console.error('Error unregistering kernel:', error);
    return {
      success: false,
      error: `Network error: ${error}`
    };
  }
}

/**
 * Check if an environment path is a local .venv environment.
 * Local environments have .venv in their path.
 *
 * @param envPath - The environment path to check
 * @returns true if the environment is local (.venv based)
 */
function isLocalVenvEnvironment(envPath: string): boolean {
  return envPath.includes('/.venv') || envPath.includes('\\.venv');
}

/**
 * Remove a directory via the Jupyter server contents API.
 *
 * @param dirPath - The absolute path to the directory to remove
 * @param serverRoot - The server root directory
 * @returns Promise resolving to success status and optional error message
 */
async function removeDirectory(
  dirPath: string,
  serverRoot: string
): Promise<{ success: boolean; error?: string }> {
  const settings = ServerConnection.makeSettings();

  // Determine relative path for the contents API
  let relativePath: string | null = null;

  // If path doesn't start with '/', it's already relative - use it directly
  if (!dirPath.startsWith('/')) {
    relativePath = dirPath;
    console.debug(`Path is already relative: ${relativePath}`);
  } else {
    // Convert absolute path to relative path
    relativePath = toRelativePath(dirPath, serverRoot);

    // If standard conversion fails, try alternative approaches
    if (relativePath === null) {
      console.debug(
        `Path conversion failed: dirPath="${dirPath}", serverRoot="${serverRoot}"`
      );

      // Fallback: if serverRoot is empty or '~', try using home-relative path
      if (!serverRoot || serverRoot === '~' || serverRoot === '') {
        // Extract path from after '/home/username' or similar
        const homeMatch = dirPath.match(/^\/(?:home|Users)\/[^/]+\/(.+)$/);
        if (homeMatch) {
          relativePath = homeMatch[1];
          console.debug(`Using home-relative fallback path: ${relativePath}`);
        }
      }

      // If still null, the path is truly outside workspace
      if (relativePath === null) {
        return {
          success: false,
          error: `Environment path "${dirPath}" is outside the workspace (root: "${serverRoot}") and cannot be removed.`
        };
      }
    }
  }

  const url = URLExt.join(settings.baseUrl, 'api', 'contents', relativePath);

  try {
    const response = await ServerConnection.makeRequest(
      url,
      { method: 'DELETE' },
      settings
    );

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Server error: ${response.status} ${text}`
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing directory:', error);
    return {
      success: false,
      error: `Network error: ${error}`
    };
  }
}

/**
 * Delete a Jupyter kernelspec via our extension's backend endpoint.
 *
 * Uses `DELETE /api/kernelspec-remove/<kernel_name>` which we provide
 * because jupyter_server's standard `/api/kernelspecs/<name>` only
 * implements GET (it returns 405 Method Not Allowed for DELETE).
 *
 * The backend additionally refuses to delete a kernelspec whose
 * `resource_dir` is not under the user's home - a defense in depth on
 * top of the frontend's `is_local` check at the call site.
 *
 * @param kernelName - The kernelspec name (not display name)
 * @returns success status and optional error message
 */
async function deleteKernelspec(
  kernelName: string
): Promise<{ success: boolean; error?: string }> {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(
    settings.baseUrl,
    'api',
    'kernelspec-remove',
    encodeURIComponent(kernelName)
  );
  try {
    const response = await ServerConnection.makeRequest(
      url,
      { method: 'DELETE' },
      settings
    );
    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.error || JSON.stringify(body);
      } catch {
        detail = await response.text();
      }
      return {
        success: false,
        error: `Server error: ${response.status} ${detail}`
      };
    }
    return { success: true };
  } catch (error) {
    console.error('Error deleting kernelspec:', error);
    return { success: false, error: `Network error: ${error}` };
  }
}

/**
 * Show a refusal dialog for global kernelspecs that are not managed by
 * nb_venv_kernels.
 *
 * @param displayName - The kernel display name (for the title)
 * @param resourceDir - The kernelspec directory (shown to the user)
 */
async function refuseGlobalKernelspec(
  displayName: string,
  resourceDir: string
): Promise<void> {
  const body = new Widget();
  const p1 = document.createElement('p');
  p1.textContent = `"${displayName}" is a system kernelspec not managed by nb_venv_kernels.`;
  const p2 = document.createElement('p');
  p2.textContent = `It lives at: ${resourceDir}`;
  const p3 = document.createElement('p');
  p3.textContent =
    'Global kernelspecs can only be removed manually (e.g. by an administrator). ' +
    'To remove it, run: jupyter kernelspec uninstall <name>';
  body.node.appendChild(p1);
  body.node.appendChild(p2);
  body.node.appendChild(p3);
  await showDialog({
    title: 'Cannot Remove System Kernelspec',
    body,
    buttons: [Dialog.okButton()]
  });
}

/**
 * Expand tilde in path using the home directory extracted from absolutePath.
 *
 * @param path - Path that may contain ~
 * @param absolutePath - An absolute path to extract home directory from
 * @returns Path with ~ expanded, or original if expansion not possible
 */
function expandTilde(path: string, absolutePath: string): string {
  if (!path.startsWith('~')) {
    return path;
  }

  // Extract home directory from absolute path
  // Matches /home/username or /Users/username
  const match = absolutePath.match(/^(\/(?:home|Users)\/[^/]+)/);
  if (!match) {
    return path;
  }

  const homedir = match[1];
  if (path === '~') {
    return homedir;
  }
  if (path.startsWith('~/')) {
    return homedir + path.slice(1);
  }
  return path;
}

/**
 * Convert an absolute filesystem path to a path relative to the server root.
 *
 * @param absolutePath - The absolute filesystem path
 * @param serverRoot - The server's root directory (may contain ~)
 * @returns The relative path for the file browser, or null if outside server root
 */
function toRelativePath(
  absolutePath: string,
  serverRoot: string
): string | null {
  // Normalize path - ensure no trailing slashes
  const normalizedPath = absolutePath.replace(/\/+$/, '');

  // Expand tilde in serverRoot and normalize
  const normalizedRoot = expandTilde(serverRoot, absolutePath).replace(
    /\/+$/,
    ''
  );

  // Check if path is the server root
  if (normalizedPath === normalizedRoot) {
    return '';
  }

  // Check if path is inside the server root
  const rootPrefix = normalizedRoot + '/';
  if (normalizedPath.startsWith(rootPrefix)) {
    return normalizedPath.slice(rootPrefix.length);
  }

  // Path is outside the server root
  return null;
}

/**
 * Determine whether a launcher card represents a kernel and, if so, return
 * its display name.
 *
 * JupyterLab renders kernel launcher cards (Notebook / Console items backed
 * by a kernelspec) with an `<img class="jp-Launcher-kernelIcon">` showing
 * the kernelspec logo; non-kernel cards (Terminal, Text File, services,
 * etc.) render an inline `<svg>` icon instead. This is the only signal that
 * survives category renaming / localization, so we use it - but only to
 * decide whether to stamp the card. Everything downstream keys off the
 * explicit {@link KERNEL_CARD_ATTR} attribute we write, never the icon.
 *
 * @param card - A `.jp-LauncherCard` element
 * @returns The kernel display name, or null if the card is not a kernel
 */
function kernelDisplayNameForCard(card: HTMLElement): string | null {
  const icon = card.querySelector<HTMLImageElement>(
    'img.jp-Launcher-kernelIcon'
  );
  if (!icon) {
    return null;
  }
  const label = card
    .querySelector('.jp-LauncherCard-label')
    ?.textContent?.trim();
  const displayName = (icon.alt || label || card.title || '').trim();
  return displayName || null;
}

/**
 * Stamp the kernel descriptor onto a single launcher card if it is a kernel
 * card. Idempotent.
 *
 * @param card - A `.jp-LauncherCard` element
 */
function enrichKernelCard(card: HTMLElement): void {
  if (card.hasAttribute(KERNEL_CARD_ATTR)) {
    return;
  }
  const displayName = kernelDisplayNameForCard(card);
  if (displayName) {
    card.setAttribute(KERNEL_CARD_ATTR, displayName);
    // Best-effort: fetch kernel info in the background and rewrite the
    // native `title` so the standard hover tooltip shows display name +
    // kernel name + kind + paths instead of just the display name.
    enhanceKernelCardTitle(card, displayName).catch(() => {
      // Swallow - title enrichment is a UX nicety, not load-critical.
    });
  }
}

/**
 * Scan a subtree for launcher cards and enrich any kernel cards under it.
 *
 * @param root - A DOM node to search within (inclusive of itself)
 */
function enrichKernelCardsIn(root: ParentNode): void {
  if (
    root instanceof HTMLElement &&
    root.classList.contains('jp-LauncherCard')
  ) {
    enrichKernelCard(root);
  }
  root
    .querySelectorAll<HTMLElement>('.jp-LauncherCard')
    .forEach(enrichKernelCard);
}

/**
 * Watch the shell for launcher cards being rendered and stamp the kernel
 * descriptor on every kernel card - including ones added later, e.g. after
 * an environment scan re-renders the launcher body.
 *
 * @param shellNode - The application shell DOM node to observe
 */
function observeLauncherCards(shellNode: HTMLElement): void {
  // Stamp anything already present (a launcher may be open at startup).
  enrichKernelCardsIn(shellNode);

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) {
          enrichKernelCardsIn(node);
        }
      });
    }
  });
  observer.observe(shellNode, { childList: true, subtree: true });
}

/**
 * Return the kernel display name from the launcher card under the last
 * context menu invocation, or null if the menu was not opened on a kernel
 * card. Uses JupyterLab's context-menu hit-test API - no global state, no
 * guessing.
 *
 * @param app - The JupyterLab application
 * @returns The kernel display name, or null
 */
function clickedKernelDisplayName(app: JupyterFrontEnd): string | null {
  const card = app.contextMenuHitTest(node =>
    node.hasAttribute(KERNEL_CARD_ATTR)
  );
  return card?.getAttribute(KERNEL_CARD_ATTR) ?? null;
}

/**
 * Cache of kernel-path responses keyed by display name. Each kernel card
 * fires a single background fetch on enrichment; cards rendered later for
 * the same kernel reuse the cached info.
 */
const kernelInfoCache = new Map<string, IKernelPathResponse>();

/**
 * In-flight fetches keyed by display name, so two cards for the same
 * kernel (e.g. one in Notebook section, one in Console) share a single
 * round-trip instead of racing.
 */
const kernelInfoInflight = new Map<
  string,
  Promise<IKernelPathResponse | null>
>();

/**
 * Build a multi-line plain-text tooltip body for a kernel.
 *
 * Browsers render `\n` in the `title` attribute as line breaks in the
 * native hover tooltip, so this is just the standard JupyterLab card
 * tooltip with extra rows underneath the display name.
 */
function buildKernelTooltipText(
  displayName: string,
  info: IKernelPathResponse
): string {
  let kind: string;
  if (info.is_global_conda) {
    kind = 'Global conda environment';
  } else if (info.is_local) {
    kind = 'Local kernelspec';
  } else {
    kind = 'System kernelspec';
  }
  const lines: string[] = [displayName, ''];
  lines.push(`Kernel name:   ${info.kernel_name}`);
  lines.push(`Kind:          ${kind}`);
  if (info.executable_path) {
    lines.push(`Executable:    ${info.executable_path}`);
  }
  if (info.resource_dir) {
    lines.push(`Resource dir:  ${info.resource_dir}`);
  }
  if (info.env_path) {
    lines.push(`Env path:      ${info.env_path}`);
  }
  return lines.join('\n');
}

/**
 * Fetch kernel info (cached) and write the rich multi-line text into the
 * card's native `title` attribute - the standard browser hover tooltip
 * then shows display name plus kernel name, kind, executable, resource
 * dir, env path without any custom popup.
 *
 * Both the card and its inner `.jp-LauncherCard-label` carry a `title`;
 * the label sits on top so we update both to keep behaviour consistent
 * regardless of which sub-element the cursor lands on.
 */
async function enhanceKernelCardTitle(
  card: HTMLElement,
  displayName: string
): Promise<void> {
  let info = kernelInfoCache.get(displayName) ?? null;
  if (!info) {
    let pending = kernelInfoInflight.get(displayName);
    if (!pending) {
      pending = fetchKernelPath(displayName).then(result => {
        if (result) {
          kernelInfoCache.set(displayName, result);
        }
        kernelInfoInflight.delete(displayName);
        return result;
      });
      kernelInfoInflight.set(displayName, pending);
    }
    info = await pending;
  }
  if (!info) {
    return;
  }
  const tooltip = buildKernelTooltipText(displayName, info);
  card.setAttribute('title', tooltip);
  const label = card.querySelector<HTMLElement>('.jp-LauncherCard-label');
  if (label) {
    label.setAttribute('title', tooltip);
  }
}

/**
 * Initialization data for the jupyterlab_nb_venv_kernels_ui_extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_nb_venv_kernels_ui_extension:plugin',
  description:
    "Right-click kernel launcher cards to navigate file browser to kernel's location or open terminal there",
  autoStart: true,
  requires: [IDefaultFileBrowser],
  optional: [ILauncher, ITerminalTracker],
  activate: (
    app: JupyterFrontEnd,
    fileBrowser: IDefaultFileBrowser,
    launcher: ILauncher | null,
    terminalTracker: ITerminalTracker | null
  ) => {
    console.log(
      'JupyterLab extension jupyterlab_nb_venv_kernels_ui_extension is activated!'
    );

    const { commands } = app;

    // Get the server root directory from PageConfig
    const serverRoot = PageConfig.getOption('serverRoot');

    // Stamp an explicit kernel descriptor on every kernel launcher card so
    // the context menu (registered in schema/plugin.json against
    // `.jp-LauncherCard[data-jp-kernel-display-name]`) only ever appears on
    // kernel cards - never on Terminal, Text File, service, or other cards.
    observeLauncherCards(app.shell.node);

    // Check if nb_venv_kernels is available (for unregister feature)
    checkNbVenvKernelsAvailable().then(available => {
      nbVenvKernelsAvailable = available;
      if (available) {
        console.log(
          'nb_venv_kernels extension detected - unregister feature enabled'
        );
      }
    });

    // Add the "Show in File Browser" command
    commands.addCommand(SHOW_IN_BROWSER_CMD, {
      label: 'Show in File Browser',
      caption: "Navigate file browser to kernel's directory",
      isEnabled: () => clickedKernelDisplayName(app) !== null,
      execute: async () => {
        const displayName = clickedKernelDisplayName(app);
        if (!displayName) {
          await showErrorMessage(
            'No Kernel Selected',
            'Could not determine which kernel was selected.'
          );
          return;
        }

        const kernelInfo = await fetchKernelPath(displayName);

        if (!kernelInfo) {
          await showErrorMessage(
            'Kernel Not Found',
            `Could not find path information for kernel "${displayName}".`
          );
          return;
        }

        // Check if this is a global conda environment
        if (kernelInfo.is_global_conda) {
          const content = document.createElement('div');
          content.innerHTML = `
            <p>Global conda environments are not associated with any specific project location.</p>
            <p>The environment <strong>${displayName}</strong> is installed at:</p>
            <p><code>${kernelInfo.env_path || kernelInfo.resource_dir}</code></p>
          `;
          const body = new Widget({ node: content });
          await showDialog({
            title: 'Global Conda Environment',
            body,
            buttons: [Dialog.okButton()]
          });
          return;
        }

        // Prefer env_path (conda environment) if available, otherwise use resource_dir
        const targetPath = kernelInfo.env_path || kernelInfo.resource_dir;

        // Convert to relative path for file browser
        const relativePath = toRelativePath(targetPath, serverRoot);

        // If outside workspace, fallback to workspace root
        const navigatePath = relativePath === null ? '' : relativePath;

        try {
          const absolutePath = navigatePath === '' ? '/' : '/' + navigatePath;
          await fileBrowser.model.cd(absolutePath);
        } catch (error) {
          console.error('Failed to navigate file browser:', error);
          await showErrorMessage(
            'Navigation Error',
            `Failed to navigate to: ${targetPath}\nError: ${error}`
          );
        }
      }
    });

    // Add the "Open Terminal at location" command
    commands.addCommand(OPEN_TERMINAL_CMD, {
      label: 'Open Terminal at Location',
      caption: "Open a terminal at the kernel's directory",
      isEnabled: () =>
        clickedKernelDisplayName(app) !== null && terminalTracker !== null,
      execute: async () => {
        const displayName = clickedKernelDisplayName(app);
        if (!displayName) {
          await showErrorMessage(
            'No Kernel Selected',
            'Could not determine which kernel was selected.'
          );
          return;
        }

        const kernelInfo = await fetchKernelPath(displayName);

        if (!kernelInfo) {
          await showErrorMessage(
            'Kernel Not Found',
            `Could not find path information for kernel "${displayName}".`
          );
          return;
        }

        // Check if this is a global conda environment
        if (kernelInfo.is_global_conda) {
          const content = document.createElement('div');
          content.innerHTML = `
            <p>Global conda environments are not associated with any specific project location.</p>
            <p>The environment <strong>${displayName}</strong> is installed at:</p>
            <p><code>${kernelInfo.env_path || kernelInfo.resource_dir}</code></p>
          `;
          const body = new Widget({ node: content });
          await showDialog({
            title: 'Global Conda Environment',
            body,
            buttons: [Dialog.okButton()]
          });
          return;
        }

        // Prefer env_path (conda environment) if available, otherwise use resource_dir
        const targetPath = kernelInfo.env_path || kernelInfo.resource_dir;

        // Convert to relative path for terminal (terminal:create-new requires relative path)
        const relativePath = toRelativePath(targetPath, serverRoot);

        // If outside workspace, use empty string (workspace root)
        const terminalCwd = relativePath === null ? '' : relativePath;

        try {
          // Open a new terminal with relative path
          await commands.execute('terminal:create-new', {
            cwd: terminalCwd
          });
        } catch (error) {
          console.error('Failed to open terminal:', error);
          await showErrorMessage(
            'Terminal Error',
            `Failed to open terminal at: ${targetPath}\nError: ${error}`
          );
        }
      }
    });

    // Add the "Unregister Kernel" command (shown when nb_venv_kernels is available)
    commands.addCommand(UNREGISTER_KERNEL_CMD, {
      label: 'Unregister Kernel',
      caption: 'Remove this kernel from nb_venv_kernels registry',
      isEnabled: () =>
        clickedKernelDisplayName(app) !== null && nbVenvKernelsAvailable,
      isVisible: () => nbVenvKernelsAvailable,
      execute: async () => {
        const displayName = clickedKernelDisplayName(app);
        if (!displayName) {
          await showErrorMessage(
            'No Kernel Selected',
            'Could not determine which kernel was selected.'
          );
          return;
        }

        // Resolving the kernel path and the matching env requires server
        // round-trips that can take a moment; show a spinner so the user
        // sees the click registered before anything else appears.
        const resolveDialog = showLoadingDialog('Resolving environment...');

        // Resolve the kernel's executable path so we can match envs by path
        // rather than by name substring (avoids picking the wrong env when
        // names share a prefix, e.g. `demo` vs `demo-prod`).
        let kernelInfo: IKernelPathResponse | null;
        let env: IVenvEnvironment | null;
        try {
          kernelInfo = await fetchKernelPath(displayName);
          env = await findVenvEnvironment(
            displayName,
            kernelInfo?.executable_path,
            kernelInfo?.resource_dir
          );
        } finally {
          resolveDialog.dispose();
        }

        // Standalone kernelspec path: nb_venv_kernels does not know about
        // this kernel. For local kernelspecs (under the user's home) we
        // delete the kernelspec directly via the standard Jupyter API; for
        // system / global kernelspecs we refuse.
        if (!env) {
          if (!kernelInfo) {
            await showErrorMessage(
              'Cannot Unregister',
              `Could not resolve kernel "${displayName}".`
            );
            return;
          }
          if (!kernelInfo.is_local) {
            await refuseGlobalKernelspec(displayName, kernelInfo.resource_dir);
            return;
          }
          const deleteDialog = showLoadingDialog(
            `Deleting kernelspec "${kernelInfo.kernel_name}"...`
          );
          let deleteResult;
          try {
            deleteResult = await deleteKernelspec(kernelInfo.kernel_name);
          } finally {
            deleteDialog.dispose();
          }
          if (deleteResult.success) {
            await commands.execute(NB_VENV_KERNELS_REFRESH_CMD).catch(() => {
              // Ignore if refresh command not available
            });
            const bodyWidget = new Widget();
            const p1 = document.createElement('p');
            p1.textContent = `Successfully removed standalone kernelspec "${displayName}".`;
            const p2 = document.createElement('p');
            p2.textContent = `Deleted: ${kernelInfo.resource_dir}`;
            bodyWidget.node.appendChild(p1);
            bodyWidget.node.appendChild(p2);
            await showDialog({
              title: 'Kernelspec Removed',
              body: bodyWidget,
              buttons: [Dialog.okButton()]
            });
          } else {
            await showErrorMessage(
              'Unregister Failed',
              `Failed to delete kernelspec: ${deleteResult.error}`
            );
          }
          return;
        }

        // Show loading dialog with spinner
        const loadingDialog = showLoadingDialog(
          `Unregistering kernel "${env.name}"...`
        );

        try {
          // Unregister the kernel
          const result = await unregisterVenvKernel(env.path);

          loadingDialog.dispose();

          if (result.success) {
            console.log(`Kernel unregistered: ${env.path}`);
            // Refresh kernel list so changes are visible immediately
            await commands.execute(NB_VENV_KERNELS_REFRESH_CMD).catch(() => {
              // Ignore if refresh command not available
            });
            const bodyWidget = new Widget();
            const p1 = document.createElement('p');
            p1.textContent = `Successfully unregistered "${env.name}" (${env.path}).`;
            const p2 = document.createElement('p');
            p2.textContent = `To re-register, run: nb_venv_kernels register ${env.path}`;
            bodyWidget.node.appendChild(p1);
            bodyWidget.node.appendChild(p2);
            await showDialog({
              title: 'Kernel Unregistered',
              body: bodyWidget,
              buttons: [Dialog.okButton()]
            });
          } else {
            await showErrorMessage(
              'Unregister Failed',
              `Failed to unregister kernel: ${result.error}`
            );
          }
        } catch (error) {
          loadingDialog.dispose();
          await showErrorMessage(
            'Unregister Failed',
            `An unexpected error occurred: ${error}`
          );
        }
      }
    });

    // Add the "Remove Environment" command (dangerous - physically removes .venv folder)
    commands.addCommand(REMOVE_ENVIRONMENT_CMD, {
      label: 'Remove Environment (dangerous)',
      caption: 'Physically remove the .venv folder containing this environment',
      isEnabled: () =>
        clickedKernelDisplayName(app) !== null && nbVenvKernelsAvailable,
      isVisible: () => nbVenvKernelsAvailable,
      execute: async () => {
        const displayName = clickedKernelDisplayName(app);
        if (!displayName) {
          await showErrorMessage(
            'No Kernel Selected',
            'Could not determine which kernel was selected.'
          );
          return;
        }

        // Resolving the kernel path and the matching env requires server
        // round-trips that can take a moment; show a spinner so the user
        // sees the click registered before the confirmation dialog appears.
        const resolveDialog = showLoadingDialog('Resolving environment...');

        // Resolve the kernel's executable path so we can match envs by path
        // rather than by name substring (avoids picking the wrong env when
        // names share a prefix, e.g. `demo` vs `demo-prod`).
        let kernelInfo: IKernelPathResponse | null;
        let env: IVenvEnvironment | null;
        try {
          kernelInfo = await fetchKernelPath(displayName);
          env = await findVenvEnvironment(
            displayName,
            kernelInfo?.executable_path,
            kernelInfo?.resource_dir
          );
        } finally {
          resolveDialog.dispose();
        }

        // Standalone kernelspec path: nb_venv_kernels does not know about
        // this kernel. For local kernelspecs we delete the kernelspec dir
        // (and try to delete the .venv folder if executable_path points to
        // one that still exists); for global kernelspecs we refuse.
        if (!env) {
          if (!kernelInfo) {
            await showErrorMessage(
              'Cannot Remove',
              `Could not resolve kernel "${displayName}".`
            );
            return;
          }
          if (!kernelInfo.is_local) {
            await refuseGlobalKernelspec(displayName, kernelInfo.resource_dir);
            return;
          }
          // Derive the .venv directory from executable_path (".venv/bin/...").
          const exe = kernelInfo.executable_path || '';
          const venvMatch = exe.match(/^(.*\/\.venv)\/bin\/[^/]+$/);
          const venvDir = venvMatch ? venvMatch[1] : null;

          const confirmWidget = new Widget();
          const confirmP1 = document.createElement('p');
          confirmP1.textContent = `"${displayName}" is a standalone kernelspec not managed by nb_venv_kernels.`;
          const confirmP2 = document.createElement('p');
          confirmP2.textContent = `This will delete the kernelspec at: ${kernelInfo.resource_dir}`;
          confirmWidget.node.appendChild(confirmP1);
          confirmWidget.node.appendChild(confirmP2);
          if (venvDir) {
            const confirmP3 = document.createElement('p');
            confirmP3.textContent = `It will also attempt to delete the environment at: ${venvDir} (if present).`;
            confirmWidget.node.appendChild(confirmP3);
          }
          const confirmP4 = document.createElement('p');
          confirmP4.style.fontWeight = 'bold';
          confirmP4.textContent = 'This action cannot be undone!';
          confirmWidget.node.appendChild(confirmP4);

          const confirm = await showDialog({
            title: 'Remove Standalone Kernelspec',
            body: confirmWidget,
            buttons: [
              Dialog.cancelButton(),
              Dialog.warnButton({ label: 'Remove' })
            ]
          });
          if (!confirm.button.accept) {
            return;
          }

          const removeDialog = showLoadingDialog(
            `Removing kernelspec "${kernelInfo.kernel_name}"...`
          );
          let deleteResult: { success: boolean; error?: string };
          let venvResult: { success: boolean; error?: string } | null = null;
          try {
            deleteResult = await deleteKernelspec(kernelInfo.kernel_name);
            if (deleteResult.success && venvDir) {
              // Best-effort .venv removal - if it's already gone, that's fine
              venvResult = await removeDirectory(venvDir, serverRoot);
            }
          } finally {
            removeDialog.dispose();
          }
          if (!deleteResult.success) {
            await showErrorMessage(
              'Remove Failed',
              `Failed to delete kernelspec: ${deleteResult.error}`
            );
            return;
          }
          await commands.execute(NB_VENV_KERNELS_REFRESH_CMD).catch(() => {
            // Ignore if refresh command not available
          });
          const bodyWidget = new Widget();
          const okP1 = document.createElement('p');
          okP1.textContent = `Removed kernelspec "${displayName}".`;
          bodyWidget.node.appendChild(okP1);
          if (venvDir) {
            const okP2 = document.createElement('p');
            okP2.textContent =
              venvResult && venvResult.success
                ? `Also removed environment at: ${venvDir}`
                : `Environment at ${venvDir} was not removed (likely already gone).`;
            bodyWidget.node.appendChild(okP2);
          }
          await showDialog({
            title: 'Kernelspec Removed',
            body: bodyWidget,
            buttons: [Dialog.okButton()]
          });
          return;
        }

        // Check if this is a local .venv environment
        if (!isLocalVenvEnvironment(env.path)) {
          const notLocalWidget = new Widget();
          const notLocalP1 = document.createElement('p');
          notLocalP1.textContent = `"${env.name}" is not a local .venv environment.`;
          const notLocalP2 = document.createElement('p');
          notLocalP2.textContent =
            'Only local environments (with .venv in their path) can be removed.';
          notLocalWidget.node.appendChild(notLocalP1);
          notLocalWidget.node.appendChild(notLocalP2);
          await showDialog({
            title: 'Cannot Remove',
            body: notLocalWidget,
            buttons: [Dialog.okButton()]
          });
          return;
        }

        // Show confirmation dialog
        const confirmWidget = new Widget();
        const confirmP1 = document.createElement('p');
        confirmP1.textContent = `Are you sure you want to permanently remove virtual environment "${env.name}"?`;
        const confirmP2 = document.createElement('p');
        confirmP2.textContent = `This will delete: ${env.path}`;
        const confirmP3 = document.createElement('p');
        confirmP3.style.fontWeight = 'bold';
        confirmP3.textContent = 'This action cannot be undone!';
        confirmWidget.node.appendChild(confirmP1);
        confirmWidget.node.appendChild(confirmP2);
        confirmWidget.node.appendChild(confirmP3);

        const result = await showDialog({
          title: 'Remove Environment',
          body: confirmWidget,
          buttons: [
            Dialog.cancelButton(),
            Dialog.warnButton({ label: 'Remove' })
          ]
        });

        if (!result.button.accept) {
          return;
        }

        // Show loading dialog with spinner
        const loadingDialog = showLoadingDialog(
          `Removing environment "${env.name}"...`
        );

        try {
          // First unregister the kernel
          const unregisterResult = await unregisterVenvKernel(env.path);
          if (!unregisterResult.success) {
            loadingDialog.dispose();
            await showErrorMessage(
              'Remove Failed',
              `Failed to unregister kernel before removal: ${unregisterResult.error}`
            );
            return;
          }

          // Then remove the directory
          const removeResult = await removeDirectory(env.path, serverRoot);

          loadingDialog.dispose();

          if (removeResult.success) {
            console.log(`Environment removed: ${env.path}`);
            // Refresh kernel list so changes are visible immediately
            await commands.execute(NB_VENV_KERNELS_REFRESH_CMD).catch(() => {
              // Ignore if refresh command not available
            });
            await showDialog({
              title: 'Environment Removed',
              body: `Successfully removed "${env.name}".`,
              buttons: [Dialog.okButton()]
            });
          } else {
            await showErrorMessage(
              'Remove Failed',
              `Kernel was unregistered but failed to remove directory: ${removeResult.error}`
            );
          }
        } catch (error) {
          loadingDialog.dispose();
          await showErrorMessage(
            'Remove Failed',
            `An unexpected error occurred: ${error}`
          );
        }
      }
    });

    console.log(
      `Commands registered: ${SHOW_IN_BROWSER_CMD}, ${OPEN_TERMINAL_CMD}, ${UNREGISTER_KERNEL_CMD}, ${REMOVE_ENVIRONMENT_CMD}`
    );
  }
};

export default plugin;
