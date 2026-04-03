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

  test('Happy Path: Navigation to Hem Page', async ({ page }) => {
    // User navigates to the Hem page successfully.
    // Click on the Hem button.
    gotoHem
  });

  test('Happy Path: Successful Dark Mode Toggle', async ({ page }) => {
    // User toggles dark mode successfully.
    // Click on the Dark Mode button.
    toggleDarkMode
  });

  test('Happy Path: Navigation to Live Demo Page', async ({ page }) => {
    // User navigates to the Live Demo page successfully.
    // Click on the Live Demo button.
    gotoLiveDemo
  });
});
