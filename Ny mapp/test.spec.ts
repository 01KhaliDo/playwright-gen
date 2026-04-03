import { test, expect } from '@playwright/test';

use: {
  video: 'on'
}
test('Login and checkout', async ({ page }) => { 
  await page.goto('https://www.saucedemo.com/');
  await page.getByPlaceholder('Username').fill('standard_user');
  await page.getByPlaceholder('Password').fill('secret_sauce');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('button', { name: 'View cart' }).click();
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByPlaceholder('First name').fill('John');
  await page.getByPlaceholder('Last name').fill('Doe');
  await page.getByPlaceholder('Postal code').fill('12345');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout - Order summary' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
});