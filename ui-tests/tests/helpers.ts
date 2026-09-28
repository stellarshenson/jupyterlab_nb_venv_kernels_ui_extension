import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import { Locator } from '@playwright/test';

/** Scratch HOME and server root, set in playwright.config.js. */
export const HOME = process.env.NBVK_TEST_HOME as string;
export const ROOT = process.env.NBVK_TEST_ROOT as string;

export const KERNEL_ATTR = 'data-jp-kernel-display-name';

/**
 * Wait for what a command shows after it resolves the kernel. Resolution makes two
 * server round-trips, and `/api/kernel-path` alone took about 2 s per call on the
 * development workstation, where the conda environments are listed on every call.
 */
export const RESOLVE_TIMEOUT = 30000;

/**
 * Galata's default readiness waits for the Launcher tab to be active. Where a lab
 * extension opens its own tab at startup (the GalaxaHub message-of-the-day tab on the
 * development workstation), every test times out inside page.goto(). Ready here is the
 * splash gone and the shell mounted; showLauncher opens a launcher where one is needed.
 */
export const labFixtures = {
  waitForApplication: async (
    { baseURL }: { baseURL?: string },
    use: (wait: (page: any) => Promise<void>) => Promise<void>
  ) => {
    await use(async (page: any) => {
      await page.locator('#jupyterlab-splash').waitFor({ state: 'detached' });
      await page.locator('#main').waitFor();
    });
  }
};

const PYTHON = process.env.NBVK_TEST_PYTHON || 'python3';
const USER_KERNELS = path.join(HOME, '.local', 'share', 'jupyter', 'kernels');

// 1x1 PNG. The launcher renders a kernel with a logo as an <img> and one without as a
// letter placeholder. ipykernel installs ship a logo, so fixtures do too unless a test
// is about the logo-less case.
const LOGO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function writeKernelspec(
  dir: string,
  argv0: string,
  displayName: string,
  logo: boolean
): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'kernel.json'),
    JSON.stringify({
      argv: [argv0, '-m', 'ipykernel_launcher', '-f', '{connection_file}'],
      display_name: displayName,
      language: 'python'
    })
  );
  if (logo) {
    fs.writeFileSync(path.join(dir, 'logo-64x64.png'), LOGO);
  }
}

/**
 * Create a venv at ROOT/<rel> holding the kernelspec nb_venv_kernels lists.
 * The kernel is never started, so ipykernel is not installed.
 */
export function makeVenv(rel: string): string {
  const envPath = path.join(ROOT, rel);
  execFileSync(PYTHON, ['-m', 'venv', '--without-pip', envPath]);
  writeKernelspec(
    path.join(envPath, 'share', 'jupyter', 'kernels', 'python3'),
    'python',
    'Python 3 (ipykernel)',
    true
  );
  return envPath;
}

/**
 * Install a user kernelspec under the scratch HOME - a standalone kernelspec that
 * nb_venv_kernels does not know - whose interpreter is <envPath>/bin/python.
 */
export function makeUserKernelspec(
  name: string,
  displayName: string,
  envPath: string,
  logo = true
): string {
  const dir = path.join(USER_KERNELS, name);
  writeKernelspec(dir, path.join(envPath, 'bin', 'python'), displayName, logo);
  return dir;
}

export async function registerEnv(
  page: IJupyterLabPageFixture,
  envPath: string
): Promise<void> {
  const response = await page.request.post('/nb-venv-kernels/register', {
    data: { path: envPath }
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Names of the environments in the nb_venv_kernels registry. */
export async function registeredEnvNames(
  page: IJupyterLabPageFixture
): Promise<string[]> {
  const response = await page.request.get('/nb-venv-kernels/environments');
  expect(response.ok()).toBe(true);
  return (await response.json()).environments.map(
    (e: { name: string }) => e.name
  );
}

interface ISpecModel {
  name: string;
  spec: { argv: string[]; display_name: string };
}

export async function kernelspecs(
  page: IJupyterLabPageFixture
): Promise<ISpecModel[]> {
  const response = await page.request.get('/api/kernelspecs');
  expect(response.ok()).toBe(true);
  return Object.values((await response.json()).kernelspecs);
}

/** Display name of the kernelspec whose interpreter lives in envPath. */
export async function displayNameFor(
  page: IJupyterLabPageFixture,
  envPath: string
): Promise<string> {
  const python = path.join(envPath, 'bin', 'python');
  let name = '';
  await expect
    .poll(async () => {
      const match = (await kernelspecs(page)).find(
        s => s.spec.argv[0] === python
      );
      name = match?.spec.display_name ?? '';
      return name;
    })
    .not.toBe('');
  return name;
}

/**
 * A kernelspec outside the scratch HOME - the system python kernel where there is
 * one. Selected by the server's own `is_local`, so a test that tries to delete it can
 * never hit a kernelspec the server considers deletable.
 */
export async function systemKernel(
  page: IJupyterLabPageFixture
): Promise<{ name: string; displayName: string }> {
  const specs = (await kernelspecs(page)).sort(
    (a, b) => Number(b.name === 'python3') - Number(a.name === 'python3')
  );
  for (const s of specs) {
    const response = await page.request.get(
      `/api/kernel-path/${encodeURIComponent(s.spec.display_name)}`
    );
    if (response.ok() && (await response.json()).is_local === false) {
      return { name: s.name, displayName: s.spec.display_name };
    }
  }
  throw new Error('no system kernelspec found');
}

/**
 * Reload the kernelspecs in the page and bring one launcher to the front. Reusing an
 * open launcher keeps each card unique on the page.
 */
export async function showLauncher(
  page: IJupyterLabPageFixture
): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).jupyterapp;
    await app.serviceManager.kernelspecs.refreshSpecs();
    const launcher = Array.from(
      app.shell.widgets('main') as Iterable<any>
    ).find(w => w.node.querySelector('.jp-Launcher'));
    if (launcher) {
      app.shell.activateById(launcher.id);
    } else {
      await app.commands.execute('launcher:create');
    }
  });
  await expect(page.locator('.jp-Launcher')).toBeVisible();
}

/**
 * Start recording the paths the default file browser is told to open, and
 * return a reader for them. The browser's own directory is not a reliable
 * witness on a galata page: loaded at /lab/tree/<path>, it stays
 * `jp-mod-restoring` until the router's next route, then reopens <path> and
 * undoes whichever navigation came first. Core's own calls land in the log
 * too, in any order: that bounce and periodic `.` refreshes.
 */
export async function recordFileBrowserNavigation(
  page: IJupyterLabPageFixture
): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const app = (window as any).jupyterapp;
    const browser = Array.from(app.shell.widgets('left') as Iterable<any>).find(
      w => w.id === 'filebrowser'
    );
    const log: string[] = [];
    (window as any).nbvkFileBrowserPaths = log;
    const cd = browser.model.cd.bind(browser.model);
    browser.model.cd = (path: string) => {
      log.push(path);
      return cd(path);
    };
  });
  return () =>
    page.evaluate(() => (window as any).nbvkFileBrowserPaths as string[]);
}

/** The Notebook card of a kernel; each kernel also has a Console card. */
export function kernelCard(
  page: IJupyterLabPageFixture,
  displayName: string
): Locator {
  return page.locator(
    `.jp-LauncherCard[data-category="Notebook"][${KERNEL_ATTR}="${displayName}"]`
  );
}

/** A launcher card found by its label, whatever attributes it carries. */
export function cardByLabel(
  page: IJupyterLabPageFixture,
  label: string
): Locator {
  return page.locator('.jp-LauncherCard[data-category="Notebook"]', {
    has: page.locator('.jp-LauncherCard-label', { hasText: label })
  });
}

function exact(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

export function menuItem(page: IJupyterLabPageFixture, label: string): Locator {
  return page.locator('.lm-Menu-itemLabel', { hasText: exact(label) });
}

/** Right-click a card and pick a context menu entry by its exact label. */
export async function runMenuItem(
  page: IJupyterLabPageFixture,
  card: Locator,
  label: string
): Promise<void> {
  await card.click({ button: 'right' });
  await menuItem(page, label).click();
}

export function dialog(page: IJupyterLabPageFixture, title: string): Locator {
  return page.locator('.jp-Dialog', {
    has: page.locator('.jp-Dialog-header', { hasText: exact(title) })
  });
}

/**
 * Wait for the dialog with this title, press its button, and return its body text.
 * The default is the accept button (OK, or Remove on a confirmation).
 */
export async function answerDialog(
  page: IJupyterLabPageFixture,
  title: string,
  button: 'accept' | 'reject' = 'accept'
): Promise<string> {
  const d = dialog(page, title);
  await expect(d).toBeVisible({ timeout: RESOLVE_TIMEOUT });
  const text = (await d.locator('.jp-Dialog-body').textContent()) ?? '';
  await d.locator(`.jp-Dialog-footer .jp-mod-${button}`).click();
  await expect(d).toBeHidden();
  return text;
}
