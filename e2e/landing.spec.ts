import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('loads successfully with title', async ({ page }) => {
    await page.goto('/');
    // Wait for the page to be loaded
    await expect(page).toHaveURL('/');
    // The page should have some content rendered
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('contains a primary call-to-action', async ({ page }) => {
    await page.goto('/');
    // Look for any button or link that serves as a CTA
    const cta = page.locator('button, a[href]').first();
    await expect(cta).toBeVisible();
  });

  test('page title is set', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
