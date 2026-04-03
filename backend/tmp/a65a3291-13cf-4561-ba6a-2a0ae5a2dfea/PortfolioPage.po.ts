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
   * Toggles the dark mode button
   */
  async toggleDarkMode(): Promise<void> {
    await page.locator('button').getByText('Dark Mode').click();
  }

  /**
   * Navigates to the Hem section
   */
  async gotoHem(): Promise<void> {
    await page.goto('/hem');
  }

  /**
   * Navigates to the Färdigheter section
   */
  async gotoFardigheter(): Promise<void> {
    await page.goto('/fardigheter');
  }

  /**
   * Navigates to the Projekt section
   */
  async gotoProjekt(): Promise<void> {
    await page.goto('/projekt');
  }

  /**
   * Navigates to the Kontakt section
   */
  async gotoKontakt(): Promise<void> {
    await page.goto('/kontakt');
  }

  /**
   * Navigates to the CV section
   */
  async gotoCV(): Promise<void> {
    await page.goto('/cv');
  }

  /**
   * Navigates to the Live Demo section
   */
  async gotoLiveDemo(): Promise<void> {
    await page.goto('/live-demo');
  }

  /**
   * Navigates to the GitHub section
   */
  async gotoGitHub(): Promise<void> {
    await page.goto('https://github.com/01khalido');
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
