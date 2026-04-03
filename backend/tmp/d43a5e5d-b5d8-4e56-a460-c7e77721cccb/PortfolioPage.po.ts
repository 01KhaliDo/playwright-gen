import { Page, expect } from '@playwright/test';

/**
 * Page Object Model: PortfolioPage
 * URL: https://01khalido.github.io/portfolio/
 * Webbsida: 01khalido.github.io
 */
export class PortfolioPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigera till sidan */
  async goto(): Promise<void> {
    await this.page.goto('https://01khalido.github.io/portfolio/');
    // OBS: Använd 'load' istället för 'networkidle' — moderna sidor timeout:ar annars
    await this.page.waitForLoadState('load');
  }

  /**
   * Go back to the previous page
   */
  async goBack(): Promise<void> {
    await this.page.locator('button').getByText('‹').click();
  }

  /**
   * Go forward to the next page
   */
  async goForward(): Promise<void> {
    await this.page.locator('button').getByText('›').click();
  }

  /**
   * Toggle the dark mode
   */
  async toggleDarkMode(): Promise<void> {
    await this.page.locator('button').getByText('Dark Mode').click();
  }

  /**
   * Go to the Hem section
   */
  async goToHem(): Promise<void> {
    await this.page.locator('a').getByText('Hem').click();
  }

  /**
   * Go to the Färdigheter section
   */
  async goToFardigheter(): Promise<void> {
    await this.page.locator('a').getByText('Färdigheter').click();
  }

  /**
   * Go to the Projekt section
   */
  async goToProjekt(): Promise<void> {
    await this.page.locator('a').getByText('Projekt').click();
  }

  /**
   * Go to the Kontakt section
   */
  async goToKontakt(): Promise<void> {
    await this.page.locator('a').getByText('Kontakt').click();
  }

  /**
   * Go to the CV section
   */
  async goToCV(): Promise<void> {
    await this.page.locator('a').getByText('CV').click();
  }

  /**
   * Go to the Live demo section
   */
  async goToLiveDemo(): Promise<void> {
    await this.page.locator('a').getByText('Live demo').click();
  }

  /**
   * Go to the GitHub section
   */
  async goToGitHub(): Promise<void> {
    await this.page.locator('a').getByText('GitHub').click();
  }

  // --- Hjälpmetoder ---

  /** Vänta på att sidan ska laddas */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('load');
  }

  /** Hämta sidans URL */
  async getUrl(): Promise<string> {
    return this.page.url();
  }

  /** Hämta sidans titel */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /** Kolla om ett element är synligt (returnerar true/false, kastar inte fel) */
  async isVisible(selector: string): Promise<boolean> {
    try {
      await this.page.locator(selector).first().waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
