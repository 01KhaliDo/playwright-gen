// =============================================================================
// testBuilder.ts — Steg 2: scan-data + intent → AI genererar ett Playwright-test
//
// Pipeline:
//   1. Ta emot ScanResult + intent-sträng
//   2. Filtrera scan-datan så bara det som är relevant för intent skickas
//   3. Bygg prompt till Ollama
//   4. Anropa Ollama och extrahera ren TypeScript-kod
//   5. Returnera testkoden som en sträng
//
// Används av: GET /api/generate-test?url=...&intent=...
// =============================================================================

import { Ollama } from 'ollama';
import { ScanResult } from './scanner';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export interface GeneratedTest {
    intent: string;
    url: string;
    code: string;           // Ren TypeScript-kod, ingen markdown
}

// ---------------------------------------------------------------------------
// TestBuilderService
// ---------------------------------------------------------------------------

export class TestBuilderService {
    private model: string;
    private baseUrl: string;

    constructor() {
        this.model = process.env.OLLAMA_MODEL || 'llama3';
        this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    }

    /**
     * Tar emot scan-data och intent, anropar AI och returnerar ett Playwright-test.
     */
    async generateTest(scan: ScanResult, intent: string): Promise<GeneratedTest> {
        const prompt = this.buildPrompt(scan, intent);

        logger.info(`TestBuilder: sending prompt for intent="${intent}" on ${scan.url}`);
        const raw = await this.callOllama(prompt);
        const code = this.extractCode(raw);

        return { intent, url: scan.url, code };
    }

    // ---------------------------------------------------------------------------
    // Prompt-byggaren
    // ---------------------------------------------------------------------------

    /**
     * Filtrerar scan-datan baserat på intent och bygger en tydlig prompt.
     * Kortare prompt = snabbare svar från Ollama.
     */
    private buildPrompt(scan: ScanResult, intent: string): string {
        const intentLower = intent.toLowerCase();

        // Filtrera element som är relevanta för intentet
        const visibleButtons = scan.buttons
            .filter(b => b.visible)
            .slice(0, 15);

        const visibleInputs = scan.inputs
            .filter(i => i.visible)
            .slice(0, 10);

        const visibleLinks = scan.links
            .filter(l => l.visible)
            .slice(0, 15);

        // Bygg kompakt representation av sidans element
        const buttons = visibleButtons.length > 0
            ? visibleButtons.map(b => `  - ${b.locator}${b.disabled ? ' [disabled]' : ''}`).join('\n')
            : '  (inga knappar hittade)';

        const inputs = visibleInputs.length > 0
            ? visibleInputs.map(i => {
                const label = i.label || i.ariaLabel || i.placeholder || i.name || 'input';
                return `  - ${i.locator} (${label}, type=${i.type})${i.disabled ? ' [disabled]' : ''}`;
            }).join('\n')
            : '  (inga inputfält hittade)';

        const links = visibleLinks.length > 0
            ? visibleLinks.map(l => `  - ${l.locator} (text="${l.text}" href="${l.href}")`).join('\n')
            : '  (inga synliga länkar)';

        const forms = scan.forms.length > 0
            ? scan.forms.map(f =>
                `  - ${f.method} ${f.action} (${f.fields.length} fält)`
            ).join('\n')
            : '  (inga formulär hittade)';

        const headings = scan.headings
            .filter(h => h.visible)
            .map(h => `  - ${h.level}: "${h.text}"`)
            .join('\n') || '  (inga headings)';

        return `You are a Senior QA Automation Engineer with 10 years of experience in Playwright. Your goal is to write robust, resilient, and professional end-to-end tests in TypeScript, completely avoiding flaky patterns. Generate a single, simple Playwright test.

WEBSITE: ${scan.url}
TITLE: "${scan.title}"
USER INTENT: "${intent}"

PAGE STRUCTURE:
Headings:
${headings}

Buttons (visible only):
${buttons}

Inputs (visible only):
${inputs}

Forms:
${forms}

Links (visible):
${links}

INSTRUCTIONS:
1. Generate EXACTLY ONE test that matches the user's intent: "${intent}"
2. CRITICAL: Focus *primarily* on the element or interaction most directly related to the intent (e.g., if intent mentions CV, project, search, login, or contact, prioritize those specific locators).
3. Do NOT add generic page assertions (like checking if every heading on the page is visible) unless explicitly part of the intent. Use general assertions only as support.
4. Use the locators from PAGE STRUCTURE above — pick the most relevant ones.
   Prefer this locator order:
   1. data-testid
   2. getByRole
   3. getByLabel
   4. getByPlaceholder
   5. href-based locator (e.g. page.locator('a[href="..."]'))
   6. text locator
   CRITICAL: When multiple links have the same text (e.g. several "GitHub" links), use the href attribute to target the correct one!
   STRICT: ONLY use class names, IDs, and element types that are explicitly listed in the PAGE STRUCTURE above. Do NOT invent or guess selectors. If an element required by the intent was NOT found in the scan, add a comment: // TODO: element not found in scan — manual locator needed.
5. PREVENT STRICT MODE VIOLATIONS: The locators provided might match multiple elements on the real page (like multiple "Add to cart" buttons in a product list). Whenever you use 'getByRole' with a generic name, or 'getByText', you MUST append '.first()' or '.nth(X)' (e.g. "await page.getByRole('button', { name: 'Add to cart' }).first().click();") to prevent Playwright strict mode from crashing the test!
6. GOAL-DRIVEN ASSERTION RULES:
   - First, understand the user's goal (intent). Choose the most reasonable interaction to achieve it.
   - Verify the result of the action with a meaningful assertion. Prefer assertions that prove the goal was achieved, not just that an element remains visible.
   - If adding or creating something: assert that the new item appears.
   - If removing or deleting something: assert that the item disappears (not.toBeVisible) or the count decreases.
   - If opening or clicking a link/button: assert navigation (toHaveURL) or a visible UI change (e.g., a modal or new heading appears).
   - If searching: assert that results or a results page appear.
   - If submitting a form: assert a success message, navigation, or visible result.
6. Use Playwright TypeScript syntax with async/await. Keep it simple: navigate → interact → assert.
7. Use page.goto('${scan.url}') ONLY for the very first navigation to start the test.
   NAVIGATION RULE: For all subsequent page navigation within the test (e.g. going to cart, checkout, profile), ALWAYS use click-based navigation (click the actual link or button the user would click). NEVER use page.goto() with a constructed or guessed URL path for pages other than the starting URL. Click-based navigation tests the real UI and avoids URL guessing errors.
8. Output ONLY raw TypeScript code — no markdown, no backticks, no explanation.

EXAMPLE FORMAT:
import { test, expect } from '@playwright/test';

test('description of what is tested', async ({ page }) => {
  await page.goto('https://example.com');
  await page.getByPlaceholder('Search').fill('test query');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading')).toBeVisible();
});`;
    }

    // ---------------------------------------------------------------------------
    // Ollama-anrop
    // ---------------------------------------------------------------------------

    private async callOllama(prompt: string): Promise<string> {
        const ollama = new Ollama({ host: this.baseUrl });

        const response = await ollama.chat({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a Playwright test engineer. Output ONLY raw TypeScript code. No markdown. No backticks. No explanation. Start directly with: import { test, expect } from \'@playwright/test\';',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            options: {
                temperature: 0.1,
                num_predict: 1500,
            },
        });

        return response.message.content;
    }

    // ---------------------------------------------------------------------------
    // Extrahera ren kod från AI-svaret
    // ---------------------------------------------------------------------------

    /**
     * AI:n kan ibland returnera markdown-block trots instruktioner.
     * Denna metod extraherar ren TypeScript-kod.
     */
    private extractCode(raw: string): string {
        // Ta bort ```typescript ... ``` eller ``` ... ``` block
        const fenceMatch = raw.match(/```(?:typescript|ts)?\n?([\s\S]*?)```/);
        if (fenceMatch) {
            return fenceMatch[1].trim();
        }

        // Om svaret börjar med import { test ... } är det redan ren kod
        const importIdx = raw.indexOf('import { test');
        if (importIdx >= 0) {
            return raw.slice(importIdx).trim();
        }

        // Fallback: returnera allt utan ledande/avslutande whitespace
        return raw.trim();
    }
}
