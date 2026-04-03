import { test, expect } from '@playwright/test';
import { YouTubePage } from './YouTubePage.po';

/**
 * Negative Test Scenarios
 * Genererad automatiskt av playwright-gen för: www.youtube.com
 */
test.describe('www.youtube.com — Negative Test Scenarios', () => {

  test.beforeEach(async ({ page }) => {
    // Navigera till startsidan före varje test
    await page.goto('https://www.youtube.com');
    await page.waitForLoadState('load');
  });

  test('Invalid login credentials', async ({ page }) => {
    // Attempt to log in to YouTube with invalid credentials
    const youTubePage = new YouTubePage(page);
    // Go to the YouTube homepage
    // TODO: YouTubePage: goBack

    // Click on the Logga in button
    // TODO: Logga in

    // Enter invalid login credentials
    // TODO: Logga in
  });

  test('Missing required fields', async ({ page }) => {
    // Attempt to log in to YouTube without filling in required fields
    const youTubePage = new YouTubePage(page);
    // Go to the YouTube homepage
    // TODO: YouTubePage: goBack

    // Click on the Logga in button
    // TODO: Logga in

    // Attempt to log in without filling in required fields
    // TODO: Logga in
  });
});
