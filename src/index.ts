import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { ILauncher } from '@jupyterlab/launcher';
import { ITerminalTracker } from '@jupyterlab/terminal';
import { showErrorMessage, showDialog, Dialog } from '@jupyterlab/apputils';
import { ServerConnection } from '@jupyterlab/services';
import { URLExt } from '@jupyterlab/coreutils';
import { Widget } from '@lumino/widgets';
import {
  buildKernelTooltipText,
  IKernelPathResponse,
  isLocalVenvEnvironment,
  IVenvEnvironment,
  IVenvEnvironmentsResponse,
  KERNEL_CARD_ATTR,
  enrichKernelCard,
  matchVenvEnvironment,
  toRelativePath,
  venvDirFromExecutable
} from './utils';

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
 * Interface for nb_venv_kernels unregister response.
 */
interface IUnregisterResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Body of nb_venv_kernels' `POST /nb-venv-kernels/unregister` response.
 */
interface IUnregisterReply {
  unregistered?: boolean;
  error?: string;
  message?: string;
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
 * Flag indicating whether nb_venv_kernels extension is available.
 * Checked once at startup.
 */
let nbVenvKernelsAvailable = false;

/**
 * A launcher card resolved to one kernelspec, or why it could not be.
 */
interface IKernelResolution {
  info: IKernelPathResponse | null;
  /** The reason `info` is null, in the server's words when it gave any. */
  error: string;
}

/**
 * Fetch the kernel path information from the server.
 *
 * @param displayName - The display name of the kernel
 * @returns Promise resolving to the kernel path info, or null and the reason
 */
async function fetchKernelPath(
  displayName: string
): Promise<IKernelResolution> {
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
      return {
        info: null,
        error: data.error || `Server answered ${response.status}`
      };
    }

    const data = (await response.json()) as IKernelPathResponse;
    return { info: data, error: '' };
  } catch (error) {
    console.error('Error fetching kernel path:', error);
    return {
      info: null,
      error: `Could not resolve kernel "${displayName}": ${error}`
    };
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
 * Find the nb_venv_kernels environment a kernel belongs to; see
 * {@link matchVenvEnvironment} for the matching rules.
 *
 * @param displayName - The kernel display name (used for fallback match)
 * @param executablePath - The kernel's `argv[0]` python path, if known
 * @param resourceDir - The kernelspec's `resource_dir`, if known
 * @returns The matching environment, with an absolute `path`, or null
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
  return matchVenvEnvironment(
    envData,
    displayName,
    executablePath,
    resourceDir
  );
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

    const data = (await response.json()) as IUnregisterReply;

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to unregister kernel'
      };
    }
    // nb_venv_kernels answers 200 with `unregistered: false` when the path
    // is not in its registry - that is a failure, not a success.
    if (data.unregistered === false) {
      return {
        success: false,
        error: `${envPath} is not in the nb_venv_kernels registry`
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
 * Delete a `.venv` directory from disk through the extension's Python side.
 * The contents API cannot: it refuses dot-directories on a default server.
 *
 * @param venvPath - The absolute path of the `.venv` directory
 * @returns Promise resolving to success status and optional error message
 */
async function removeVenv(
  venvPath: string
): Promise<{ success: boolean; error?: string }> {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(settings.baseUrl, 'api', 'venv-remove');
  try {
    const response = await ServerConnection.makeRequest(
      url,
      { method: 'POST', body: JSON.stringify({ path: venvPath }) },
      settings
    );
    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }
    return { success: true };
  } catch (error) {
    console.error('Error removing .venv:', error);
    return { success: false, error: `Network error: ${error}` };
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
 * Stamp one card, then fetch kernel info in the background and rewrite the
 * native `title` so the standard hover tooltip shows display name + kernel
 * name + kind + paths instead of just the display name.
 *
 * @param card - A `.jp-LauncherCard` element
 */
function enrichKernelCardWithTitle(card: HTMLElement): void {
  enrichKernelCard(card, (stamped, displayName) => {
    enhanceKernelCardTitle(stamped, displayName).catch(() => {
      // Swallow - title enrichment is a UX nicety, not load-critical.
    });
  });
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
    enrichKernelCardWithTitle(root);
  }
  root
    .querySelectorAll<HTMLElement>('.jp-LauncherCard')
    .forEach(enrichKernelCardWithTitle);
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
      pending = fetchKernelPath(displayName).then(({ info }) => {
        if (info) {
          kernelInfoCache.set(displayName, info);
        }
        kernelInfoInflight.delete(displayName);
        return info;
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

        const { info: kernelInfo, error } = await fetchKernelPath(displayName);

        if (!kernelInfo) {
          await showErrorMessage('Kernel Not Resolved', error);
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
        const relativePath = toRelativePath(targetPath, kernelInfo.server_root);

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

        const { info: kernelInfo, error } = await fetchKernelPath(displayName);

        if (!kernelInfo) {
          await showErrorMessage('Kernel Not Resolved', error);
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
        const relativePath = toRelativePath(targetPath, kernelInfo.server_root);

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
        let resolution: IKernelResolution;
        let env: IVenvEnvironment | null;
        try {
          resolution = await fetchKernelPath(displayName);
          env = await findVenvEnvironment(
            displayName,
            resolution.info?.executable_path,
            resolution.info?.resource_dir
          );
        } finally {
          resolveDialog.dispose();
        }
        const kernelInfo = resolution.info;

        // A kernel the server cannot resolve to one kernelspec (unknown, or a
        // display name shared by kernels in different directories) must not
        // fall through to the env-name substring match below.
        if (!kernelInfo) {
          await showErrorMessage('Cannot Unregister', resolution.error);
          return;
        }

        // Standalone kernelspec path: nb_venv_kernels does not know about
        // this kernel. For local kernelspecs (under the user's home) we
        // delete the kernelspec directly via the standard Jupyter API; for
        // system / global kernelspecs we refuse.
        if (!env) {
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
        let resolution: IKernelResolution;
        let env: IVenvEnvironment | null;
        try {
          resolution = await fetchKernelPath(displayName);
          env = await findVenvEnvironment(
            displayName,
            resolution.info?.executable_path,
            resolution.info?.resource_dir
          );
        } finally {
          resolveDialog.dispose();
        }
        const kernelInfo = resolution.info;

        // A kernel the server cannot resolve to one kernelspec (unknown, or a
        // display name shared by kernels in different directories) must not
        // fall through to the env-name substring match below.
        if (!kernelInfo) {
          await showErrorMessage('Cannot Remove', resolution.error);
          return;
        }

        // Standalone kernelspec path: nb_venv_kernels does not know about
        // this kernel. For local kernelspecs we delete the kernelspec dir
        // (and try to delete the .venv folder if executable_path points to
        // one that still exists); for global kernelspecs we refuse.
        if (!env) {
          if (!kernelInfo.is_local) {
            await refuseGlobalKernelspec(displayName, kernelInfo.resource_dir);
            return;
          }
          // Derive the .venv directory from executable_path (".venv/bin/...").
          const venvDir = venvDirFromExecutable(kernelInfo.executable_path);

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
              venvResult = await removeVenv(venvDir);
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
          const removeResult = await removeVenv(env.path);

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
