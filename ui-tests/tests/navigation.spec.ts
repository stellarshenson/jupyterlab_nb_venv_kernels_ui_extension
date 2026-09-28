import * as fs from 'fs';
import * as path from 'path';
import { expect, test } from '@jupyterlab/galata';
import {
  answerDialog,
  kernelspecs,
  labFixtures,
  displayNameFor,
  kernelCard,
  makeVenv,
  recordFileBrowserNavigation,
  registerEnv,
  RESOLVE_TIMEOUT,
  ROOT,
  runMenuItem,
  showLauncher
} from './helpers';

test.use(labFixtures as any);

test.describe('navigation', () => {
  test('ACC-NAV-6 ACC-NAV-7 Show in File Browser opens the project root above .venv', async ({
    page
  }) => {
    const env = makeVenv('navproj/.venv');
    await registerEnv(page, env);
    const name = await displayNameFor(page, env);
    await showLauncher(page);

    const navigations = await recordFileBrowserNavigation(page);

    await runMenuItem(page, kernelCard(page, name), 'Show in File Browser');
    // Core's own calls - the restore bounce, periodic `.` refreshes - share the log.
    await expect
      .poll(navigations, { timeout: RESOLVE_TIMEOUT })
      .toContain('/navproj');
  });

  test('ACC-NAV-8 Open Terminal at Location starts in the project root', async ({
    page
  }) => {
    const env = makeVenv('termproj/.venv');
    await registerEnv(page, env);
    const name = await displayNameFor(page, env);
    await showLauncher(page);

    await runMenuItem(
      page,
      kernelCard(page, name),
      'Open Terminal at Location'
    );
    const terminal = page.locator('.jp-Terminal');
    await expect(terminal).toBeVisible({ timeout: RESOLVE_TIMEOUT });
    await terminal.click();

    // Keystrokes sent before the shell is attached are lost, so type until the
    // file appears; the command is idempotent.
    const out = path.join(ROOT, 'termproj-cwd.txt');
    await expect(async () => {
      await page.keyboard.type(`pwd > '${out}'`);
      await page.keyboard.press('Enter');
      expect(fs.existsSync(out)).toBe(true);
    }).toPass({ timeout: 30000, intervals: [1000] });
    await expect
      .poll(() => fs.readFileSync(out, 'utf-8').trim())
      .toBe(fs.realpathSync(path.join(ROOT, 'termproj')));
  });

  test('ACC-NAV-9 a global conda environment shows a dialog instead of navigating', async ({
    page
  }) => {
    let globalConda = '';
    for (const s of await kernelspecs(page)) {
      const response = await page.request.get(
        `/api/kernel-path/${encodeURIComponent(s.spec.display_name)}`
      );
      if (response.ok() && (await response.json()).is_global_conda) {
        globalConda = s.spec.display_name;
        break;
      }
    }
    test.skip(!globalConda, 'no global conda kernel on this machine');
    await showLauncher(page);
    const navigations = await recordFileBrowserNavigation(page);

    await runMenuItem(
      page,
      kernelCard(page, globalConda),
      'Show in File Browser'
    );
    await answerDialog(page, 'Global Conda Environment');
    // A conda env outside the root would resolve to '/', where the command
    // used to send the browser; core's own `.` refreshes are not ours.
    expect(await navigations()).not.toContain('/');

    await runMenuItem(
      page,
      kernelCard(page, globalConda),
      'Open Terminal at Location'
    );
    await answerDialog(page, 'Global Conda Environment');
    await expect(page.locator('.jp-Terminal')).toHaveCount(0);
  });
});
