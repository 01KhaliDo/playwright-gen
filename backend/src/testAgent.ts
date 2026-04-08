import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { Ollama } from 'ollama';
import { ScannerService, ScanResult } from './scanner';
import { logger } from './logger';
import { TestValidatorService } from './testValidator';

const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

export interface AgentResult {
    success: boolean;
    url: string;
    intent: string;
    code: string;
    validation: any;
    iterations: number;
}

export class TestAgentService {
    private model: string;
    private baseUrl: string;

    constructor() {
        this.model = process.env.OLLAMA_MODEL || 'llama3';
        this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    }

    async runAgent(startUrl: string, intent: string, maxSteps = 15): Promise<AgentResult> {
        logger.info(`[TestAgent] Starting agent for ${startUrl} -> Intent: ${intent}`);

        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 TestAgent/1.0',
        });
        const page = await context.newPage();
        const scanner = new ScannerService();

        const codeLines: string[] = [];
        codeLines.push(`  await page.goto('${startUrl}');`);

        try {
            await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });

            for (let step = 1; step <= maxSteps; step++) {
                logger.info(`[TestAgent] Step ${step}/${maxSteps} - Scanning page...`);
                const scan = await scanner.scanPage(page, startUrl);

                const prompt = this.buildAgentPrompt(scan, intent, codeLines);
                const reply = await this.callOllama(prompt);

                try {
                    const actionData = this.parseAgentResponse(reply);
                    logger.info(`[TestAgent] AI Decision: ${actionData.status} | Thought: ${actionData.thought} | Code: ${actionData.code}`);

                    if (actionData.code && actionData.code.trim()) {
                        codeLines.push(`  ${actionData.code}`);
                        logger.info(`[TestAgent] Executing: ${actionData.code}`);
                        const executor = new AsyncFunction('page', 'expect', actionData.code);
                        await executor(page, expect);
                        await page.waitForTimeout(500);
                    }

                    if (actionData.status === 'done') {
                        logger.info(`[TestAgent] Agent signals DONE!`);
                        break;
                    }

                } catch (err: any) {
                    logger.error(`[TestAgent] Step failed: ${err.message}`);
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
        return { success: true, url: startUrl, intent, code: finalCode, validation, iterations: codeLines.length - 1 };
    }

    // ─── Sanitize locators ─────────────────────────────────────────────────────
    // Replaces href="/cart.html" → href='/cart.html' so the AI doesn't break JSON
    private sanitizeLocator(locator: string): string {
        return locator.replace(/="([^"]*)"/g, "='$1'");
    }

    // ─── Build prompt ──────────────────────────────────────────────────────────
    private buildAgentPrompt(scan: ScanResult, intent: string, history: string[]): string {
        const historyText = history.length > 1
            ? history.slice(-5).join('\n')
            : '  (none yet)';

        const buttons = scan.buttons.slice(0, 10)
            .map(b => `  ${this.sanitizeLocator(b.locator)}  text="${b.text}"`)
            .join('\n') || '  (none)';

        const inputs = scan.inputs.slice(0, 6)
            .map(i => {
                const filled = i.currentValue ? ` value="${i.currentValue}"` : '';
                return `  ${this.sanitizeLocator(i.locator)}  placeholder="${i.placeholder}"${filled}`;
            })
            .join('\n') || '  (none)';

        const links = scan.links
            .filter(l => l.visible)
            .slice(0, 8)
            .map(l => `  ${this.sanitizeLocator(l.locator)}  text="${l.text}"`)
            .join('\n') || '  (none)';

        return `You are a Playwright test automation agent. You control a live browser step-by-step.

GOAL: ${intent}

CURRENT URL: ${scan.url}

PREVIOUS STEPS:
${historyText}

VISIBLE ELEMENTS ON PAGE (use these locators exactly):
Buttons:
${buttons}
Inputs:
${inputs}
Links:
${links}

Pick the SINGLE next action needed. Think step-by-step:
1. If there are empty input fields that need values, fill them.
2. If input fields already have values (value="..."), do NOT fill them again. Click the submit/login button instead.
3. After login, look for new buttons/links to continue toward the goal.
4. Do NOT repeat an action that appears in PREVIOUS STEPS.
5. Copy-paste locators EXACTLY from the list above. Do NOT modify, combine, or extend them.
   FORBIDDEN: .filter(), .has(), .locator() chaining, or any method not shown in the element list.
6. Use single quotes inside code strings.

Respond with ONLY this JSON:
{"thought":"reason for action","status":"in-progress","code":"await page.locator('#my-button').click();"}
When done: {"thought":"done","status":"done","code":""}`;    }

    // ─── Parse AI response ─────────────────────────────────────────────────────
    private parseAgentResponse(raw: string): { thought: string, status: string, code: string } {
        const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const first = cleaned.indexOf('{');
        if (first === -1) throw new Error(`No JSON in response: ${raw.substring(0, 200)}`);

        // Bracket-tracking
        let depth = 0, last = -1;
        for (let i = first; i < cleaned.length; i++) {
            if (cleaned[i] === '{') depth++;
            else if (cleaned[i] === '}') { depth--; if (depth === 0) { last = i; break; } }
        }
        // Fallback for nested braces like { name: 'Login' }
        if (last === -1) {
            last = cleaned.lastIndexOf('}');
        }
        if (last === -1) throw new Error('No closing brace found in AI response');

        // Pre-sanitize: { name: "Login" } → { name: 'Login' }
        const jsonStr = cleaned.substring(first, last + 1)
            .replace(/,\s*\{\s*(\w+):\s*"([^"]*)"\s*\}/g, ", { $1: '$2' }")
            .replace(/\{\s*(\w+):\s*"([^"]*)"\s*,/g, "{ $1: '$2',");

        const parsed = JSON.parse(jsonStr);
        return {
            thought: parsed.thought || '',
            status:  parsed.status  || 'in-progress',
            code:    (parsed.code   || '').trim(),
        };
    }

    // ─── Ollama ────────────────────────────────────────────────────────────────
    private async callOllama(prompt: string): Promise<string> {
        const ollama = new Ollama({ host: this.baseUrl });
        const response = await ollama.chat({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            options: { temperature: 0.0 }
        });
        return response.message.content;
    }
}