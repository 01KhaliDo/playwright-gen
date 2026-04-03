import { test, expect } from '@playwright/test';
import { YouTubePage } from './YouTubePage.po';

/**
 * Positive Test Scenarios
 * Genererad automatiskt av playwright-gen för: www.youtube.com
 */
test.describe('www.youtube.com — Positive Test Scenarios', () => {

  test.beforeEach(async ({ page }) => {
    // Navigera till startsidan före varje test
    await page.goto('https://www.youtube.com');
    await page.waitForLoadState('load');
  });

  test('Search for a video', async ({ page }) => {
    // Search for a video on the YouTube homepage
    const youTubePage = new YouTubePage(page);
    // Go to the YouTube homepage
    // TODO: YouTubePage: goBack

    // Enter a search query
    // TODO: Sök
  });

  test('Watch a video', async ({ page }) => {
    // Watch a video on the YouTube homepage
    const youTubePage = new YouTubePage(page);
    // Go to the YouTube homepage
    // TODO: YouTubePage: goBack

    // Click on a video thumbnail
    // TODO: button
  });

  test('Log in to YouTube', async ({ page }) => {
    // Log in to YouTube from the YouTube homepage
    const youTubePage = new YouTubePage(page);
    // Go to the YouTube homepage
    // TODO: YouTubePage: goBack

    // Click on the Logga in button
    // TODO: Logga in
  });
});
