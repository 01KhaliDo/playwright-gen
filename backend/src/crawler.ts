// =============================================================================
// crawler.ts — Playwright-baserad web crawler
// Crawlar en webbsida och returnerar information om element, formulär, länkar.
// Används som indata till AI:n för att generera relevanta tester.
// =============================================================================
import { chromium, Browser, Page as PlaywrightPage } from 'playwright';
import { CrawlResult, ElementInfo, FormInfo, LinkInfo } from './types';
import { logger } from './logger';

export class CrawlerService {
    private browser: Browser | null = null;
    private visitedUrls = new Set<string>();
    private maxPages: number;

    constructor(maxPages = 5) {
        this.maxPages = maxPages;
    }

    /** Startar headless Chrome-webbläsaren */
    async initialize(): Promise<void> {
        this.browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }

    /** Stänger webbläsaren */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    /** Crawlar hela webbsidan med start-URL, följer interna länkar */
    async crawlSite(baseUrl: string): Promise<CrawlResult[]> {
        if (!this.browser) throw new Error('Browser not initialized — call initialize() first');

        const results: CrawlResult[] = [];
        const baseHost = new URL(baseUrl).hostname;
        this.visitedUrls.clear();

        try {
            const page = await this.browser.newPage();
            await page.setViewportSize({ width: 1280, height: 720 });
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            });

            await this.crawlPage(page, baseUrl, baseHost, results);
            await page.close();
        } catch (error) {
            logger.error(`Crawler error: ${error}`);
            throw error;
        }

        return results;
    }

    /** Crawlar en enskild sida och letar rekursivt efter interna länkar */
    private async crawlPage(
        page: PlaywrightPage,
        url: string,
        baseHost: string,
        results: CrawlResult[]
    ): Promise<void> {
        if (this.visitedUrls.has(url) || results.length >= this.maxPages) return;
        this.visitedUrls.add(url);

        try {
            logger.info(`Crawling: ${url}`);
            const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });

            // Hoppa över om sidan returnerar fel
            if (!response || response.status() >= 400) {
                logger.warn(`Skipping ${url} — HTTP ${response?.status()}`);
                return;
            }

            // Samla in data om sidan
            const result = await this.extractPageData(page, url);
            results.push(result);

            // Hitta och följ interna länkar (om vi inte nått max-gränsen)
            if (results.length < this.maxPages) {
                const internalLinks = result.links
                    .map(link => link.href)
                    .filter(href => {
                        try {
                            return new URL(href).hostname === baseHost;
                        } catch {
                            return false;
                        }
                    });

                for (const link of internalLinks) {
                    if (results.length >= this.maxPages) break;
                    await this.crawlPage(page, link, baseHost, results);
                }
            }
        } catch (error) {
            logger.warn(`Failed to crawl ${url}: ${error}`);
        }
    }

    /** Extraherar element, formulär och länkar från en sida */
    private async extractPageData(page: PlaywrightPage, url: string): Promise<CrawlResult> {
        const title = await page.title();
        const elements = await this.extractElements(page);
        const forms = await this.extractForms(page);
        const links = await this.extractLinks(page);

        logger.info(`  → Found ${elements.length} elements, ${forms.length} forms, ${links.length} links`);

        return { url, title, elements, forms, links };
    }

    /** Hittar alla interaktiva element på sidan */
    private async extractElements(page: PlaywrightPage): Promise<ElementInfo[]> {
        return page.evaluate(() => {
            const elements: ElementInfo[] = [];
            const selectors = [
                'button', 'a', 'input', 'select', 'textarea',
                '[role="button"]', '[role="link"]', '[role="menuitem"]',
            ];

            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    const htmlEl = el as HTMLElement;
                    const info: ElementInfo = {
                        tag: el.tagName.toLowerCase(),
                        text: htmlEl.textContent?.trim().substring(0, 100),
                        role: el.getAttribute('role') || undefined,
                        name: el.getAttribute('name') || undefined,
                        label: el.getAttribute('aria-label') || undefined,
                        placeholder: (el as HTMLInputElement).placeholder || undefined,
                        alt: (el as HTMLImageElement).alt || undefined,
                        'data-testid': el.getAttribute('data-testid') || undefined,
                        'aria-label': el.getAttribute('aria-label') || undefined,
                        href: (el as HTMLAnchorElement).href || undefined,
                    };

                    // Bygg en Playwright-locator-sträng baserat på bästa tillgängliga selector
                    if (info['aria-label']) {
                        info.locator = `getByRole('${info.tag}', { name: '${info['aria-label']}' })`;
                    } else if (info.label) {
                        info.locator = `getByLabel('${info.label}')`;
                    } else if (info.placeholder) {
                        info.locator = `getByPlaceholder('${info.placeholder}')`;
                    } else if (info.text && info.text.length < 50) {
                        info.locator = `getByText('${info.text}')`;
                    } else if (info['data-testid']) {
                        info.locator = `getByTestId('${info['data-testid']}')`;
                    } else {
                        info.locator = `locator('${selector}')`;
                    }

                    // Filtrera bort element utan meningsfull information
                    if (info.text || info.placeholder || info['aria-label'] || info['data-testid']) {
                        elements.push(info);
                    }
                });
            });

            return elements.slice(0, 50); // Max 50 element per sida
        });
    }

    /** Hittar alla formulär och deras fält */
    private async extractForms(page: PlaywrightPage): Promise<FormInfo[]> {
        return page.evaluate(() => {
            const forms: FormInfo[] = [];
            document.querySelectorAll('form').forEach(form => {
                const fields: ElementInfo[] = [];
                form.querySelectorAll('input, select, textarea, button').forEach(field => {
                    const htmlField = field as HTMLInputElement;
                    fields.push({
                        tag: field.tagName.toLowerCase(),
                        name: htmlField.name || undefined,
                        placeholder: htmlField.placeholder || undefined,
                        label: field.getAttribute('aria-label') || undefined,
                        role: field.getAttribute('type') || undefined,
                    });
                });

                forms.push({
                    action: form.action || '',
                    method: form.method || 'get',
                    fields,
                });
            });
            return forms;
        });
    }

    /** Hittar alla interna och externa länkar */
    private async extractLinks(page: PlaywrightPage): Promise<LinkInfo[]> {
        return page.evaluate(() => {
            const links: LinkInfo[] = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const href = (a as HTMLAnchorElement).href;
                const text = a.textContent?.trim() || '';
                if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
                    links.push({ href, text });
                }
            });
            return [...new Map(links.map(l => [l.href, l])).values()].slice(0, 30);
        });
    }
}
