import { expect, test } from '@playwright/test';
import { SEED_USERS, signIn } from './helpers';

test('an admin signs in, finds the seeded users and signs out', async ({ page }) => {
  await test.step('sign in and land on the dashboard', async () => {
    await signIn(page, SEED_USERS.admin);

    await expect(page).toHaveTitle(/Dashboard/);
    await expect(page.getByText(/Welcome back, Ada/)).toBeVisible();
    for (const label of ['Users', 'Active users', 'Files', 'Storage used']) {
      await expect(
        page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }),
      ).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  });

  await test.step('open the users page from the navigation', async () => {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Users' })
      .click();

    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('table', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New user' })).toBeVisible();
  });

  await test.step('search for a seeded account', async () => {
    await page.getByLabel('Search').fill(SEED_USERS.viewer);

    const row = page.getByRole('row').filter({ hasText: SEED_USERS.viewer });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Vera Viewer');
    // The search lives in the URL, so the filtered list can be shared or reloaded.
    await expect(page).toHaveURL(/search=viewer/);
    await expect(page.getByRole('row').filter({ hasText: SEED_USERS.manager })).toHaveCount(0);
  });

  await test.step('sign out from the account menu', async () => {
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step('the session is really gone', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });
});
