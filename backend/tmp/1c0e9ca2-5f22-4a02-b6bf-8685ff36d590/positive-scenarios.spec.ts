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
    // User navigates to the homepage
    HomePage

    // User clicks the 'Learn more' button
    learnMore
  });

  test('Successful Homepage Navigation', async ({ page }) => {
    // User navigates to the homepage and verifies the title
    // User navigates to the homepage
    HomePage

    // User verifies the title
    verifyTitle
  });
});
