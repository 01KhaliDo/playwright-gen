import { Page, expect } from '@playwright/test';

/**
 * Page Object Model: ShortsPage
 * URL: https://www.youtube.com/shorts/
 * Webbsida: www.youtube.com
 */
export class ShortsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigera till sidan */
  async goto(): Promise<void> {
    await this.page.goto('https://www.youtube.com/shorts/');
    // OBS: Använd 'load' istället för 'networkidle' — moderna sidor timeout:ar annars
    await this.page.waitForLoadState('load');
  }

  /**
   * Select the Swedish language option
   */
  async selectLanguage(): Promise<void> {
    await this.page.$$eval('button[role='button'][name='Språk: Svenska']', el => el.click());
  }

  /**
   * Click the 'Logga in' button
   */
  async login(): Promise<void> {
    await this.page.$$eval('button:has-text("Logga in")', el => el.click());
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
