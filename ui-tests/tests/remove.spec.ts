import * as fs from 'fs';
import * as path from 'path';
import { expect, test } from '@jupyterlab/galata';
import {
  labFixtures,
  answerDialog,
  displayNameFor,
  kernelCard,
  kernelspecs,
  makeUserKernelspec,
  makeVenv,
  registerEnv,
  registeredEnvNames,
  ROOT,
  runMenuItem,
  showLauncher,
  systemKernel
} from './helpers';

test.use(labFixtures as any);

const REMOVE = 'Remove Environment (dangerous)';

test.describe('Remove Environment', () => {
  test('ACC-REMOVE-21 Cancel deletes nothing', async ({ page }) => {
    const env = makeVenv('cancelproj/.venv');
    await registerEnv(page, env);
    const name = await displayNameFor(page, env);
    await showLauncher(page);

    await runMenuItem(page, kernelCard(page, name), REMOVE);
    await answerDialog(page, 'Remove Environment', 'reject');

    expect(fs.existsSync(env)).toBe(true);
    await showLauncher(page);
    await expect(kernelCard(page, name)).toBeVisible();
  });

  test('ACC-REMOVE-23 Remove unregisters and deletes a managed .venv', async ({
    page
  }) => {
    const env = makeVenv('rmproj/.venv');
    await registerEnv(page, env);
    const name = await displayNameFor(page, env);
    await showLauncher(page);

    await runMenuItem(page, kernelCard(page, name), REMOVE);
    const confirm = await answerDialog(page, 'Remove Environment');
    expect(confirm).toContain(path.relative(ROOT, env));
    await answerDialog(page, 'Environment Removed');

    expect(fs.existsSync(env)).toBe(false);
    await expect(kernelCard(page, name)).toHaveCount(0);
    expect(await registeredEnvNames(page)).not.toContain('rmproj');
  });

  test('ACC-REMOVE-22 a managed env outside a .venv is refused', async ({
    page
  }) => {
    const env = makeVenv('plainenv');
    await registerEnv(page, env);
    const name = await displayNameFor(page, env);
    await showLauncher(page);

    await runMenuItem(page, kernelCard(page, name), REMOVE);
    await answerDialog(page, 'Cannot Remove');

    expect(fs.existsSync(env)).toBe(true);
    await showLauncher(page);
    await expect(kernelCard(page, name)).toBeVisible();
  });

  test('ACC-REMOVE-24 a standalone kernelspec and its .venv are removed', async ({
    page
  }) => {
    // Not registered: nb_venv_kernels knows neither the kernelspec nor the env.
    const env = makeVenv('standalone-rm/.venv');
    const dir = makeUserKernelspec(
      'nbvk-standalone-rm',
      'Standalone Remove',
      env
    );
    await showLauncher(page);

    await runMenuItem(page, kernelCard(page, 'Standalone Remove'), REMOVE);
    const confirm = await answerDialog(page, 'Remove Standalone Kernelspec');
    expect(confirm).toContain(dir);
    expect(confirm).toContain(env);
    const done = await answerDialog(page, 'Kernelspec Removed');
    expect(done).toContain(`Also removed environment at: ${env}`);

    expect(fs.existsSync(dir)).toBe(false);
    expect(fs.existsSync(env)).toBe(false);
  });

  test('ACC-REMOVE-25 a system kernelspec is refused', async ({ page }) => {
    const system = await systemKernel(page);
    await showLauncher(page);

    await runMenuItem(page, kernelCard(page, system.displayName), REMOVE);
    await answerDialog(page, 'Cannot Remove System Kernelspec');

    expect((await kernelspecs(page)).map(s => s.name)).toContain(system.name);
  });
});
