import * as path from 'path';
import { expect, test } from '@jupyterlab/galata';
import {
  labFixtures,
  cardByLabel,
  displayNameFor,
  KERNEL_ATTR,
  kernelCard,
  makeUserKernelspec,
  makeVenv,
  menuItem,
  registerEnv,
  RESOLVE_TIMEOUT,
  ROOT,
  showLauncher,
  systemKernel
} from './helpers';

test.use(labFixtures as any);

const KERNEL_CARDS =
  '.jp-LauncherCard[data-category="Notebook"], .jp-LauncherCard[data-category="Console"]';
const OTHER_CARDS =
  '.jp-LauncherCard:not([data-category="Notebook"]):not([data-category="Console"])';

test.describe('kernel cards', () => {
  test('ACC-CARD-1 every kernel card carries the descriptor', async ({
    page
  }) => {
    await showLauncher(page);
    const cards = page.locator(KERNEL_CARDS);
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all()) {
      const label = (
        await card.locator('.jp-LauncherCard-label').textContent()
      )?.trim();
      await expect(card).toHaveAttribute(KERNEL_ATTR, label as string);
    }
  });

  test('ACC-CARD-1 a kernel without a logo carries the descriptor', async ({
    page
  }) => {
    makeUserKernelspec(
      'nbvk-nologo',
      'No Logo Kernel',
      path.join(ROOT, 'nologo', '.venv'),
      false
    );
    await showLauncher(page);
    const card = cardByLabel(page, 'No Logo Kernel').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute(KERNEL_ATTR, 'No Logo Kernel');
  });

  test('ACC-CARD-2 a card added after page load is stamped', async ({
    page
  }) => {
    await showLauncher(page);
    const env = makeVenv('late/.venv');
    await registerEnv(page, env);
    const name = await displayNameFor(page, env);
    await showLauncher(page);
    await expect(kernelCard(page, name)).toBeVisible();
  });

  test('ACC-CARD-3 non-kernel cards carry no descriptor', async ({ page }) => {
    await showLauncher(page);
    const cards = page.locator(OTHER_CARDS);
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all()) {
      await expect(card).not.toHaveAttribute(KERNEL_ATTR);
    }
  });

  test('ACC-CARD-4 the menu appears on kernel cards only', async ({ page }) => {
    const system = await systemKernel(page);
    await showLauncher(page);

    await kernelCard(page, system.displayName).click({ button: 'right' });
    for (const label of ['Show in File Browser', 'Open Terminal at Location']) {
      await expect(menuItem(page, label)).toBeVisible();
    }
    await page.keyboard.press('Escape');

    // A Lumino menu keeps hidden items in the DOM, so absence is toBeHidden, not a count.
    await page
      .locator(OTHER_CARDS)
      .filter({ hasText: 'Terminal' })
      .first()
      .click({ button: 'right' });
    await expect(menuItem(page, 'Show in File Browser')).toBeHidden();
    await expect(menuItem(page, 'Open Terminal at Location')).toBeHidden();
  });

  test('ACC-CARD-5 the hover tooltip lists the kernel details', async ({
    page
  }) => {
    const env = makeVenv('tooltip/.venv');
    await registerEnv(page, env);
    const name = await displayNameFor(page, env);
    await showLauncher(page);
    const card = kernelCard(page, name);
    await expect
      .poll(async () => (await card.getAttribute('title'))?.split('\n'), {
        timeout: RESOLVE_TIMEOUT
      })
      .toEqual(
        expect.arrayContaining([
          name,
          expect.stringMatching(/^Kernel name: +\S/),
          expect.stringMatching(/^Kind: +\S/),
          `Executable:    ${path.join(env, 'bin', 'python')}`
        ])
      );
  });
});
