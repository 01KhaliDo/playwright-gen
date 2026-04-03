import { chromium, Page, Locator } from 'playwright';
import { expect } from '@playwright/test';
import { Ollama } from 'ollama';
import { ScannerService, ScanResult, ButtonInfo, InputInfo, LinkInfo, HeadingInfo } from './scanner';
import { logger } from './logger';
import { TestValidatorService } from './testValidator';

export interface AgentResult {
    success: boolean;
    url: string;
    intent: string;
    code: string;
    validation: any;
    iterations: number;
}

type TargetStrategy = 'role' | 'placeholder' | 'label' | 'text' | 'href' | 'id' | 'testid';

interface AgentTarget {
    strategy: TargetStrategy;
    role?: string;
    name?: string;
    value?: string;
    index?: number;
}

interface AgentAction {
    type: 'click' | 'fill' | 'fill_many' | 'press';
    target?: AgentTarget;
    value?: string;
    key?: string;
    fields?: Array<{
        target: AgentTarget;
        value: string;
    }>;
}

interface AgentAssertion {
    type: 'url_contains' | 'text_visible' | 'heading_visible';
    value: string;
}

interface AgentStepResponse {
    status: 'in-progress' | 'done';
    action?: AgentAction;
    assertion?: AgentAssertion;
}

interface RelevantScan {
    url: string;
    title: string;
    buttons: ButtonInfo[];
    inputs: InputInfo[];
    links: LinkInfo[];
    headings: HeadingInfo[];
}

export class TestAgentService {
    private model: string;
    private baseUrl: string;

    constructor() {
        this.model = process.env.OLLAMA_MODEL || 'llama3';
        this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    }

    async runAgent(startUrl: string, intent: string, maxSteps = 8): Promise<AgentResult> {
        logger.info(`[TestAgent] Starting agent for ${startUrl} -> Intent: ${intent}`);

        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 TestAgent/2.0',
        });

        const page = await context.newPage();
        const scanner = new ScannerService();

        const codeLines: string[] = [];
        const actionHistory: AgentAction[] = [];

        codeLines.push(`  await page.goto('${startUrl}');`);

        try {
            await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });

            for (let step = 1; step <= maxSteps; step++) {
                logger.info(`[TestAgent] Step ${step}/${maxSteps} - Scanning page...`);

                const fullScan = await scanner.scanPage(page, page.url());
                const scan = this.selectRelevantElements(fullScan, intent);

                const prompt = this.buildAgentPrompt(scan, intent, actionHistory);
                const raw = await this.callOllama(prompt);

                logger.info(`[TestAgent] Raw AI response: ${raw}`);

                let parsed: AgentStepResponse;
                try {
                    parsed = this.parseAgentResponse(raw);
                } catch (err: any) {
                    logger.error(`[TestAgent] Failed to parse AI response: ${err.message}`);
                    codeLines.push(`  // ERROR: ${err.message}`);
                    break;
                }

                logger.info(`[TestAgent] Parsed AI response: ${JSON.stringify(parsed)}`);

                if (parsed.status === 'done') {
                    if (parsed.assertion) {
                        const assertionCode = this.assertionToCode(parsed.assertion);
                        codeLines.push(`  ${assertionCode}`);
                    } else {
                        codeLines.push(`  // DONE without assertion`);
                    }
                    logger.info(`[TestAgent] Agent signals DONE!`);
                    break;
                }

                if (!parsed.action) {
                    const msg = 'Agent returned in-progress without action';
                    logger.error(`[TestAgent] ${msg}`);
                    codeLines.push(`  // ERROR: ${msg}`);
                    break;
                }

                if (this.detectLoop(actionHistory, parsed.action)) {
                    const msg = 'Agent is repeating the same action without progress';
                    logger.error(`[TestAgent] ${msg}`);
                    codeLines.push(`  // ERROR: ${msg}`);
                    break;
                }

                try {
                    const executedCode = await this.executeStep(page, parsed.action);
                    codeLines.push(`  ${executedCode}`);
                    actionHistory.push(parsed.action);
                    await page.waitForTimeout(600);
                } catch (err: any) {
                    logger.error(`[TestAgent] Failed to execute action: ${err.message}`);
                    codeLines.push(`  // ERROR: ${err.message}`);
                    break;
                }
            }
        } finally {
            await browser.close();
        }

        const testName = intent.replace(/'/g, '').substring(0, 80);
        const finalCode =
            `import { test, expect } from '@playwright/test';\n\n` +
            `test('Agent generated test: ${testName}', async ({ page }) => {\n` +
            `${codeLines.join('\n')}\n` +
            `});`;

        const validation = TestValidatorService.validate(finalCode);

        return {
            success: true,
            url: startUrl,
            intent,
            code: finalCode,
            validation,
            iterations: actionHistory.length,
        };
    }

    private selectRelevantElements(scan: ScanResult, intent: string): RelevantScan {
        const intentLower = intent.toLowerCase();

        let buttons = scan.buttons.filter(b => b.visible);
        let inputs = scan.inputs.filter(i => i.visible);
        let links = scan.links.filter(l => l.visible);
        let headings = scan.headings.filter(h => h.visible);

        if (intentLower.includes('login') || intentLower.includes('logga in') || intentLower.includes('sign in')) {
            inputs = this.sortByRelevance(inputs, (i) =>
                /user|email|password|lösen|name/i.test(
                    this.textBlob(i.label, i.placeholder, i.ariaLabel, i.name)
                )
            );
            buttons = this.sortByRelevance(buttons, (b) =>
                /login|logga in|sign in|submit/i.test(
                    this.textBlob(b.text, b.ariaLabel)
                )
            );
        }

        if (intentLower.includes('cart') || intentLower.includes('kundvagn') || intentLower.includes('checkout')) {
            buttons = this.sortByRelevance(buttons, (b) =>
                /add|cart|checkout|continue|cancel/i.test(
                    this.textBlob(b.text, b.ariaLabel)
                )
            );
            links = this.sortByRelevance(links, (l) =>
                /cart|checkout/i.test(
                    this.textBlob(l.text, l.ariaLabel, l.href)
                )
            );
        }

        if (intentLower.includes('search') || intentLower.includes('sök')) {
            inputs = this.sortByRelevance(inputs, (i) =>
                /search|sök/i.test(
                    this.textBlob(i.label, i.placeholder, i.ariaLabel, i.name)
                )
            );
            buttons = this.sortByRelevance(buttons, (b) =>
                /search|sök/i.test(
                    this.textBlob(b.text, b.ariaLabel)
                )
            );
        }

        return {
            url: scan.url,
            title: scan.title,
            buttons: buttons.slice(0, 8),
            inputs: inputs.slice(0, 8),
            links: links.slice(0, 8),
            headings: headings.slice(0, 6),
        };
    }

    private sortByRelevance<T>(items: T[], matcher: (item: T) => boolean): T[] {
        return [...items].sort((a, b) => {
            const aScore = matcher(a) ? 1 : 0;
            const bScore = matcher(b) ? 1 : 0;
            return bScore - aScore;
        });
    }

    private textBlob(...parts: Array<string | null | undefined>): string {
        return parts.filter(Boolean).join(' ').toLowerCase();
    }

    private buildAgentPrompt(scan: RelevantScan, intent: string, history: AgentAction[]): string {
        const inputsText = scan.inputs.length
            ? scan.inputs.map(i =>
                `- label="${i.label ?? ''}" placeholder="${i.placeholder ?? ''}" ariaLabel="${i.ariaLabel ?? ''}" type="${i.type ?? ''}" currentValue="${i.currentValue ?? ''}"`
            ).join('\n')
            : '(none)';

        const buttonsText = scan.buttons.length
            ? scan.buttons.map(b =>
                `- text="${b.text ?? ''}" ariaLabel="${b.ariaLabel ?? ''}" disabled=${b.disabled}`
            ).join('\n')
            : '(none)';

        const linksText = scan.links.length
            ? scan.links.map(l =>
                `- text="${l.text ?? ''}" href="${l.href}" ariaLabel="${l.ariaLabel ?? ''}"`
            ).join('\n')
            : '(none)';

        const headingsText = scan.headings.length
            ? scan.headings.map(h => `- ${h.level}: "${h.text}"`).join('\n')
            : '(none)';

        const historyText = history.length ? JSON.stringify(history.slice(-5), null, 2) : '[]';

        return `
You are a browser automation agent.

Your job is to decide the SINGLE next action needed to move toward the user's goal.

Return ONLY valid JSON.
Do not return markdown.
Do not return Playwright code.
Do not return comments.
Do not return explanations.
Do not return multiple actions.
Return exactly ONE JSON object.

USER GOAL:
${intent}

CURRENT URL:
${scan.url}

PAGE TITLE:
${scan.title}

VISIBLE INPUTS:
${inputsText}

VISIBLE BUTTONS:
${buttonsText}

VISIBLE LINKS:
${linksText}

VISIBLE HEADINGS:
${headingsText}

PREVIOUS ACTIONS:
${historyText}

RULES:
1. If an input already has the desired value, do not fill it again.
2. Fill required form fields before clicking submit/login/continue.
3. Do not repeat an already completed action unless the page state changed meaningfully.
4. Choose the most direct next step toward the goal.
5. Use only the target strategies listed below.
6. If the goal is fully achieved, return status = "done".
7. If you are unsure, choose the simplest valid next action.
8. If multiple visible elements share the same text, label, or role, you MUST use index.
9. Prefer strategy="role" over strategy="text" for buttons whenever possible.
10. If multiple form fields on the same page clearly belong to the same form step, prefer "fill_many" instead of separate fill steps.

ALLOWED ACTION TYPES:
- fill
- fill_many
- click
- press
- done

ALLOWED TARGET STRATEGIES:
- role
- placeholder
- label
- text
- href

JSON FORMAT:

For fill:
{"status":"in-progress","action":{"type":"fill","target":{"strategy":"placeholder","value":"Username"},"value":"standard_user"}} 
For fill_many:
{"status":"in-progress","action":{"type":"fill_many","fields":[{"target":{"strategy":"placeholder","value":"Username"},"value":"standard_user"},{"target":{"strategy":"placeholder","value":"Password"},"value":"secret_sauce"}]}}

For click:
{"status":"in-progress","action":{"type":"click","target":{"strategy":"role","role":"button","name":"Login","index":0}}}

For press:
{"status":"in-progress","action":{"type":"press","key":"Enter"}}

For done:
{"status":"done","assertion":{"type":"url_contains","value":"/inventory"}}
`.trim();
    }

    private parseAgentResponse(raw: string): AgentStepResponse {
        const cleaned = raw
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error(`No valid JSON object found in AI response: ${cleaned.substring(0, 200)}`);
        }

        const jsonText = cleaned.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonText);

        if (!parsed.status || !['in-progress', 'done'].includes(parsed.status)) {
            throw new Error('Invalid or missing status in AI response');
        }

        if (parsed.status === 'in-progress') {
            if (!parsed.action || !parsed.action.type) {
                throw new Error('Missing action for in-progress response');
            }
            if (!['click', 'fill', 'fill_many', 'press'].includes(parsed.action.type)) {
                throw new Error(`Unsupported action type: ${parsed.action.type}`);
            }
        }

        if (parsed.status === 'done' && parsed.assertion) {
            if (!['url_contains', 'text_visible', 'heading_visible'].includes(parsed.assertion.type)) {
                throw new Error(`Unsupported assertion type: ${parsed.assertion.type}`);
            }
        }

        return parsed as AgentStepResponse;
    }

    private async executeStep(page: Page, action: AgentAction): Promise<string> {
        switch (action.type) {
            case 'fill': {
                if (!action.target || !action.value) {
                    throw new Error('Invalid fill action: missing target or value');
                }
                const locator = this.buildLocator(page, action.target);
                await locator.fill(action.value);
                return `await ${this.locatorToCode(action.target)}.fill('${this.escapeSingleQuotes(action.value)}');`;
            }

            case 'fill_many': {
                if (!action.fields || action.fields.length === 0) {
                    throw new Error('Invalid fill_many action: missing fields');
                }

                const lines: string[] = [];

                for (const field of action.fields) {
                    const locator = this.buildLocator(page, field.target);
                    await locator.fill(field.value);
                    lines.push(`await ${this.locatorToCode(field.target)}.fill('${this.escapeSingleQuotes(field.value)}');`);
                }

                return lines.join('\n  ');
            }

            case 'click': {
                if (!action.target) {
                    throw new Error('Invalid click action: missing target');
                }
                const locator = this.buildLocator(page, action.target);
                await locator.click();
                return `await ${this.locatorToCode(action.target)}.click();`;
            }

            case 'press': {
                if (!action.key) {
                    throw new Error('Invalid press action: missing key');
                }
                await page.keyboard.press(action.key);
                return `await page.keyboard.press('${this.escapeSingleQuotes(action.key)}');`;
            }

            default:
                throw new Error(`Unsupported action type: ${(action as any).type}`);
        }
    }

    private buildLocator(page: Page, target: AgentTarget): Locator {
        const withIndex = (locator: Locator) =>
            typeof target.index === 'number' ? locator.nth(target.index) : locator;

        switch (target.strategy) {
            case 'placeholder':
                return withIndex(page.getByPlaceholder(target.value ?? ''));

            case 'label':
                return withIndex(page.getByLabel(target.value ?? ''));

            case 'text':
                return withIndex(page.getByText(target.value ?? ''));

            case 'href':
                return withIndex(page.locator(`a[href="${target.value ?? ''}"]`));

            case 'role': {
                return withIndex(
                    page.getByRole((target.role as any) ?? 'button', {
                        name: target.name ?? '',
                    })
                );
            }

            default:
                throw new Error(`Unsupported target strategy: ${(target as any).strategy}`);
        }
    }

    private locatorToCode(target: AgentTarget): string {
        const addIndex = (base: string) =>
            typeof target.index === 'number' ? `${base}.nth(${target.index})` : base;

        switch (target.strategy) {
            case 'placeholder':
                return addIndex(`page.getByPlaceholder('${this.escapeSingleQuotes(target.value ?? '')}')`);

            case 'label':
                return addIndex(`page.getByLabel('${this.escapeSingleQuotes(target.value ?? '')}')`);

            case 'text':
                return addIndex(`page.getByText('${this.escapeSingleQuotes(target.value ?? '')}')`);

            case 'href':
                return addIndex(`page.locator('a[href="${(target.value ?? '').replace(/'/g, "\\'")}"]')`);

            case 'role': {
                const base = `page.getByRole('${this.escapeSingleQuotes(target.role ?? 'button')}', { name: '${this.escapeSingleQuotes(target.name ?? '')}' })`;
                return addIndex(base);
            }

            default:
                throw new Error(`Unsupported target strategy: ${(target as any).strategy}`);
        }
    }

    private assertionToCode(assertion: AgentAssertion): string {
        switch (assertion.type) {
            case 'url_contains':
                return `await expect(page).toHaveURL(/${this.escapeRegex(assertion.value)}/);`;

            case 'text_visible':
                return `await expect(page.getByText('${this.escapeSingleQuotes(assertion.value)}')).toBeVisible();`;

            case 'heading_visible':
                return `await expect(page.getByRole('heading', { name: '${this.escapeSingleQuotes(assertion.value)}' })).toBeVisible();`;

            default:
                throw new Error(`Unsupported assertion type: ${(assertion as any).type}`);
        }
    }

    private detectLoop(history: AgentAction[], next: AgentAction): boolean {
        if (history.length < 2) return false;

        const lastTwo = history.slice(-2);
        return lastTwo.every(prev =>
            prev.type === next.type &&
            JSON.stringify(prev.target) === JSON.stringify(next.target) &&
            prev.value === next.value &&
            prev.key === next.key
        );
    }

    private buildFinalTestCode(intent: string, codeLines: string[]): string {
        const testName = intent.replace(/'/g, '').substring(0, 80);

        return (
            `import { test, expect } from '@playwright/test';\n\n` +
            `test('Agent generated test: ${testName}', async ({ page }) => {\n` +
            `${codeLines.join('\n')}\n` +
            `});`
        );
    }

    private escapeSingleQuotes(value: string): string {
        return value.replace(/'/g, "\\'");
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private async callOllama(prompt: string): Promise<string> {
        const ollama = new Ollama({ host: this.baseUrl });
        const response = await ollama.chat({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            options: { temperature: 0.0 },
        });

        return response.message.content;
    }
}