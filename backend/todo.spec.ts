import { test, expect } from '@playwright/test';
test.use({ video: 'on' });
test('Add and remove Todo items', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc');
  await page.getByPlaceholder('What needs to be done?').fill('Todo 1');
  await page.getByPlaceholder('What needs to be done?').press('Enter');
  await page.getByPlaceholder('What needs to be done?').fill('Todo 2');
  await page.getByPlaceholder('What needs to be done?').press('Enter');
  await expect(page.locator('text="Todo 1"')).toBeVisible();
  await expect(page.locator('text="Todo 2"')).toBeVisible();
  await page.locator('text="Todo 1"').locator('input[type="checkbox"]').click();
  await page.locator('text="Todo 2"').locator('input[type="checkbox"]').hover();
  await page.locator('text="Todo 2"').locator('input[type="checkbox"]').locator('input[type="checkbox"]').click();
  await expect(page.locator('text="Todo 2"')).not.toBeVisible();
});