import { test, expect } from '@playwright/test';
import { PortfolioPage } from './PortfolioPage.po';

/**
 * Positive Test Scenarios
 * Genererad automatiskt av playwright-gen för: 01khalido.github.io
 */
test.describe('01khalido.github.io — Positive Test Scenarios', () => {

  test.beforeEach(async ({ page }) => {
    // Navigera till startsidan före varje test
    await page.goto('https://01khalido.github.io/portfolio/');
    await page.waitForLoadState('load');
  });

  test('Positive: Navigation to Hem Page', async ({ page }) => {
    // User navigates to Hem page from the main portfolio page
    const portfolioPage = new PortfolioPage(page);
    // User clicks on Hem link on the main portfolio page
    PortfolioPage.goToHem;
  });

  test('Positive: Toggle Dark Mode', async ({ page }) => {
    // User toggles the dark mode on the main portfolio page
    const portfolioPage = new PortfolioPage(page);
    // User clicks on the Dark Mode button on the main portfolio page
    PortfolioPage.toggleDarkMode;
  });

  test('Positive: Navigation to Färdigheter Page', async ({ page }) => {
    // User navigates to Färdigheter page from the main portfolio page
    const portfolioPage = new PortfolioPage(page);
    // User clicks on Färdigheter link on the main portfolio page
    PortfolioPage.goToFardigheter;
  });
});
