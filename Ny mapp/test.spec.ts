import { test, expect } from '@playwright/test'; 

  test.use({ video: 'on' });

test('Agent generated test: Logga in med e-post Khalido.h@hotmail.com och lösenord js^nRgx$H^d3C^. Klicka på', async ({ page }) => {
  await page.goto('https://login.ibrav-stage.com/');
  await page.getByLabel('E-mail').fill('Khalido.h@hotmail.com');
  await page.getByLabel('Password').fill('js^nRgx$H^d3C^');
  await page.getByRole('button', { name: 'Log in to your Varbi account' }).click();
  await page.locator('a[href="/position/list/"]:visible').click();
  await page.getByRole('button', { name: 'Ny annons' }).click();
  await page.getByPlaceholder('Annonsen saknar titel').fill('Testannons');
  await page.locator('#county-select').selectOption('Blekinge län');
  await page.locator('#job-town').fill('Stockholm');
  await page.locator('#job-comment').fill('Vi söker en engagerad medarbetare.');
  await page.locator('#org-desc').fill('Testorganisation');
  await page.locator('#job-hours').selectOption('Heltid');
  await page.locator('#job-type').selectOption('Tillsvidareanställning');
  await page.locator('#workinghours').fill('40');
  await page.locator('[name="city-select"]').selectOption('Karlshamn');
  await page.locator('a', { hasText: 'Spara' }).first().click();
  await expect(page.getByRole('button', { name: 'Visa annons' })).toBeVisible();
});
