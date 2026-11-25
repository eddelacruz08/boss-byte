import { expect, type Page } from '@playwright/test';

/** The accounts `npm run db:seed` creates. They all share one password. */
export const SEED_PASSWORD = 'BossByte-Dev-2026';
export const SEED_USERS = {
  admin: 'admin@bossbyte.local',
  manager: 'manager@bossbyte.local',
  staff: 'staff@bossbyte.local',
  viewer: 'viewer@bossbyte.local',
} as const;

/** Fills in the sign-in form and submits it. Expects the sign-in page to be open. */
export async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/**
 * Signs in through the UI and waits for the dashboard.
 *
 * Sign-in is rate limited (see playwright.config.ts), so call this once per
 * test rather than once per step.
 */
export async function signIn(page: Page, email: string = SEED_USERS.admin): Promise<void> {
  await page.goto('/login');
  await submitSignIn(page, email, SEED_PASSWORD);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}
