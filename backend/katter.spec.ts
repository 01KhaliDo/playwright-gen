import { test, expect } from '@playwright/test'; 

test.use({ video: 'on' });

test('Sök efter katter på YouTube, öppna den första videon i sökresultatet och verifiera att en videosida öppnas.', async ({ page }) => {
  await page.goto('https://www.youtube.com/');
  await page.getByPlaceholder('Sök').fill('katter');
  await page.getByRole('button', { name: 'Sök' }).click();
  await expect(page.locator('text="Katter"')).toBeVisible();
});