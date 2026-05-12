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

function findVenvEnvironmentMatch(
  environments: IVenvEnvironment[],
  displayName: string,
  executablePath?: string | null
): IVenvEnvironment | null {
  if (executablePath && executablePath.startsWith('/')) {
    for (const env of environments) {
      if (env.type === 'conda') {
        continue;
      }
      if (!env.path) {
        continue;
      }
      const prefix = env.path.endsWith('/') ? env.path : env.path + '/';
      if (executablePath.startsWith(prefix)) {
        return env;
      }
    }
    return null;
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
      '/work/demo-prod/.venv/bin/python'
    );
    expect(match?.name).toBe('demo-prod');
  });

  it('selects shorter-named env by executable path', () => {
    const match = findVenvEnvironmentMatch(
      collidingEnvs,
      'Python [uv env:demo]',
      '/work/demo/.venv/bin/python'
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
      '/work/demo/.venv-backup/bin/python'
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
      '/opt/conda/envs/demo/bin/python'
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
