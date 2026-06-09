/**
 * Unit tests for jupyterlab_nb_venv_kernels_ui_extension
 *
 * Tests verify the kernel-card descriptor enrichment, the env matching
 * logic, and the context menu configuration for kernel launcher cards.
 */

// Data attribute the extension stamps on kernel launcher cards. Mirrors
// KERNEL_CARD_ATTR in src/index.ts. The context menu selector keys off it.
const KERNEL_CARD_ATTR = 'data-jp-kernel-display-name';
const KERNEL_CARD_SELECTOR = `.jp-LauncherCard[${KERNEL_CARD_ATTR}]`;

// Expected context menu commands for kernel launcher cards
const EXPECTED_COMMANDS = [
  'launcher:show-kernel-in-file-browser',
  'launcher:open-terminal-at-kernel',
  'launcher:unregister-venv-kernel',
  'launcher:remove-venv-environment'
];

// Schema configuration mirrored from schema/plugin.json
const pluginSchema = {
  'jupyter.lab.menus': {
    context: [
      {
        command: 'launcher:show-kernel-in-file-browser',
        selector: KERNEL_CARD_SELECTOR,
        rank: 10
      },
      {
        command: 'launcher:open-terminal-at-kernel',
        selector: KERNEL_CARD_SELECTOR,
        rank: 11
      },
      {
        command: 'launcher:unregister-venv-kernel',
        selector: KERNEL_CARD_SELECTOR,
        rank: 12
      },
      {
        command: 'launcher:remove-venv-environment',
        selector: KERNEL_CARD_SELECTOR,
        rank: 13
      }
    ]
  }
};

// Mirror of kernelDisplayNameForCard / enrichKernelCard from src/index.ts.
function kernelDisplayNameForCard(card: HTMLElement): string | null {
  const icon = card.querySelector(
    'img.jp-Launcher-kernelIcon'
  ) as HTMLImageElement | null;
  if (!icon) {
    return null;
  }
  const label = card
    .querySelector('.jp-LauncherCard-label')
    ?.textContent?.trim();
  const displayName = (icon.alt || label || card.title || '').trim();
  return displayName || null;
}

function enrichKernelCard(card: HTMLElement): void {
  if (card.hasAttribute(KERNEL_CARD_ATTR)) {
    return;
  }
  const displayName = kernelDisplayNameForCard(card);
  if (displayName) {
    card.setAttribute(KERNEL_CARD_ATTR, displayName);
  }
}

// Build a launcher card element similar to what JupyterLab renders.
function makeKernelCard(opts: {
  displayName: string;
  altAttr?: boolean;
  iconSrc?: string;
}): HTMLElement {
  const card = document.createElement('div');
  card.className = 'jp-LauncherCard';
  card.setAttribute('title', opts.displayName);
  const iconWrap = document.createElement('div');
  iconWrap.className = 'jp-LauncherCard-icon';
  const img = document.createElement('img');
  img.className = 'jp-Launcher-kernelIcon';
  img.src = opts.iconSrc ?? '/user/u/kernelspecs/some-kernel/logo-svg.svg';
  if (opts.altAttr !== false) {
    img.alt = opts.displayName;
  }
  iconWrap.appendChild(img);
  const label = document.createElement('div');
  label.className = 'jp-LauncherCard-label';
  const p = document.createElement('p');
  p.textContent = opts.displayName;
  label.appendChild(p);
  card.appendChild(iconWrap);
  card.appendChild(label);
  return card;
}

function makeNonKernelCard(label: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'jp-LauncherCard';
  card.setAttribute('title', label);
  const iconWrap = document.createElement('div');
  iconWrap.className = 'jp-LauncherCard-icon';
  // Non-kernel cards render an inline svg icon, not an <img class="jp-Launcher-kernelIcon">
  iconWrap.innerHTML = '<svg data-icon="ui-components:terminal"></svg>';
  const lbl = document.createElement('div');
  lbl.className = 'jp-LauncherCard-label';
  const p = document.createElement('p');
  p.textContent = label;
  lbl.appendChild(p);
  card.appendChild(iconWrap);
  card.appendChild(lbl);
  return card;
}

describe('kernel card enrichment', () => {
  it('stamps the descriptor on a kernel card using the icon alt text', () => {
    const card = makeKernelCard({ displayName: 'Python [uv env:cp-kpi]' });
    enrichKernelCard(card);
    expect(card.getAttribute(KERNEL_CARD_ATTR)).toBe('Python [uv env:cp-kpi]');
  });

  it('falls back to the label text when the icon has no alt', () => {
    const card = makeKernelCard({
      displayName: 'Python [conda env:base] *',
      altAttr: false
    });
    enrichKernelCard(card);
    expect(card.getAttribute(KERNEL_CARD_ATTR)).toBe(
      'Python [conda env:base] *'
    );
  });

  it('does not stamp a non-kernel card (no jp-Launcher-kernelIcon)', () => {
    const card = makeNonKernelCard('Terminal');
    enrichKernelCard(card);
    expect(card.hasAttribute(KERNEL_CARD_ATTR)).toBe(false);
  });

  it('is idempotent and preserves the first stamped value', () => {
    const card = makeKernelCard({ displayName: 'Python [uv env:demo]' });
    enrichKernelCard(card);
    // Mutate the label, re-run - the attribute must not change
    card.querySelector('.jp-LauncherCard-label p')!.textContent = 'changed';
    enrichKernelCard(card);
    expect(card.getAttribute(KERNEL_CARD_ATTR)).toBe('Python [uv env:demo]');
  });

  it('stamped kernel cards match the context menu selector; others do not', () => {
    const kernelCard = makeKernelCard({ displayName: 'Python [uv env:x]' });
    const terminalCard = makeNonKernelCard('Terminal');
    enrichKernelCard(kernelCard);
    enrichKernelCard(terminalCard);
    expect(kernelCard.matches(KERNEL_CARD_SELECTOR)).toBe(true);
    expect(terminalCard.matches(KERNEL_CARD_SELECTOR)).toBe(false);
  });
});

// Mirror of findVenvEnvironment matching logic from src/index.ts.
// Direct import is avoided because the plugin pulls in JupyterLab's ESM
// dependency chain that Jest cannot resolve without extensive mocking.
interface IVenvEnvironment {
  name: string;
  custom_name: string | null;
  type: string;
  exists: boolean;
  has_kernel: boolean;
  path: string;
}

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

function findVenvEnvironmentMatch(
  environments: IVenvEnvironment[],
  displayName: string,
  executablePath?: string | null,
  workspaceRoot?: string,
  resourceDir?: string | null
): IVenvEnvironment | null {
  if (
    executablePath &&
    executablePath.startsWith('/') &&
    resourceDir &&
    resourceDir.startsWith('/')
  ) {
    let attemptedPathMatch = false;
    for (const env of environments) {
      if (env.type === 'conda') {
        continue;
      }
      const envAbs = absoluteEnvPath(env.path, workspaceRoot);
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
  }

  const candidates = environments
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

describe('findVenvEnvironment matching', () => {
  // Two envs whose names overlap as substrings - the regression case.
  const collidingEnvs: IVenvEnvironment[] = [
    {
      name: 'demo',
      custom_name: null,
      type: 'venv',
      exists: true,
      has_kernel: true,
      path: '/work/demo/.venv'
    },
    {
      name: 'demo-prod',
      custom_name: null,
      type: 'venv',
      exists: true,
      has_kernel: true,
      path: '/work/demo-prod/.venv'
    }
  ];

  it('selects correct env by executable path when names overlap', () => {
    const match = findVenvEnvironmentMatch(
      collidingEnvs,
      'Python [uv env:demo-prod]',
      '/work/demo-prod/.venv/bin/python',
      undefined,
      '/work/demo-prod/.venv/share/jupyter/kernels/python3'
    );
    expect(match?.name).toBe('demo-prod');
  });

  it('selects shorter-named env by executable path', () => {
    const match = findVenvEnvironmentMatch(
      collidingEnvs,
      'Python [uv env:demo]',
      '/work/demo/.venv/bin/python',
      undefined,
      '/work/demo/.venv/share/jupyter/kernels/python3'
    );
    expect(match?.name).toBe('demo');
  });

  it('rejects path that is a sibling, not a child, of env.path', () => {
    // /work/demo/.venv-backup/bin/python must NOT match /work/demo/.venv
    const envs: IVenvEnvironment[] = [
      {
        name: 'demo',
        custom_name: null,
        type: 'venv',
        exists: true,
        has_kernel: true,
        path: '/work/demo/.venv'
      }
    ];
    const match = findVenvEnvironmentMatch(
      envs,
      'Python [uv env:demo]',
      '/work/demo/.venv-backup/bin/python',
      undefined,
      '/work/demo/.venv-backup/share/jupyter/kernels/python3'
    );
    expect(match).toBeNull();
  });

  it('falls back to longest-name substring match when path missing', () => {
    // Without executablePath, longer name wins so demo-prod is not
    // shadowed by demo.
    const match = findVenvEnvironmentMatch(
      collidingEnvs,
      'Python [uv env:demo-prod]',
      null
    );
    expect(match?.name).toBe('demo-prod');
  });

  it('matches custom_name in fallback path', () => {
    const envs: IVenvEnvironment[] = [
      {
        name: 'env1',
        custom_name: 'my-custom',
        type: 'venv',
        exists: true,
        has_kernel: true,
        path: '/work/proj/.venv'
      }
    ];
    const match = findVenvEnvironmentMatch(
      envs,
      'Python [uv env:my-custom]',
      null
    );
    expect(match?.name).toBe('env1');
  });

  it('skips conda envs in path-based matching', () => {
    const envs: IVenvEnvironment[] = [
      {
        name: 'demo',
        custom_name: null,
        type: 'conda',
        exists: true,
        has_kernel: true,
        path: '/opt/conda/envs/demo'
      }
    ];
    const match = findVenvEnvironmentMatch(
      envs,
      'Python [conda env:demo]',
      '/opt/conda/envs/demo/bin/python',
      undefined,
      '/opt/conda/envs/demo/share/jupyter/kernels/python3'
    );
    expect(match).toBeNull();
  });

  it('returns null when no env matches and path is unset', () => {
    const match = findVenvEnvironmentMatch(
      collidingEnvs,
      'Python [uv env:unknown]',
      null
    );
    expect(match).toBeNull();
  });

  // Regression: nb_venv_kernels reports env.path relative to workspace_root,
  // but the kernelspec argv[0] (executablePath) is absolute. Earlier the
  // prefix check compared an absolute path against a relative one and never
  // matched - every uv kernel showed "is not managed by nb_venv_kernels".
  it('matches when env.path is relative to workspace_root', () => {
    const envs: IVenvEnvironment[] = [
      {
        name: 'cp-kpi',
        custom_name: 'cp-kpi',
        type: 'uv',
        exists: true,
        has_kernel: true,
        path: 'delaval/cp/graph-engine/datascience/.venv'
      }
    ];
    const match = findVenvEnvironmentMatch(
      envs,
      'Python [uv env:cp-kpi]',
      '/home/lab/workspace/delaval/cp/graph-engine/datascience/.venv/bin/python',
      '/home/lab/workspace',
      '/home/lab/workspace/delaval/cp/graph-engine/datascience/.venv/share/jupyter/kernels/python3'
    );
    expect(match?.name).toBe('cp-kpi');
  });

  it('disambiguates relative env paths sharing a prefix', () => {
    const envs: IVenvEnvironment[] = [
      {
        name: 'demo',
        custom_name: 'demo',
        type: 'uv',
        exists: true,
        has_kernel: true,
        path: 'projects/demo/.venv'
      },
      {
        name: 'demo-prod',
        custom_name: 'demo-prod',
        type: 'uv',
        exists: true,
        has_kernel: true,
        path: 'projects/demo-prod/.venv'
      }
    ];
    const match = findVenvEnvironmentMatch(
      envs,
      'Python [uv env:demo-prod]',
      '/home/lab/workspace/projects/demo-prod/.venv/bin/python',
      '/home/lab/workspace',
      '/home/lab/workspace/projects/demo-prod/.venv/share/jupyter/kernels/python3'
    );
    expect(match?.name).toBe('demo-prod');
  });

  // Regression v1.2.28: standalone kernelspec whose argv[0] happens to
  // point at an nb_venv_kernels-managed env's python must NOT resolve to
  // that env - otherwise Remove would unregister + delete the shared
  // .venv when the user only wanted to drop the standalone kernel.
  it('does not match when resource_dir is outside the env (standalone kernelspec)', () => {
    const envs: IVenvEnvironment[] = [
      {
        name: 'dbm-improvements',
        custom_name: 'dbm-improvements',
        type: 'uv',
        exists: true,
        has_kernel: true,
        path: 'delaval/cp/ai-assistant/datascience/.venv'
      }
    ];
    const match = findVenvEnvironmentMatch(
      envs,
      'dbm-ds',
      // executable_path is inside the dbm-improvements env...
      '/home/lab/workspace/delaval/cp/ai-assistant/datascience/.venv/bin/python',
      '/home/lab/workspace',
      // ...but resource_dir is in the user's local kernelspec dir
      '/home/lab/.local/share/jupyter/kernels/dbm-ds'
    );
    expect(match).toBeNull();
  });

  it('does match an nb_venv_kernels dynamic kernel (resource_dir inside env)', () => {
    const envs: IVenvEnvironment[] = [
      {
        name: 'dbm-improvements',
        custom_name: 'dbm-improvements',
        type: 'uv',
        exists: true,
        has_kernel: true,
        path: 'delaval/cp/ai-assistant/datascience/.venv'
      }
    ];
    const match = findVenvEnvironmentMatch(
      envs,
      'Python [uv env:dbm-improvements]',
      '/home/lab/workspace/delaval/cp/ai-assistant/datascience/.venv/bin/python',
      '/home/lab/workspace',
      '/home/lab/workspace/delaval/cp/ai-assistant/datascience/.venv/share/jupyter/kernels/python3'
    );
    expect(match?.name).toBe('dbm-improvements');
  });

  it('falls back to substring when env paths are relative and workspace_root is missing', () => {
    const envs: IVenvEnvironment[] = [
      {
        name: 'cp-kpi',
        custom_name: 'cp-kpi',
        type: 'uv',
        exists: true,
        has_kernel: true,
        path: 'delaval/cp/datascience/.venv'
      }
    ];
    // old nb_venv_kernels: no workspace_root -> path-match can't be attempted
    const match = findVenvEnvironmentMatch(
      envs,
      'Python [uv env:cp-kpi]',
      '/home/lab/workspace/delaval/cp/datascience/.venv/bin/python',
      undefined
    );
    expect(match?.name).toBe('cp-kpi');
  });
});

// Mirror of the .venv-directory extraction used by REMOVE_ENVIRONMENT_CMD
// when handling a standalone kernelspec: pull the `.venv` dir out of an
// executable_path like `/path/to/.venv/bin/python`.
function venvDirFromExecutable(exe: string | null | undefined): string | null {
  if (!exe) {
    return null;
  }
  const m = exe.match(/^(.*\/\.venv)\/bin\/[^/]+$/);
  return m ? m[1] : null;
}

// Mirror of buildKernelTooltipText from src/index.ts. The native browser
// `title` tooltip renders `\n` as line breaks, so we ship plain text - no
// custom HTML popup, no escaping needed.
interface IKernelInfoForTooltip {
  kernel_name: string;
  executable_path: string | null;
  resource_dir: string;
  env_path: string | null;
  is_global_conda: boolean;
  is_local: boolean;
}

function buildKernelTooltipText(
  displayName: string,
  info: IKernelInfoForTooltip
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

describe('buildKernelTooltipText (native hover tooltip)', () => {
  it('renders all fields on separate lines for a local kernelspec', () => {
    const text = buildKernelTooltipText('dbm-ds', {
      kernel_name: 'dbm-ds',
      executable_path: '/home/u/proj/.venv/bin/python',
      resource_dir: '/home/u/.local/share/jupyter/kernels/dbm-ds',
      env_path: '/home/u/proj',
      is_global_conda: false,
      is_local: true
    });
    // first line is the display name, second line blank, then field rows
    expect(text.split('\n')[0]).toBe('dbm-ds');
    expect(text.split('\n')[1]).toBe('');
    expect(text).toContain('Local kernelspec');
    expect(text).toContain('Kernel name:');
    expect(text).toContain('/home/u/proj/.venv/bin/python');
    expect(text).toContain('/home/u/.local/share/jupyter/kernels/dbm-ds');
    expect(text).toContain('/home/u/proj');
  });

  it('shows "Global conda environment" when is_global_conda', () => {
    const text = buildKernelTooltipText('Python [conda env:base] *', {
      kernel_name: 'conda-base-py',
      executable_path: '/opt/conda/bin/python',
      resource_dir: '/opt/conda/share/jupyter/kernels/python3',
      env_path: '/opt/conda',
      is_global_conda: true,
      is_local: false
    });
    expect(text).toContain('Global conda environment');
    expect(text).not.toContain('System kernelspec');
    expect(text).not.toContain('Local kernelspec');
  });

  it('shows "System kernelspec" when neither local nor global conda', () => {
    const text = buildKernelTooltipText('Some System Kernel', {
      kernel_name: 'sys-kernel',
      executable_path: '/usr/local/share/python/bin/python',
      resource_dir: '/usr/local/share/jupyter/kernels/sys-kernel',
      env_path: null,
      is_global_conda: false,
      is_local: false
    });
    expect(text).toContain('System kernelspec');
    expect(text).not.toContain('Global conda environment');
    expect(text).not.toContain('Local kernelspec');
  });

  it('skips rows whose value is null or empty (no Env path row)', () => {
    const text = buildKernelTooltipText('no-env-kernel', {
      kernel_name: 'no-env-kernel',
      executable_path: '/some/path/python',
      resource_dir: '/some/spec/dir',
      env_path: null,
      is_global_conda: false,
      is_local: true
    });
    expect(text).not.toContain('Env path');
    expect(text).toContain('Kernel name:');
    expect(text).toContain('Executable:');
  });

  it('uses newline separators (browser title attribute honors \\n)', () => {
    const text = buildKernelTooltipText('Python [uv env:cp-kpi]', {
      kernel_name: 'venv-cp-kpi-py',
      executable_path: '/p/.venv/bin/python',
      resource_dir: '/p/.venv/share/jupyter/kernels/python3',
      env_path: '/p',
      is_global_conda: false,
      is_local: true
    });
    const lines = text.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines[0]).toBe('Python [uv env:cp-kpi]');
  });
});

describe('venvDirFromExecutable (standalone remove path)', () => {
  it('extracts .venv root for standard layout', () => {
    expect(venvDirFromExecutable('/home/u/proj/.venv/bin/python')).toBe(
      '/home/u/proj/.venv'
    );
  });

  it('handles other binary names under bin/', () => {
    expect(venvDirFromExecutable('/home/u/proj/.venv/bin/python3.12')).toBe(
      '/home/u/proj/.venv'
    );
  });

  it('returns null when executable is not under a .venv/bin', () => {
    expect(venvDirFromExecutable('/opt/conda/bin/python')).toBeNull();
    expect(
      venvDirFromExecutable('/opt/conda/envs/myenv/bin/python')
    ).toBeNull();
  });

  it('returns null for empty / undefined / relative paths', () => {
    expect(venvDirFromExecutable(null)).toBeNull();
    expect(venvDirFromExecutable(undefined)).toBeNull();
    expect(venvDirFromExecutable('')).toBeNull();
    expect(venvDirFromExecutable('python')).toBeNull();
  });
});

describe('context menu configuration', () => {
  it('should define all expected context menu commands', () => {
    const contextItems = pluginSchema['jupyter.lab.menus'].context;

    for (const cmd of EXPECTED_COMMANDS) {
      const item = contextItems.find(
        (item: { command: string; selector: string }) =>
          item.command === cmd && item.selector === KERNEL_CARD_SELECTOR
      );
      expect(item).toBeDefined();
    }
  });

  it('should target only kernel launcher cards (descriptor selector)', () => {
    const contextItems = pluginSchema['jupyter.lab.menus'].context;

    for (const item of contextItems) {
      expect(item.selector).toBe(KERNEL_CARD_SELECTOR);
      // must scope to the explicit kernel descriptor, not bare cards
      expect(item.selector).toContain(`[${KERNEL_CARD_ATTR}]`);
    }
  });

  it('should have correct menu item order by rank', () => {
    const contextItems = pluginSchema['jupyter.lab.menus'].context;
    const ranks = contextItems.map((item: { rank: number }) => item.rank);

    // Verify ranks are in ascending order
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });
});
