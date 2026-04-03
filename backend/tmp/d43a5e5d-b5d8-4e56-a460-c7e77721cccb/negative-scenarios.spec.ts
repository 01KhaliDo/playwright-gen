import { test, expect } from '@playwright/test';
import { PortfolioPage } from './PortfolioPage.po';

/**
 * Negative Test Scenarios
 * Genererad automatiskt av playwright-gen för: 01khalido.github.io
 */
test.describe('01khalido.github.io — Negative Test Scenarios', () => {

  test.beforeEach(async ({ page }) => {
    // Navigera till startsidan före varje test
    await page.goto('https://01khalido.github.io/portfolio/');
    await page.waitForLoadState('load');
  });

  test('Negative: Invalid GitHub URL', async ({ page }) => {
    // User enters an invalid GitHub URL in the GitHub link field
    const portfolioPage = new PortfolioPage(page);
    // User enters an invalid GitHub URL in the GitHub link field
    PortfolioPage.goToGitHub;
  });

  test('Negative: Missing Required Field', async ({ page }) => {
    // User attempts to submit the form without filling in the required field
    const portfolioPage = new PortfolioPage(page);
    // User clicks the submit button without filling in the required field
    PortfolioPage.submitForm;
  });
});
