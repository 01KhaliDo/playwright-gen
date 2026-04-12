import { test, expect } from '@playwright/test'; 

  test.use({ video: 'on' });

test('OrangeHRM login and PIM search', async ({ page }) => {
  await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/auth/login');
  await page.getByPlaceholder('Username').fill('Admin');
    await page.getByPlaceholder('Password').fill('admin123');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByRole('link', { name: 'PIM' }).click();
    await page.getByPlaceholder('Search').fill('Admin');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('link', { name: 'Admin'})).toBeVisible();
});

