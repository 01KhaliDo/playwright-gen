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

  test('Negative: Invalid GitHub URL Input', async ({ page }) => {
    // User enters an invalid GitHub URL and submits it.
    // Enter an invalid GitHub URL in the input field.
    gotoGitHub
  });

  test('Negative: Missing Required Field for Contact Form', async ({ page }) => {
    // User attempts to submit a contact form without filling in all required fields.
    // Click on the Kontakt button and attempt to submit the form without filling in the name field.
    gotoKontakt
  });
});
