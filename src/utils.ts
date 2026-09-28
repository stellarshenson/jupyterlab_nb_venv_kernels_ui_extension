/**
 * Pure helpers used by the plugin in `index.ts`. They import nothing from
 * JupyterLab, so the jest suite exercises this shipped code directly instead
 * of a copy of it.
 */

/**
 * Data attribute stamped on every kernel launcher card. The context menu
 * selector in `schema/plugin.json` keys off it.
 */
export const KERNEL_CARD_ATTR = 'data-jp-kernel-display-name';

/**
 * Interface for the kernel path API response.
 */
export interface IKernelPathResponse {
  kernel_name: string;
  display_name: string;
  resource_dir: string;
  executable_path: string | null;
  env_path: string | null;
  is_global_conda: boolean;
  /**
   * True when the kernelspec's `resource_dir` is under the user's home
   * directory (e.g. `~/.local/share/jupyter/kernels/`). Local kernelspecs
   * may be removed by the plugin when not managed by nb_venv_kernels;
   * global / system kernelspecs may not - they require admin action.
   */
  is_local: boolean;
  /**
   * Absolute root of the server's contents manager. The page config's
   * `serverRoot` cannot serve here: jupyter_server publishes it with the
   * home directory collapsed to `~`, and the browser cannot expand that.
   */
  server_root: string;
  error?: string;
}

/**
 * Interface for nb_venv_kernels environment entry.
 */
export interface IVenvEnvironment {
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
export interface IVenvEnvironmentsResponse {
  environments: IVenvEnvironment[];
  workspace_root: string;
}

/**
 * Determine whether a launcher card represents a kernel and, if so, return
 * its display name.
 *
 * JupyterLab renders a kernel card's icon as `<img class="jp-Launcher-kernelIcon">`
 * when the kernelspec ships a logo and as `<div class="jp-LauncherCard-noKernelIcon">`
 * (the first letter) when it does not; non-kernel cards (Terminal, Text File,
 * services) render an inline `<svg>`. The icon is used only to decide whether
 * to stamp the card - everything downstream keys off {@link KERNEL_CARD_ATTR}.
 *
 * @param card - A `.jp-LauncherCard` element
 * @returns The kernel display name, or null for a non-kernel card
 */
export function kernelDisplayNameForCard(card: HTMLElement): string | null {
  const icon = card.querySelector<HTMLImageElement>(
    'img.jp-Launcher-kernelIcon'
  );
  if (!icon && !card.querySelector('.jp-LauncherCard-noKernelIcon')) {
    return null;
  }
  const label = card
    .querySelector('.jp-LauncherCard-label')
    ?.textContent?.trim();
  const displayName = (icon?.alt || label || card.title || '').trim();
  return displayName || null;
}

/**
 * Stamp the kernel descriptor onto a launcher card if it is a kernel card.
 * Idempotent: a card that already carries the attribute keeps its value.
 *
 * @param card - A `.jp-LauncherCard` element
 * @param onStamped - Called once, right after the attribute is written
 */
export function enrichKernelCard(
  card: HTMLElement,
  onStamped?: (card: HTMLElement, displayName: string) => void
): void {
  if (card.hasAttribute(KERNEL_CARD_ATTR)) {
    return;
  }
  const displayName = kernelDisplayNameForCard(card);
  if (displayName) {
    card.setAttribute(KERNEL_CARD_ATTR, displayName);
    onStamped?.(card, displayName);
  }
}

/**
 * Resolve an nb_venv_kernels env path to an absolute filesystem path.
 *
 * nb_venv_kernels reports `path` relative to `workspace_root` (e.g.
 * `delaval/.../datascience/.venv`); the kernelspec `argv[0]` we compare it
 * against is absolute. Join them so the prefix check works.
 *
 * @param envPath - The `path` field from an nb_venv_kernels environment
 * @param workspaceRoot - The `workspace_root` field from the environments response
 * @returns The absolute path, or null if it cannot be resolved
 */
export function absoluteEnvPath(
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
 * Find the nb_venv_kernels environment a kernel belongs to.
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
 * The returned env carries its absolute `path` whenever it can be resolved:
 * nb_venv_kernels' own endpoints apply `abspath()` against the server's
 * working directory, so a workspace-relative path sent back to them names
 * a different directory.
 *
 * @param envData - The nb_venv_kernels environments response
 * @param displayName - The kernel display name (used for fallback match)
 * @param executablePath - The kernel's `argv[0]` python path, if known
 * @param resourceDir - The kernelspec's `resource_dir`, if known
 * @returns The matching environment or null
 */
export function matchVenvEnvironment(
  envData: IVenvEnvironmentsResponse,
  displayName: string,
  executablePath?: string | null,
  resourceDir?: string | null
): IVenvEnvironment | null {
  const withAbsolutePath = (env: IVenvEnvironment): IVenvEnvironment => ({
    ...env,
    path: absoluteEnvPath(env.path, envData.workspace_root) ?? env.path
  });

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
        return withAbsolutePath(env);
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
      return withAbsolutePath(env);
    }
  }

  return null;
}

/**
 * Check if an environment path is a local .venv environment.
 * Local environments have .venv in their path.
 *
 * @param envPath - The environment path to check
 * @returns true if the environment is local (.venv based)
 */
export function isLocalVenvEnvironment(envPath: string): boolean {
  return envPath.includes('/.venv') || envPath.includes('\\.venv');
}

/**
 * Extract the `.venv` directory from a standalone kernelspec's executable,
 * e.g. `/path/to/.venv/bin/python` -> `/path/to/.venv`.
 *
 * @param executablePath - The kernelspec's `argv[0]`
 * @returns The `.venv` directory, or null when the executable is not in one
 */
export function venvDirFromExecutable(
  executablePath: string | null | undefined
): string | null {
  const match = (executablePath || '').match(/^(.*\/\.venv)\/bin\/[^/]+$/);
  return match ? match[1] : null;
}

/**
 * Convert an absolute filesystem path to a path relative to the server root.
 *
 * @param absolutePath - The absolute filesystem path
 * @param serverRoot - The server's absolute root directory
 * @returns The relative path, '' for the root itself, or null if outside the
 *   root or the root is not an absolute path
 */
export function toRelativePath(
  absolutePath: string,
  serverRoot: string
): string | null {
  if (!serverRoot || !serverRoot.startsWith('/')) {
    return null;
  }
  const normalizedPath = absolutePath.replace(/\/+$/, '');
  const normalizedRoot = serverRoot.replace(/\/+$/, '');

  if (normalizedPath === normalizedRoot) {
    return '';
  }
  const rootPrefix = normalizedRoot + '/';
  if (normalizedPath.startsWith(rootPrefix)) {
    return normalizedPath.slice(rootPrefix.length);
  }
  return null;
}

/**
 * Build the plain-text kernel tooltip. The native browser `title` tooltip
 * renders `\n` as line breaks, so no custom popup or HTML escaping is needed.
 *
 * @param displayName - The kernel display name (first line)
 * @param info - The kernel path API response
 * @returns The multi-line tooltip text
 */
export function buildKernelTooltipText(
  displayName: string,
  info: Pick<
    IKernelPathResponse,
    | 'kernel_name'
    | 'executable_path'
    | 'resource_dir'
    | 'env_path'
    | 'is_global_conda'
    | 'is_local'
  >
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
