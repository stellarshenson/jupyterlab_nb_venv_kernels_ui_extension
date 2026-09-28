import { expect, test } from '@jupyterlab/galata';
import * as fs from 'fs';
import * as path from 'path';
import {
  answerDialog,
  kernelCard,
  kernelspecs,
  labFixtures,
  makeUserKernelspec,
  ROOT,
  runMenuItem,
  showLauncher,
  systemKernel
} from './helpers';

test.use(labFixtures as any);

test.describe('server API', () => {
  test('ACC-API-26 kernel-path returns the kernel details', async ({
    page
  }) => {
    const system = await systemKernel(page);
    const response = await page.request.get(
      `/api/kernel-path/${encodeURIComponent(system.displayName)}`
    );
    expect(response.status()).toBe(200);
    const info = await response.json();
    for (const field of [
      'kernel_name',
      'executable_path',
      'resource_dir',
      'env_path',
      'is_global_conda',
      'is_local'
    ]) {
      expect(info).toHaveProperty(field);
    }
    expect(info.kernel_name).toBe(system.name);
  });

  test('ACC-API-27 kernel-path returns 404 for an unknown display name', async ({
    page
  }) => {
    const response = await page.request.get(
      '/api/kernel-path/' + encodeURIComponent('No Such Kernel 7f3a')
    );
    expect(response.status()).toBe(404);
  });

  test('ACC-API-30 kernel-path returns 409 for a display name shared across directories', async ({
    page
  }) => {
    makeUserKernelspec(
      'nbvk-twin-a',
      'Twin Kernel',
      path.join(ROOT, 'twin-a', '.venv')
    );
    makeUserKernelspec(
      'nbvk-twin-b',
      'Twin Kernel',
      path.join(ROOT, 'twin-b', '.venv')
    );
    const response = await page.request.get(
      `/api/kernel-path/${encodeURIComponent('Twin Kernel')}`
    );
    expect(response.status()).toBe(409);
    expect((await response.json()).error).toContain('nbvk-twin-a');
  });

  test('ACC-API-32 the refusal dialog shows the server reason', async ({
    page
  }) => {
    makeUserKernelspec(
      'nbvk-twin-a',
      'Twin Kernel',
      path.join(ROOT, 'twin-a', '.venv')
    );
    makeUserKernelspec(
      'nbvk-twin-b',
      'Twin Kernel',
      path.join(ROOT, 'twin-b', '.venv')
    );
    await showLauncher(page);

    for (const [item, title] of [
      ['Show in File Browser', 'Kernel Not Resolved'],
      ['Open Terminal at Location', 'Kernel Not Resolved'],
      ['Unregister Kernel', 'Cannot Unregister'],
      ['Remove Environment (dangerous)', 'Cannot Remove']
    ]) {
      await runMenuItem(page, kernelCard(page, 'Twin Kernel').first(), item);
      // showErrorMessage offers only Close, a reject button
      const body = await answerDialog(page, title, 'reject');
      expect(body).toContain('nbvk-twin-a');
      expect(body).toContain('nbvk-twin-b');
      expect(body).toContain('distinct display_name');
      // A managed env's card name comes from name_format, not kernel.json
      expect(body).not.toContain('kernel.json');
    }
  });

  test('ACC-API-28 kernelspec-remove refuses a non-local kernelspec', async ({
    page
  }) => {
    const system = await systemKernel(page);
    const response = await page.request.delete(
      `/api/kernelspec-remove/${encodeURIComponent(system.name)}`
    );
    expect(response.status()).toBe(403);
    expect((await kernelspecs(page)).map(s => s.name)).toContain(system.name);
  });

  test('ACC-API-29 kernelspec-remove returns 404 for an unknown name', async ({
    page
  }) => {
    const response = await page.request.delete(
      '/api/kernelspec-remove/nbvk-no-such-kernel-7f3a'
    );
    expect(response.status()).toBe(404);
  });

  test('ACC-API-31 venv-remove refuses a directory that is not a .venv', async ({
    page
  }) => {
    const dir = path.join(ROOT, 'not-a-venv');
    fs.mkdirSync(dir, { recursive: true });
    const response = await page.request.post('/api/venv-remove', {
      data: { path: dir }
    });
    expect(response.status()).toBe(400);
    expect(fs.existsSync(dir)).toBe(true);
  });
});
