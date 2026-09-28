import * as fs from 'fs';
import * as path from 'path';
import { expect, test } from '@jupyterlab/galata';
import {
  labFixtures,
  answerDialog,
  menuItem,
  cardByLabel,
  registeredEnvNames,
  dialog,
  displayNameFor,
  kernelCard,
  kernelspecs,
  makeUserKernelspec,
  makeVenv,
  registerEnv,
  ROOT,
  runMenuItem,
  showLauncher,
  systemKernel
} from './helpers';

test.use(labFixtures as any);

test.describe('Unregister Kernel', () => {
  test('ACC-UNREG-15 ACC-UNREG-16 ACC-UNREG-20 unregistering keeps the environment on disk', async ({
    page
  }) => {
    const env = makeVenv('unregproj/.venv');
    await registerEnv(page, env);
    const name = await displayNameFor(page, env);
    await showLauncher(page);

    await runMenuItem(page, kernelCard(page, name), 'Unregister Kernel');
    const body = await answerDialog(page, 'Kernel Unregistered');
    // nb_venv_kernels reports env paths relative to the workspace root.
    expect(body).toContain('nb_venv_kernels register ');
    expect(body).toContain(path.relative(ROOT, env));

    await expect(kernelCard(page, name)).toHaveCount(0);
    expect(await registeredEnvNames(page)).not.toContain('unregproj');
    expect(fs.existsSync(env)).toBe(true);
  });

  test('ACC-UNREG-11 ACC-UNREG-12 envs sharing a name prefix resolve to their own env', async ({
    page
  }) => {
    const demo = makeVenv('demo/.venv');
    const demoProd = makeVenv('demo-prod/.venv');
    await registerEnv(page, demo);
    await registerEnv(page, demoProd);
    const demoName = await displayNameFor(page, demo);
    const demoProdName = await displayNameFor(page, demoProd);
    await showLauncher(page);

    await runMenuItem(
      page,
      kernelCard(page, demoProdName),
      'Unregister Kernel'
    );
    const body = await answerDialog(page, 'Kernel Unregistered');
    expect(body).toContain(`"${path.basename(path.dirname(demoProd))}"`);

    await expect(kernelCard(page, demoProdName)).toHaveCount(0);
    await expect(kernelCard(page, demoName)).toBeVisible();
  });

  test('ACC-UNREG-14 a standalone kernelspec in a managed .venv resolves as standalone', async ({
    page
  }) => {
    const env = makeVenv('shared/.venv');
    await registerEnv(page, env);
    const managed = await displayNameFor(page, env);
    const dir = makeUserKernelspec('nbvk-shared', 'Shared Standalone', env);
    await showLauncher(page);

    await runMenuItem(
      page,
      kernelCard(page, 'Shared Standalone'),
      'Unregister Kernel'
    );
    await answerDialog(page, 'Kernelspec Removed');

    expect(fs.existsSync(dir)).toBe(false);
    expect(fs.existsSync(env)).toBe(true);
    await showLauncher(page);
    await expect(kernelCard(page, managed)).toBeVisible();
  });

  test('ACC-UNREG-17 a local standalone kernelspec is deleted', async ({
    page
  }) => {
    // Its environment is already gone, as with a kernelspec left dangling.
    const dir = makeUserKernelspec(
      'nbvk-dangling',
      'Dangling Standalone',
      path.join(ROOT, 'gone', '.venv')
    );
    await showLauncher(page);

    await runMenuItem(
      page,
      kernelCard(page, 'Dangling Standalone'),
      'Unregister Kernel'
    );
    await answerDialog(page, 'Kernelspec Removed');

    expect(fs.existsSync(dir)).toBe(false);
    await expect(cardByLabel(page, 'Dangling Standalone')).toHaveCount(0);
  });

  test('ACC-UNREG-18 a system kernelspec is refused', async ({ page }) => {
    const system = await systemKernel(page);
    await showLauncher(page);

    await runMenuItem(
      page,
      kernelCard(page, system.displayName),
      'Unregister Kernel'
    );
    await answerDialog(page, 'Cannot Remove System Kernelspec');

    expect((await kernelspecs(page)).map(s => s.name)).toContain(system.name);
  });

  test('ACC-UNREG-19 a spinner shows while the environment is resolved', async ({
    page
  }) => {
    const system = await systemKernel(page);
    await showLauncher(page);
    await page.route('**/api/kernel-path/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });

    await runMenuItem(
      page,
      kernelCard(page, system.displayName),
      'Unregister Kernel'
    );
    await expect(
      dialog(page, 'Please Wait').filter({
        hasText: 'Resolving environment...'
      })
    ).toBeVisible();
    await answerDialog(page, 'Cannot Remove System Kernelspec');
  });
});

test.describe('without nb_venv_kernels', () => {
  // The route must be in place before the app loads: availability is
  // checked once, at activation.
  test.use({ autoGoto: false });

  test('ACC-UNREG-10 Unregister and Remove are hidden', async ({ page }) => {
    await page.route(/\/nb-venv-kernels\/environments(\?|$)/, route =>
      route.fulfill({ status: 404, body: '{}' })
    );
    await page.goto();
    const system = await systemKernel(page);
    await showLauncher(page);

    await kernelCard(page, system.displayName).click({ button: 'right' });
    await expect(menuItem(page, 'Show in File Browser')).toBeVisible();
    await expect(menuItem(page, 'Unregister Kernel')).toBeHidden();
    await expect(menuItem(page, 'Remove Environment (dangerous)')).toBeHidden();
  });
});
