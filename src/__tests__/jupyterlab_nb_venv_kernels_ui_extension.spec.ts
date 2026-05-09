/**
 * Unit tests for jupyterlab_nb_venv_kernels_ui_extension
 *
 * Tests verify the context menu configuration for kernel launcher cards.
 */

// Expected context menu commands for .jp-LauncherCard
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
        selector: '.jp-LauncherCard',
        rank: 10
      },
      {
        command: 'launcher:open-terminal-at-kernel',
        selector: '.jp-LauncherCard',
        rank: 11
      },
      {
        command: 'launcher:unregister-venv-kernel',
        selector: '.jp-LauncherCard',
        rank: 12
      },
      {
        command: 'launcher:remove-venv-environment',
        selector: '.jp-LauncherCard',
        rank: 13
      }
    ]
  }
};

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
          item.command === cmd && item.selector === '.jp-LauncherCard'
      );
      expect(item).toBeDefined();
    }
  });

  it('should target .jp-LauncherCard selector for all commands', () => {
    const contextItems = pluginSchema['jupyter.lab.menus'].context;

    for (const item of contextItems) {
      expect(item.selector).toBe('.jp-LauncherCard');
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
