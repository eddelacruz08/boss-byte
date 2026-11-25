import { expect, test } from '@playwright/test';
import { SEED_USERS, submitSignIn } from './helpers';

test.describe('sign-in', () => {
  test('explains what is missing without calling the API', async ({ page }) => {
    let loginRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/auth/login')) loginRequests += 1;
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('anything');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeHidden();
    expect(loginRequests).toBe(0);
  });

  test('refuses a wrong password and stays on the sign-in page', async ({ page }) => {
    await page.goto('/login');
    await submitSignIn(page, SEED_USERS.admin, 'not-the-right-password');

    await expect(page.getByRole('alert')).toContainText('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('sends a signed-out visitor to sign in and remembers where they were going', async ({
    page,
  }) => {
    await page.goto('/users?page=2');

    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/users?page=2');
  });

  test('links to registration and back', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Create one' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });
});
