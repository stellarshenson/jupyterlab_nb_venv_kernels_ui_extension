/**
 * Unit tests for jupyterlab_nb_venv_kernels_ui_extension
 *
 * Tests exercise the shipped helpers in `src/utils.ts` and the real
 * `schema/plugin.json`: kernel-card descriptor enrichment, env matching,
 * path conversion, the tooltip text and the context menu configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  buildKernelTooltipText,
  enrichKernelCard,
  IVenvEnvironment,
  KERNEL_CARD_ATTR,
  matchVenvEnvironment,
  toRelativePath,
  venvDirFromExecutable
} from '../utils';

const KERNEL_CARD_SELECTOR = `.jp-LauncherCard[${KERNEL_CARD_ATTR}]`;

// Expected context menu commands for kernel launcher cards
const EXPECTED_COMMANDS = [
  'launcher:show-kernel-in-file-browser',
  'launcher:open-terminal-at-kernel',
  'launcher:unregister-venv-kernel',
  'launcher:remove-venv-environment'
];

const pluginSchema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'schema', 'plugin.json'),
    'utf-8'
  )
);

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

// A kernel whose kernelspec ships no logo: JupyterLab renders the first
// letter in a div instead of an <img class="jp-Launcher-kernelIcon">.
function makeNoLogoKernelCard(displayName: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'jp-LauncherCard';
  card.setAttribute('title', displayName);
  const iconWrap = document.createElement('div');
  iconWrap.className = 'jp-LauncherCard-icon';
  const letter = document.createElement('div');
  letter.className = 'jp-LauncherCard-noKernelIcon';
  letter.textContent = displayName[0].toUpperCase();
  iconWrap.appendChild(letter);
  const label = document.createElement('div');
  label.className = 'jp-LauncherCard-label';
  const p = document.createElement('p');
  p.textContent = displayName;
  label.appendChild(p);
  card.appendChild(iconWrap);
  card.appendChild(label);
  return card;
}

describe('kernel card enrichment', () => {
  // Regression DEF-MENU-12: a logo-less kernel card got no descriptor.
  it('stamps a kernel card that has no logo, using the label text', () => {
    const card = makeNoLogoKernelCard('No Logo Kernel');
    enrichKernelCard(card);
    expect(card.getAttribute(KERNEL_CARD_ATTR)).toBe('No Logo Kernel');
  });

  it('calls onStamped once, with the stamped display name', () => {
    const card = makeKernelCard({ displayName: 'Python [uv env:demo]' });
    const seen: string[] = [];
    enrichKernelCard(card, (_card, name) => seen.push(name));
    enrichKernelCard(card, (_card, name) => seen.push(name));
    expect(seen).toEqual(['Python [uv env:demo]']);
  });

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

// Adapter keeping the call shape the matching tests were written against.
function findVenvEnvironmentMatch(
  environments: IVenvEnvironment[],
  displayName: string,
  executablePath?: string | null,
  workspaceRoot?: string,
  resourceDir?: string | null
): IVenvEnvironment | null {
  return matchVenvEnvironment(
    { environments, workspace_root: workspaceRoot as string },
    displayName,
    executablePath,
    resourceDir
  );
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

  // Regression DEF-UNREG-10: the matched env must carry an absolute path.
  // nb_venv_kernels applies abspath() against the server cwd, so a
  // workspace-relative path sent back to unregister names another directory.
  it('returns the matched env with its path made absolute', () => {
    const envs: IVenvEnvironment[] = [
      {
        name: 'cp-kpi',
        custom_name: null,
        type: 'uv',
        exists: true,
        has_kernel: true,
        path: 'delaval/cp/datascience/.venv'
      }
    ];
    const match = findVenvEnvironmentMatch(
      envs,
      'Python [uv env:cp-kpi]',
      '/home/lab/workspace/delaval/cp/datascience/.venv/bin/python',
      '/home/lab/workspace',
      '/home/lab/workspace/delaval/cp/datascience/.venv/share/jupyter/kernels/python3'
    );
    expect(match?.path).toBe(
      '/home/lab/workspace/delaval/cp/datascience/.venv'
    );
    expect(envs[0].path).toBe('delaval/cp/datascience/.venv');
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

// Regression DEF-PATH-11: the root used to arrive as `~/...` and HOME was
// guessed from a /home/<name> pattern, so any other home dir failed.
describe('toRelativePath', () => {
  it('converts a path under the root', () => {
    expect(toRelativePath('/root/workspace/proj', '/root/workspace')).toBe(
      'proj'
    );
  });

  it('returns an empty path for the root itself, trailing slash or not', () => {
    expect(toRelativePath('/root/workspace/', '/root/workspace')).toBe('');
    expect(toRelativePath('/root/workspace', '/root/workspace/')).toBe('');
  });

  it('returns null outside the root, including a sibling sharing its prefix', () => {
    expect(toRelativePath('/opt/conda', '/root/workspace')).toBeNull();
    expect(toRelativePath('/root/workspace2/x', '/root/workspace')).toBeNull();
  });

  it('returns null when the root is not absolute', () => {
    expect(toRelativePath('/home/u/workspace/proj', '~/workspace')).toBeNull();
    expect(toRelativePath('/home/u/workspace/proj', '')).toBeNull();
  });

  // A backend older than the frontend (upgrade without a server restart)
  // sends no server_root at all.
  it('returns null when the root is missing', () => {
    expect(
      toRelativePath('/home/u/workspace/proj', undefined as unknown as string)
    ).toBeNull();
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
