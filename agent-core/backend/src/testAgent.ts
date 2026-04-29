import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { Ollama } from 'ollama';
import { ScannerService, ScanResult } from './scanner';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '..', 'auth.json');
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

    async runAgent(startUrl: string, intent: string, maxSteps = 25): Promise<AgentResult> {
        logger.info(`[TestAgent] Starting agent for ${startUrl} -> Intent: ${intent}`);

        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const hasAuth = fs.existsSync(AUTH_FILE);
        if (hasAuth) logger.info('[TestAgent] 🔑 Loading saved session from auth.json');

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 TestAgent/1.0',
            ignoreHTTPSErrors: true,
            ...(hasAuth ? { storageState: AUTH_FILE } : {}),
        });
        const page = await context.newPage();
        const scanner = new ScannerService();

        const codeLines: string[] = [];
        const stepSummary: string[] = [];
        const failedCodes = new Map<string, number>();
        const executedCodes = new Set<string>(); // all successfully executed codes — never rolls out
        let agentCompleted = false;
        const AGENT_TIMEOUT_MS = 600_000; // 10 minutes
        const agentStartTime = Date.now();

        // Läs sparad post-login URL om den finns
        const authMetaFile = AUTH_FILE + '.meta.json';
        let navigateUrl = startUrl;
        if (hasAuth && fs.existsSync(authMetaFile)) {
            try {
                const meta = JSON.parse(fs.readFileSync(authMetaFile, 'utf8'));
                if (meta.postLoginUrl) {
                    navigateUrl = meta.postLoginUrl;
                    logger.info(`[TestAgent] 🔑 Navigating directly to post-login URL: ${navigateUrl}`);
                }
            } catch { /* ignore */ }
        }

        codeLines.push(`  await page.goto('${navigateUrl}');`);

        try {
            await page.goto(navigateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Om auth finns men vi hamnar på login-sidan — sessionen har gått ut, ta bort auth
            if (hasAuth && page.url().includes('login.')) {
                logger.warn('[TestAgent] ⚠️ Session expired — deleting auth.json and restarting login');
                try { fs.unlinkSync(AUTH_FILE); } catch { /* ignore */ }
                try { fs.unlinkSync(authMetaFile); } catch { /* ignore */ }
                await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            }

            for (let step = 1; step <= maxSteps; step++) {
                if (Date.now() - agentStartTime > AGENT_TIMEOUT_MS) {
                    logger.error('[TestAgent] Agent exceeded total time limit (10 min)');
                    codeLines.push('  // ERROR: Agent exceeded total time limit');
                    break;
                }
                logger.info(`[TestAgent] ${'─'.repeat(50)}`);
                logger.info(`[TestAgent] Step ${step}/${maxSteps}  |  ${page.url()}`);
                const scan = await scanner.scanPage(page, page.url());
                logger.info(`[TestAgent] Page: "${scan.title}"  |  🔘 ${scan.buttons.length} btn  📝 ${scan.inputs.length} inputs  🔗 ${scan.links.length} links`);
                if (scan.links.length > 0) {
                    logger.info(`[TestAgent] 🔗 Links: ${scan.links.filter(l => l.visible).map(l => `"${l.text}"`).join(', ')}`);
                }

                const prompt = this.buildAgentPrompt(scan, intent, stepSummary);
                const reply = await this.callOllama(prompt);

                let safeCode = '';
                try {
                    const actionData = this.parseAgentResponse(reply);
                    const shortThought = actionData.thought.substring(0, 80);
                    const statusIcon = actionData.status === 'done' ? '🏁' : '🤔';
                    logger.info(`[TestAgent] ${statusIcon} ${actionData.status.toUpperCase()} — ${shortThought}`);
                    logger.info(`[TestAgent] 💻 ${actionData.code}`);

                    if (actionData.code && actionData.code.trim()) {
                        // Split multi-action responses into individual statements
                        const statements = actionData.code
                            .split(/;\s*(?=await\s)/)
                            .map((s: string) => s.trim())
                            .filter((s: string) => s.startsWith('await'));

                        // Pick the best statement from a multi-action response:
                        // Skip statements that have already failed OR are the same as the last done action.
                        const lastDone = stepSummary.length > 0
                            ? (stepSummary[stepSummary.length - 1].split(' → ')[1] || '').replace(/;$/, '').trim()
                            : '';

                        let chosen = statements[0] || actionData.code.trim();
                        if (statements.length > 1) {
                            for (const stmt of statements) {
                                const normalized = stmt.replace(/;$/, '').trim();
                                const withSemi = normalized + ';';
                                const alreadyFailed = (failedCodes.get(withSemi) || 0) >= 1;
                                const sameAsLastDone = normalized === lastDone;
                                const alreadyDone = executedCodes.has(normalized);
                                if (!alreadyFailed && !sameAsLastDone && !alreadyDone) {
                                    chosen = stmt;
                                    break;
                                }
                            }
                        }
                        safeCode = chosen.endsWith(';') ? chosen : chosen + ';';

                        // Fix AI mistake: locator('a', { name: 'X' }) → locator('a', { hasText: 'X' })
                        safeCode = safeCode.replace(
                            /locator\(([^,]+),\s*\{\s*name:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\}\)/g,
                            'locator($1, { hasText: $2 })'
                        );

                        if (statements.length > 1) {
                            logger.warn(`[TestAgent] ⚠️  Multi-action — picked: ${safeCode}`);
                        }

                        // Skip actions already successfully executed (uses Set — never rolls out)
                        const normalizedSafe = safeCode.replace(/;$/, '').trim();
                        const execKey = safeCode.includes('.click()') ? `${page.url()}|${normalizedSafe}` : normalizedSafe;
                        if (executedCodes.has(execKey)) {
                            logger.warn(`[TestAgent] ⏭️  Already done — skipping`);
                            stepSummary.push(`Step ${step}: ⏭️ ALREADY DONE → ${safeCode}`);
                            continue;
                        }

                        // Loop detection — same code failed twice → give up
                        const failCount = failedCodes.get(safeCode) || 0;
                        if (failCount >= 2) {
                            logger.error(`[TestAgent] 🔄 Loop detected — "${safeCode}" failed ${failCount} times, stopping`);
                            codeLines.push(`  // ERROR: Loop detected — same action failed repeatedly`);
                            break;
                        }

                        logger.info(`[TestAgent] ▶  ${safeCode}`);
                        const executor = new AsyncFunction('page', 'expect', safeCode);
                        try {
                            await executor(page, expect);
                        } catch (clickErr: any) {
                            // Strict mode violation → retry with .first()
                            if (clickErr.message.includes('strict mode violation') && safeCode.includes('.click()')) {
                                logger.warn(`[TestAgent] ⚠️ Strict mode — retrying with .first()`);
                                const firstCode = safeCode.replace(/\.click\(/, '.first().click(');
                                const firstExecutor = new AsyncFunction('page', 'expect', firstCode);
                                await firstExecutor(page, expect);
                                safeCode = firstCode; // save the working version
                                logger.info(`[TestAgent] ✅ .first() click OK`);
                            // Timeout on a click → retry with DOM text search click
                            } else if (clickErr.message.includes('Timeout') && safeCode.includes('.click()')) {
                                logger.warn(`[TestAgent] ⏱ Click timeout — retrying via DOM text search`);
                                const nameMatch = safeCode.match(/name:\s*['"]([^'"]+)['"]/) || safeCode.match(/hasText:\s*['"]([^'"]+)['"]/);
                                const searchText = nameMatch?.[1] || '';
                                let domClickOk = false;
                                if (searchText) {
                                    try {
                                        const domClickCode = `await page.evaluate((text) => {
    const el = Array.from(document.querySelectorAll('a, button, [role="button"]'))
        .find(function(e) { return e.textContent && e.textContent.trim() === text; });
    if (el) el.click();
    else throw new Error('Element not found: ' + text);
}, '${searchText}');`;
                                        const domExecutor = new AsyncFunction('page', 'expect', domClickCode);
                                        await domExecutor(page, expect);
                                        logger.info(`[TestAgent] ✅ DOM text click OK`);
                                        safeCode = domClickCode;  // spara rätt kod
                                        domClickOk = true;
                                    } catch (_domErr) {
                                        logger.warn(`[TestAgent] DOM click failed — trying href navigation`);
                                    }
                                }
                                if (!domClickOk) {
                                    const linkText = searchText || '';
                                    const href = linkText ? await page.evaluate((text: string) => {
                                        const link = Array.from(document.querySelectorAll('a'))
                                            .find(a => a.textContent?.trim() === text);
                                        return link ? (link as HTMLAnchorElement).href : null;
                                    }, linkText) : null;
                                    if (href && !href.endsWith('#')) {
                                        logger.warn(`[TestAgent] 🔗 Navigating directly to: ${href}`);
                                        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15000 });
                                        logger.info(`[TestAgent] ✅ href navigation OK`);
                                    } else {
                                        throw clickErr;
                                    }
                                }
                            // fill() on a <select> → retry with selectOption()
                            } else if (clickErr.message.includes('not an <input>') && safeCode.includes('.fill(')) {
                                logger.warn(`[TestAgent] ⚠️ fill() on select — retrying with selectOption()`);
                                const fillMatch = safeCode.match(/\.fill\('([^']+)'\)/) || safeCode.match(/\.fill\("([^"]+)"\)/);
                                const fillValue = fillMatch ? fillMatch[1] : '';
                                const selectCode = safeCode.replace(/\.fill\(['"][^'"]+['"]\)/, `.selectOption({ label: '${fillValue}' })`);
                                const selectExecutor = new AsyncFunction('page', 'expect', selectCode);
                                await selectExecutor(page, expect);
                                logger.info(`[TestAgent] ✅ selectOption OK`);
                            } else {
                                throw clickErr;
                            }
                        }
                        // Kort paus så att en eventuell navigering hinner starta
                        await page.waitForTimeout(1000);
                        // Spara session automatiskt efter inloggning (när vi lämnar login-sidan)
                        if (!hasAuth && !page.url().includes('login.') && page.url() !== startUrl) {
                            await context.storageState({ path: AUTH_FILE });
                            fs.writeFileSync(authMetaFile, JSON.stringify({ postLoginUrl: page.url() }), 'utf8');
                            logger.info(`[TestAgent] 💾 Session sparad — post-login URL: ${page.url()}`);
                        }
                        // Vänta tills sidan är klar — hanterar navigeringar och SPA-uppdateringar
                        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
                        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
                        // Ta bort modal-backdrop om den finns kvar (blockerar annars klick)
                        await page.evaluate(() => {
                            document.querySelectorAll('.modal-backdrop, [class*="backdrop"]').forEach(el => (el as HTMLElement).remove());
                            document.body.style.overflow = '';
                            document.body.classList.remove('modal-open');
                        }).catch(() => {});
                        // Track all actions — include URL in key for clicks so same click on different pages is allowed
                        if (safeCode.includes('.click()')) {
                            executedCodes.add(`${page.url()}|${normalizedSafe}`);
                        } else {
                            executedCodes.add(normalizedSafe);
                        }
                        codeLines.push(`  ${safeCode}`);
                        logger.info(`[TestAgent] ✅ OK`);
                        stepSummary.push(`Step ${step}: ✅ ${actionData.thought} → ${safeCode}`);
                    }

                    if (actionData.status === 'done') {
                        logger.info(`[TestAgent] 🏁 Agent completed!`);
                        agentCompleted = true;
                        break;
                    }

                } catch (err: any) {
                    const shortErr = err.message.split('\n')[0].substring(0, 80);
                    logger.error(`[TestAgent] ❌ ${shortErr}`);
                    if (safeCode) {
                        failedCodes.set(safeCode, (failedCodes.get(safeCode) || 0) + 1);
                    }
                    codeLines.push(`  // STEP FAILED: ${shortErr}`);
                    stepSummary.push(`Step ${step}: ❌ FAILED — ${shortErr}`);
                    continue;
                }
            }

        } finally {
            await browser.close();
        }

        // ─── Sammanfattning ────────────────────────────────────────────────────
        const succeeded = stepSummary.filter(s => s.includes('✅')).length;
        const failed    = stepSummary.filter(s => s.includes('❌')).length;
        const skipped   = stepSummary.filter(s => s.includes('⏭️')).length;
        logger.info(`[TestAgent] ${'═'.repeat(50)}`);
        logger.info(`[TestAgent] SUMMARY  ✅ ${succeeded} ok  ❌ ${failed} failed  ⏭️ ${skipped} skipped  |  ${agentCompleted ? '🏁 COMPLETED' : '⚠️  INCOMPLETE'}`);
        stepSummary.forEach(s => logger.info(`[TestAgent]   ${s}`));
        logger.info(`[TestAgent] ${'═'.repeat(50)}`);

        const testName = intent.replace(/'/g, '').substring(0, 80);
        const finalCode =
            `import { test, expect } from '@playwright/test';\n\n` +
            `test('Agent generated test: ${testName}', async ({ page }) => {\n` +
            `${codeLines.join('\n')}\n` +
            `});`;

        const validation = TestValidatorService.validate(finalCode);
        return { success: agentCompleted && validation.isValid, url: startUrl, intent, code: finalCode, validation, iterations: codeLines.length - 1 };
    }

    // ─── Sanitize locators ─────────────────────────────────────────────────────
    // Keeps double quotes inside attribute selectors so they don't conflict with
    // the outer single quotes in page.locator('...') — e.g. [name="city-select"]
    private sanitizeLocator(locator: string): string {
        return locator; // Keep as-is — double quotes inside single-quoted strings are valid JS
    }

    // ─── Build prompt ──────────────────────────────────────────────────────────
    private buildAgentPrompt(scan: ScanResult, intent: string, history: string[]): string {
        const historyText = history.length > 0
            ? history.slice(-8).join('\n')
            : '  (none yet)';

        const buttons = scan.buttons
            .filter(b => b.visible && !b.disabled)
            .slice(0, 10)
            .map(b => `  ${this.sanitizeLocator(b.locator)}  text="${b.text}"`)
            .join('\n') || '  (none)';

        const inputs = scan.inputs
            .filter(i => i.visible)
            .slice(0, 12)
            .map(i => {
                const status = i.currentValue
                    ? ` [ALREADY FILLED: "${i.currentValue}"] — do NOT fill again`
                    : ' [EMPTY — needs a value]';
                if (i.tag === 'select') {
                    const opts = i.options && i.options.length > 0 ? ` options=[${i.options.slice(0, 5).map(o => `"${o}"`).join(', ')}]` : '';
                    return `  ${this.sanitizeLocator(i.locator)}  [SELECT DROPDOWN — use .selectOption("label") NOT .fill()]${opts}${status}`;
                }
                return `  ${this.sanitizeLocator(i.locator)}  placeholder="${i.placeholder ?? ''}"${status}`;
            })
            .join('\n') || '  (none)';

        const links = scan.links
            .filter(l => l.visible)
            .slice(0, 12)
            .map(l => {
                const href = l.href ? `  href="${l.href.replace(/^https?:\/\/[^/]+/, '')}"` : '';
                return `  ${this.sanitizeLocator(l.locator)}  text="${l.text}"${href}`;
            })
            .join('\n') || '  (none)';

        const headings = scan.headings
            .filter(h => h.visible)
            .slice(0, 5)
            .map(h => `  ${h.level}: "${h.text}"`)
            .join('\n') || '  (none)';

        const errorSection = scan.errorMessages && scan.errorMessages.length > 0
            ? scan.errorMessages.map(e => `  ⚠️  "${e}"`).join('\n')
            : null;

        const modalSection = scan.modal?.detected
            ? `MODAL/POPUP BLOCKING THE PAGE:
  Title: "${scan.modal.title ?? 'unknown'}"
  Close locator: ${scan.modal.closeLocator ?? '(no close button found)'}
🚨 A modal is open and blocking the page. You MUST close it before doing ANYTHING else.
   Your ONLY next action is: ${scan.modal.closeLocator ? `await ${scan.modal.closeLocator}.click();` : 'press Escape: await page.keyboard.press("Escape");'}`
            : null;

        return `You are a Playwright test automation agent. You control a live browser step-by-step.

GOAL: ${intent}

CURRENT PAGE: ${scan.url}
PAGE TITLE: "${scan.title}"

PAGE HEADINGS (confirms what page you are on):
${headings}

PREVIOUS STEPS (read carefully — do NOT redo anything marked ✅ or ⏭️):
${historyText}
${modalSection ? `
${modalSection}
` : ''}${errorSection ? `
ERROR MESSAGES ON PAGE (you MUST fix these before doing anything else):
${errorSection}
⚠️ There are validation errors — your next action MUST address one of these errors, not proceed with the original goal.
` : ''}
VISIBLE ELEMENTS ON PAGE (use these locators EXACTLY as shown — do NOT invent your own):
Buttons:
${buttons}
Inputs:
${inputs}
Links (clickable — use the exact locator shown, NEVER use getByRole('button') for these):
${links}

⚠️ LOCATOR RULE: Copy the locator character-for-character from the list above. If 'Spara' appears under Links, use its Links locator — NOT getByRole('button', ...) or getByRole('link', ...).

BEFORE YOU PICK AN ACTION — ask yourself: "Is the GOAL already fully achieved?"
If yes, return status="done" immediately with an assertion. Do NOT do extra steps beyond the goal.

Pick the SINGLE next action needed. Think step-by-step:
1. Read PREVIOUS STEPS first — they tell you exactly what has already been done and where you are now.
   If PREVIOUS STEPS show ✅ login actions, you ARE logged in — do NOT try to log in again.
   Only navigate to a different page if the GOAL requires something that cannot be done on the CURRENT PAGE.
2. Fill ONLY fields explicitly mentioned in the GOAL — do NOT fill other empty fields on the page.
3. NEVER fill inputs marked [ALREADY FILLED]. Move to the next required field or click submit.
4. Do NOT repeat an action marked ✅ or ⏭️ in PREVIOUS STEPS.
5. CRITICAL: Use ONLY locators from VISIBLE ELEMENTS above. NEVER invent or guess locators.
   FORBIDDEN: .filter(), .has(), custom IDs or classes not listed above.
6. CRITICAL: Return EXACTLY ONE await statement in code. Never chain or combine multiple actions.
   WRONG: "await a.click(); await b.fill('x');"
   RIGHT: "await a.click();"
7. Use single quotes inside code strings.
8. When the goal is fully achieved, return status="done" with a Playwright assertion that proves it.
   Examples of done assertions:
   - Navigation succeeded:  await expect(page).toHaveURL('/inventory.html');
   - Element appeared:      await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
   - Text visible:          await expect(page.getByText('Welcome back')).toBeVisible();

Respond with ONLY this JSON (no markdown, no explanation):
{"thought":"reason for action","status":"in-progress","code":"await page.locator('#my-button').click();"}
When goal is achieved:
{"thought":"explain what was verified","status":"done","code":"await expect(page).toHaveURL('/expected-path');"}`;    }

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

        let jsonStr = cleaned.substring(first, last + 1);

        // Attempt 1: direct parse
        try {
            const parsed = JSON.parse(jsonStr);
            return this.extractFields(parsed);
        } catch {}

        // Attempt 2: repair common AI JSON mistakes
        jsonStr = jsonStr
            .replace(/\\([^"\\\/bfnrtu])/g, '$1') // remove invalid escape sequences e.g. \s \( \.
            .replace(/\\\//g, '/')                  // \/ → /
            .replace(/,\s*([\}\]])/g, '$1');        // trailing commas

        try {
            const parsed = JSON.parse(jsonStr);
            return this.extractFields(parsed);
        } catch {}

        // Attempt 3: regex extract each field individually
        const status = (cleaned.match(/"status"\s*:\s*"(in-progress|done)"/) || [])[1] || 'in-progress';
        const thought = (cleaned.match(/"thought"\s*:\s*"([^"]*)"/) || [])[1] || '';
        const codeMatch = cleaned.match(/"code"\s*:\s*"([\s\S]*?)(?<!\\)"\s*[,\}]/);
        const code = codeMatch ? codeMatch[1].replace(/\\"/g, '"').trim() : '';

        if (!code && status === 'in-progress') {
            throw new Error(`Failed to parse AI response: ${cleaned.substring(0, 200)}`);
        }

        return { thought, status, code };
    }

    private extractFields(parsed: any): { thought: string, status: string, code: string } {
        return {
            thought: parsed.thought || '',
            status:  parsed.status  || 'in-progress',
            code:    (parsed.code   || '').trim(),
        };
    }

    // ─── AI call — priority: DeepSeek → Groq → Ollama (local)
    private async callOllama(prompt: string): Promise<string> {
        if (process.env.DEEPSEEK_API_KEY) {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.0,
                }),
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`DeepSeek API error: ${response.status} ${err}`);
            }
            const data = await response.json() as any;
            return data.choices[0].message.content || '';
        }

        if (process.env.GROQ_API_KEY) {
            const Groq = require('groq-sdk');
            const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
            const response = await groq.chat.completions.create({
                model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.0,
            });
            return response.choices[0].message.content || '';
        }

        const ollama = new Ollama({ host: this.baseUrl });
        const response = await ollama.chat({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            options: { temperature: 0.0 }
        });
        return response.message.content;
    }
}