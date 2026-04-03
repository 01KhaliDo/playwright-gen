import { test, expect } from '@playwright/test';

test('klicka på live demo', async ({ page }) => {
  await page.goto('https://01khalido.github.io/portfolio/');
  await page.locator('text="Live demo"').click();
  await expect(page.locator('text="Live demo"')).toBeVisible();
});