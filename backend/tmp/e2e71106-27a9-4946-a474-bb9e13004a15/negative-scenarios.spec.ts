import { test, expect } from '@playwright/test';
import { YouTubePage } from './YouTubePage.po';

/**
 * Negative Test Scenarios
 * Genererad automatiskt av playwright-gen för: www.youtube.com
 */
test.describe('www.youtube.com — Negative Test Scenarios', () => {

  test.beforeEach(async ({ page }) => {
    // Navigera till startsidan före varje test
    await page.goto('https://www.youtube.com/');
    await page.waitForLoadState('load');
  });

  test('Invalid Search Query on YouTube Home Page', async ({ page }) => {
    // User enters an invalid search query on the YouTube home page
    const youTubePage = new YouTubePage(page);
    // User enters an invalid search query on the YouTube home page
    // TODO: Search (kunde inte omvandlas automatiskt)
  });

  test('Missing Search Query on YouTube Home Page', async ({ page }) => {
    // User fails to enter a search query on the YouTube home page
    const youTubePage = new YouTubePage(page);
    // User does not enter a search query on the YouTube home page
    // TODO: Search (kunde inte omvandlas automatiskt)
  });
});
