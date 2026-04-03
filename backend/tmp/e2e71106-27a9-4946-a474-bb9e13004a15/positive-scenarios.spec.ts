import { test, expect } from '@playwright/test';
import { YouTubePage } from './YouTubePage.po';

/**
 * Positive Test Scenarios
 * Genererad automatiskt av playwright-gen för: www.youtube.com
 */
test.describe('www.youtube.com — Positive Test Scenarios', () => {

  test.beforeEach(async ({ page }) => {
    // Navigera till startsidan före varje test
    await page.goto('https://www.youtube.com/');
    await page.waitForLoadState('load');
  });

  test('Successful Navigation to YouTube Home Page', async ({ page }) => {
    // User successfully navigates to the YouTube home page
    const youTubePage = new YouTubePage(page);
    // User visits the YouTube home page
    // TODO: YouTubePage: goBack (kunde inte omvandlas automatiskt)
  });

  test('Successful Search on YouTube Home Page', async ({ page }) => {
    // User successfully searches for a video on the YouTube home page
    const youTubePage = new YouTubePage(page);
    // User enters search query on the YouTube home page
    // TODO: Search (kunde inte omvandlas automatiskt)
  });

  test('Successful Navigation to YouTube Shorts Page', async ({ page }) => {
    // User successfully navigates to the YouTube Shorts page
    const youTubePage = new YouTubePage(page);
    // User clicks on the YouTube Shorts link
    // TODO: YouTubePage: goBack (kunde inte omvandlas automatiskt)
  });
});
