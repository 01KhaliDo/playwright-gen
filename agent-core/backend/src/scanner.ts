// =============================================================================
// scanner.ts — Single-page DOM scanner using Playwright
//
// Skillnad mot crawler.ts:
//   - Besöker EN sida, följer inga länkar
//   - Returnerar tydligt uppdelad data: buttons, inputs, forms, links, headings
//   - Ingen rekursion, ingen crawling
//
// Används av: GET /api/scan?url=...
// =============================================================================

import { chromium } from 'playwright';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export interface ButtonInfo {
    text: string | null;
    ariaLabel: string | null;
    id: string | null;
    role: string | null;
    dataTestId: string | null;
    disabled: boolean;
    visible: boolean;
    locator: string;
}

export interface InputInfo {
    name: string | null;
    type: string | null;
    placeholder: string | null;
    ariaLabel: string | null;
    label: string | null;
    id: string | null;
    disabled: boolean;
    visible: boolean;
    locator: string;
    currentValue: string | null;
}

export interface FormField {
    tag: string;
    name: string | null;
    type: string | null;
    placeholder: string | null;
    ariaLabel: string | null;
    id: string | null;
}

export interface FormInfo {
    action: string;
    method: string;
    fields: FormField[];
}

export interface LinkInfo {
    href: string;
    text: string;
    ariaLabel: string | null;
    id: string | null;
    className: string | null;
    dataTestId: string | null;
    visible: boolean;
    locator: string;
}

export interface HeadingInfo {
    text: string;
    level: string;
    visible: boolean;
}

export interface AccessibleNode {
    role: string;
    name: string;
    locator: string;
    value?: string;
    disabled?: boolean;
    required?: boolean;
    checked?: boolean;
    level?: number;
}

export interface ScanResult {
    url: string;
    title: string;
    buttons: ButtonInfo[];
    inputs: InputInfo[];
    forms: FormInfo[];
    links: LinkInfo[];
    headings: HeadingInfo[];
    accessibilityNodes: AccessibleNode[];
    errorMessages: string[];
    scannedAt: string;
}

// ---------------------------------------------------------------------------
// ScannerService
// ---------------------------------------------------------------------------

export class ScannerService {

    async scan(url: string): Promise<ScanResult> {
        logger.info(`Scanner: opening ${url}`);

        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        try {
            const page = await browser.newPage();
            await page.setViewportSize({ width: 1280, height: 720 });
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            });

            const response = await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 30000,
            });

            if (!response || response.status() >= 400) {
                throw new Error(`Page returned HTTP ${response?.status() ?? 'unknown'}`);
            }

            return await this.scanPage(page, url);

        } finally {
            await browser.close();
        }
    }

    /**
     * Skannar en redan öppen Playwright-sida och returnerar ScanResult.
     * Detta används framförallt av Agent-loopen som håller webbläsaren vid liv.
     */
    async scanPage(page: any, url: string): Promise<ScanResult> {
        // Vänta tills sidan är klar — hanterar både vanliga sidor och SPA-navigeringar
        await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        // Kort extra buffer för SPA-ramverk (React/Vue/Angular) som renderar efter nätverket
        await page.waitForTimeout(300);

        // Retry-loop: om sidan navigerar mitt i skanningen försöker vi en gång till
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const [title, buttons, inputs, forms, links, headings, errorMessages] = await Promise.all([
                    page.title(),
                    this.extractButtons(page),
                    this.extractInputs(page),
                    this.extractForms(page),
                    this.extractLinks(page),
                    this.extractHeadings(page),
                    this.extractErrorMessages(page),
                ]);

                if (errorMessages.length > 0) {
                    logger.warn(`Scanner: ${errorMessages.length} error message(s) on page: ${errorMessages.join(' | ')}`);
                }
                logger.info(`Scanner done: ${buttons.length} buttons, ${inputs.length} inputs, ${forms.length} forms, ${links.length} links, ${headings.length} headings`);

                return { url, title, buttons, inputs, forms, links, headings, accessibilityNodes: [], errorMessages, scannedAt: new Date().toISOString() };

            } catch (err: any) {
                const isNavError = err.message.includes('context was destroyed') || err.message.includes('navigation');
                if (attempt === 0 && isNavError) {
                    logger.warn(`Scanner: navigering detekterad under skanning — försöker igen...`);
                    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
                    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
                    await page.waitForTimeout(500);
                    continue;
                }
                throw err;
            }
        }

        throw new Error('Scanner: misslyckades efter retry');
    }    /**
     * Skannar flera URL:er i samma browser-session och slår ihop resultaten till ett ScanResult.
     * Primär URL/titel tas från den första URL:en.
     */
    async scanMultiple(urls: string[]): Promise<ScanResult> {
        if (urls.length === 0) throw new Error('Inga URL:er att skanna');
        if (urls.length === 1) return this.scan(urls[0]);

        logger.info(`Scanner: multi-page scan of ${urls.length} pages: ${urls.join(', ')}`);

        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const merged: ScanResult = {
            url: urls[0],
            title: '',
            buttons: [],
            inputs: [],
            forms: [],
            links: [],
            headings: [],
            accessibilityNodes: [],
            errorMessages: [],
            scannedAt: new Date().toISOString(),
        };

        const seenButtons = new Set<string>();
        const seenInputs = new Set<string>();

        try {
            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                try {
                    const page = await browser.newPage();
                    await page.setViewportSize({ width: 1280, height: 720 });
                    await page.setExtraHTTPHeaders({
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    });

                    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
                    if (!response || response.status() >= 400) {
                        logger.warn(`Scanner: skipping ${url} — HTTP ${response?.status()}`);
                        await page.close();
                        continue;
                    }

                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await page.waitForTimeout(500);

                    const [title, buttons, inputs, forms, links, headings, errorMessages] = await Promise.all([
                        page.title(),
                        this.extractButtons(page),
                        this.extractInputs(page),
                        this.extractForms(page),
                        this.extractLinks(page),
                        this.extractHeadings(page),
                        this.extractErrorMessages(page),
                    ]);

                    if (i === 0) merged.title = title;

                    // Merge med dedup
                    buttons.forEach(b => {
                        const key = b.locator;
                        if (!seenButtons.has(key)) { seenButtons.add(key); merged.buttons.push(b); }
                    });
                    inputs.forEach(inp => {
                        const key = inp.locator;
                        if (!seenInputs.has(key)) { seenInputs.add(key); merged.inputs.push(inp); }
                    });
                    merged.forms.push(...forms);
                    merged.links.push(...links);
                    merged.headings.push(...headings);
                    merged.errorMessages.push(...errorMessages);

                    logger.info(`Scanner [${i + 1}/${urls.length}] ${url}: ${buttons.length} buttons, ${inputs.length} inputs`);
                    await page.close();

                } catch (err: any) {
                    logger.warn(`Scanner: failed scanning sub-page ${url}: ${err.message}`);
                }
            }
        } finally {
            await browser.close();
        }

        return merged;
    }

    // -------------------------------------------------------------------------
    // Privata extraktionsmetoder
    // -------------------------------------------------------------------------

    private async extractButtons(page: any): Promise<ButtonInfo[]> {
        return page.evaluate(() => {
            // Inline helper — kontrollerar om ett element är synligt
            function isVisible(el: Element): boolean {
                if (!el) return false;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }

            const selectors = [
                'button',
                '[role="button"]',
                'input[type="submit"]',
                'input[type="button"]',
                'input[type="reset"]',
            ];

            const seen = new Set<string>();
            const results: any[] = [];

            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach((el: any) => {
                    const text = el.textContent?.trim() || el.value || null;
                    const ariaLabel = el.getAttribute('aria-label') || null;
                    const id = el.id || null;
                    const role = el.getAttribute('role') || el.tagName.toLowerCase();
                    const dataTestId = el.getAttribute('data-testid') || null;
                    const disabled = !!(el.disabled || el.getAttribute('aria-disabled') === 'true');
                    const visible = isVisible(el);

                    const key = `${text}|${ariaLabel}|${id}`;
                    if (seen.has(key)) return;
                    seen.add(key);

                    let locator: string;
                    if (ariaLabel) {
                        locator = `page.getByRole('button', { name: '${ariaLabel}' })`;
                    } else if (dataTestId) {
                        locator = `page.getByTestId('${dataTestId}')`;
                    } else if (text && text.length < 60) {
                        locator = `page.getByRole('button', { name: '${text}' })`;
                    } else if (id) {
                        locator = `page.locator('#${id}')`;
                    } else {
                        locator = `page.locator('${selector}')`;
                    }

                    results.push({ text, ariaLabel, id, role, dataTestId, disabled, visible, locator });
                });
            });

            return results.slice(0, 60);
        });
    }

    private async extractInputs(page: any): Promise<InputInfo[]> {
        return page.evaluate(() => {
            function isVisible(el: Element): boolean {
                if (!el) return false;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }

            const results: any[] = [];
            const excludedTypes = new Set(['submit', 'button', 'reset', 'image', 'hidden']);

            document.querySelectorAll('input, textarea, select').forEach((el: any) => {
                const type = el.type || el.tagName.toLowerCase();
                if (excludedTypes.has(type)) return;

                const name = el.name || null;
                const placeholder = el.placeholder || null;
                const ariaLabel = el.getAttribute('aria-label') || null;
                const id = el.id || null;
                const disabled = !!(el.disabled || el.getAttribute('aria-disabled') === 'true');
                const visible = isVisible(el);

                // Hämta kopplad <label>-text via for-attributet eller parent-label
                let label: string | null = null;
                if (id) {
                    const labelEl = document.querySelector(`label[for="${id}"]`);
                    if (labelEl) {
                        label = labelEl.textContent?.trim() || null;
                    }
                }
                if (!label) {
                    const parentLabel = el.closest('label');
                    if (parentLabel) {
                        const clone = parentLabel.cloneNode(true) as HTMLElement;
                        clone.querySelectorAll('input, select, textarea').forEach((c: any) => c.remove());
                        label = clone.textContent?.trim() || null;
                    }
                }

                let locator: string;
                if (label) {
                    locator = `page.getByLabel('${label}')`;
                } else if (ariaLabel) {
                    locator = `page.getByLabel('${ariaLabel}')`;
                } else if (placeholder) {
                    locator = `page.getByPlaceholder('${placeholder}')`;
                } else if (id) {
                    locator = `page.locator('#${id}')`;
                } else if (name) {
                    locator = `page.locator('[name="${name}"]')`;
                } else {
                    locator = `page.locator('${el.tagName.toLowerCase()}')`;
                }

                const currentValue = (el.type === 'password') ? (el.value ? '[hidden]' : '') : (el.value || null);
                results.push({ name, type, placeholder, ariaLabel, label, id, disabled, visible, locator, currentValue });
            });

            return results.slice(0, 40);
        });
    }

    private async extractForms(page: any): Promise<FormInfo[]> {
        return page.evaluate(() => {
            const results: any[] = [];

            document.querySelectorAll('form').forEach((form: any) => {
                const fields: any[] = [];

                form.querySelectorAll('input, textarea, select, button').forEach((el: any) => {
                    fields.push({
                        tag: el.tagName.toLowerCase(),
                        name: el.name || null,
                        type: el.type || null,
                        placeholder: el.placeholder || null,
                        ariaLabel: el.getAttribute('aria-label') || null,
                        id: el.id || null,
                    });
                });

                results.push({
                    action: form.action || '',
                    method: (form.method || 'get').toUpperCase(),
                    fields,
                });
            });

            return results;
        });
    }

    private async extractLinks(page: any): Promise<LinkInfo[]> {
        return page.evaluate(() => {
            function isVisible(el: Element): boolean {
                if (!el) return false;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }

            const seen = new Set<string>();
            const results: any[] = [];

            document.querySelectorAll('a[href]').forEach((el: any) => {
                const href = el.href;
                const text = (el.textContent?.trim() || '').replace(/\s+/g, ' ');
                const ariaLabel = el.getAttribute('aria-label') || null;
                const id = el.id || null;
                const className = typeof el.className === 'string' ? el.className.trim() : null;
                const dataTestId = el.getAttribute('data-testid') || null;
                const visible = isVisible(el);

                if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

                const key = `${href}|${text}|${ariaLabel}|${id}|${className}`;
                if (seen.has(key)) return;
                seen.add(key);

                let locator: string;
                if (ariaLabel) {
                    locator = `page.getByRole('link', { name: '${ariaLabel}' })`;
                } else if (dataTestId) {
                    locator = `page.getByTestId('${dataTestId}')`;
                } else if (id) {
                    locator = `page.locator('#${id}')`;
                } else if (text && text.length < 60) {
                    locator = `page.getByRole('link', { name: '${text}' })`;
                } else if (className) {
                    const firstClass = className.split(/\s+/)[0];
                    if (firstClass) {
                        locator = `page.locator('a.${firstClass}')`;
                    } else {
                        locator = `page.locator('a[href="${el.getAttribute('href')}"]')`;
                    }
                } else {
                    locator = `page.locator('a[href="${el.getAttribute('href')}"]')`;
                }

                results.push({ href, text, ariaLabel, id, className, dataTestId, visible, locator });
            });

            return results.slice(0, 50);
        });
    }

    private async extractHeadings(page: any): Promise<HeadingInfo[]> {
        return page.evaluate(() => {
            function isVisible(el: Element): boolean {
                if (!el) return false;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }

            const results: any[] = [];
            const seenTexts = new Set<string>();

            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el: any) => {
                const text = el.textContent?.trim() || '';
                const level = el.tagName.toLowerCase();
                const visible = isVisible(el);
                if (text && !seenTexts.has(text)) {
                    seenTexts.add(text);
                    results.push({ text, level, visible });
                }
            });

            // Capture common page-title patterns used by frameworks that skip <h> tags
            // e.g. saucedemo uses <span class="title">Products</span>
            const pageTitleSelectors = [
                '[class="title"]',
                '[class="page-title"]',
                '[class="page-heading"]',
                '[class="section-title"]',
                '[class="app_logo"]',
            ];
            pageTitleSelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach((el: any) => {
                    const text = el.textContent?.trim() || '';
                    if (text && !seenTexts.has(text) && isVisible(el)) {
                        seenTexts.add(text);
                        results.push({ text, level: 'page-title', visible: true });
                    }
                });
            });

            return results;
        });
    }

    private async extractErrorMessages(page: any): Promise<string[]> {
        return page.evaluate(() => {
            const ERROR_KEYWORDS = [
                'invalid', 'required', 'error', 'incorrect', 'wrong',
                'failed', 'fel', 'ogiltigt', 'saknas', 'krävs', 'obligatorisk',
                'must', 'cannot', 'not found', 'unauthorized', 'forbidden',
            ];

            const selectors = [
                '[role="alert"]',
                '[class*="error"]:not(script):not(style)',
                '[class*="invalid"]:not(script):not(style)',
                '[class*="validation"]:not(script):not(style)',
                '.invalid-feedback',
                '.field-error',
                '.form-error',
                '.text-danger',
                '[class*="warning"]:not(script):not(style)',
            ];

            const seen = new Set<string>();
            const results: string[] = [];

            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach((el: any) => {
                    const text = el.textContent?.trim();
                    if (!text || text.length < 3 || text.length > 200) return;

                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') return;

                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) return;

                    const looksLikeError = ERROR_KEYWORDS.some(kw => text.toLowerCase().includes(kw));
                    if (!looksLikeError) return;

                    if (!seen.has(text)) {
                        seen.add(text);
                        results.push(text);
                    }
                });
            });

            return results.slice(0, 10);
        });
    }

}
