import { test, expect } from '@playwright/test';
import { YouTubePage } from './YouTubePage.po';
import { ShortsPage } from './ShortsPage.po';
import { SubscriptionsPage } from './SubscriptionsPage.po';
import { YourPage } from './YourPage.po';

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

  test('Search for a video with invalid input', async ({ page }) => {
    // Search for a video with an invalid input, and verify the error message is displayed
    const youTubePage = new YouTubePage(page);
    const shortsPage = new ShortsPage(page);
    const subscriptionsPage = new SubscriptionsPage(page);
    const yourPage = new YourPage(page);
    // Go to the YouTube homepage
    YouTubePage.goToHomePage;

    // Search for a video with an invalid input
    YouTubePage.searchInvalidInput;
  });

  test('Try to login with invalid credentials', async ({ page }) => {
    // Try to login with invalid credentials, and verify the error message is displayed
    const youTubePage = new YouTubePage(page);
    const shortsPage = new ShortsPage(page);
    const subscriptionsPage = new SubscriptionsPage(page);
    const yourPage = new YourPage(page);
    // Go to the YouTube homepage
    YouTubePage.goToHomePage;

    // Click on the login button
    YouTubePage.clickOnLoginButton;

    // Enter invalid login credentials
    YouTubePage.loginInvalidCredentials;
  });
});
