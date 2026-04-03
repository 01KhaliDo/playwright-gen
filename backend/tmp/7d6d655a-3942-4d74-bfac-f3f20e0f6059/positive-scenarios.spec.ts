import { test, expect } from '@playwright/test';
import { YouTubePage } from './YouTubePage.po';
import { ShortsPage } from './ShortsPage.po';
import { SubscriptionsPage } from './SubscriptionsPage.po';
import { YourPage } from './YourPage.po';

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

  test('Search for a video and navigate to its page', async ({ page }) => {
    // Search for a video, click on the search result, and navigate to its page
    const youTubePage = new YouTubePage(page);
    const shortsPage = new ShortsPage(page);
    const subscriptionsPage = new SubscriptionsPage(page);
    const yourPage = new YourPage(page);
    // Go to the YouTube homepage
    YouTubePage.goToHomePage;

    // Search for a video
    YouTubePage.search;

    // Click on a search result
    YouTubePage.clickOnSearchResult;
  });

  test('Login and navigate to subscriptions page', async ({ page }) => {
    // Login to the account, navigate to the subscriptions page, and verify the subscriptions are displayed
    const youTubePage = new YouTubePage(page);
    const shortsPage = new ShortsPage(page);
    const subscriptionsPage = new SubscriptionsPage(page);
    const yourPage = new YourPage(page);
    // Go to the YouTube homepage
    YouTubePage.goToHomePage;

    // Click on the login button
    YouTubePage.clickOnLoginButton;

    // Enter valid login credentials
    YouTubePage.login;

    // Navigate to the subscriptions page
    SubscriptionsPage.goToPage;

    // Verify the subscriptions are displayed
    SubscriptionsPage.verifySubscriptions;
  });

  test('Navigate to your page and verify the videos are displayed', async ({ page }) => {
    // Navigate to the your page, and verify the videos are displayed
    const youTubePage = new YouTubePage(page);
    const shortsPage = new ShortsPage(page);
    const subscriptionsPage = new SubscriptionsPage(page);
    const yourPage = new YourPage(page);
    // Go to the YouTube homepage
    YouTubePage.goToHomePage;

    // Click on the your page button
    YouTubePage.clickOnYourPageButton;

    // Verify the videos are displayed
    YourPage.verifyVideos;
  });
});
