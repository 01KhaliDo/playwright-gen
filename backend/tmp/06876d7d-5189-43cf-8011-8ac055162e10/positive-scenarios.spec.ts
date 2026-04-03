import { test, expect } from '@playwright/test';
import { HomePage } from './HomePage.po';

/**
 * Positive Test Scenarios
 * Genererad automatiskt av playwright-gen för: example.com
 */
test.describe('example.com — Positive Test Scenarios', () => {

  test.beforeEach(async ({ page }) => {
    // Navigera till startsidan före varje test
    await page.goto('https://example.com');
    await page.waitForLoadState('load');
  });

  test('Successful Learn More Click', async ({ page }) => {
    // User clicks the 'Learn more' button on the homepage
    const homePage = new HomePage(page);
    // User navigates to the homepage
    // TODO: HomePage (kunde inte omvandlas automatiskt)

    // User clicks the 'Learn more' button
    await homePage.learnMore();
  });

  test('Successful Homepage Navigation', async ({ page }) => {
    // User navigates to the homepage and verifies the title
    const homePage = new HomePage(page);
    // User navigates to the homepage
    // TODO: HomePage (kunde inte omvandlas automatiskt)

    // User verifies the title
    // TODO: verifyTitle (kunde inte omvandlas automatiskt)
  });
});
