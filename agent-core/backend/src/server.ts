import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { TestAgentService } from './testAgent';
import { logger } from './logger';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// GET /api/generate-agentic?url=...&intent=...
// ---------------------------------------------------------------------------
app.get('/api/generate-agentic', async (req, res) => {
    const url = req.query.url as string;
    const intent = (req.query.intent as string)?.trim();

    if (!url) return res.status(400).json({ error: 'url krävs' });
    if (!intent) return res.status(400).json({ error: 'intent krävs' });

    try { new URL(url); } catch {
        return res.status(400).json({ error: 'Ogiltig URL' });
    }

    try {
        logger.info(`[generate-agentic] Starting Agent for ${url} with intent="${intent}"`);
        const agent = new TestAgentService();
        const result = await agent.runAgent(url, intent);
        res.json(result);
    } catch (err: any) {
        logger.error(`[generate-agentic] Failed: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/run-test  — kör genererad testkod med Playwright
// ---------------------------------------------------------------------------
app.post('/api/run-test', async (req, res) => {
    const { code } = req.body as { code?: string };
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'code krävs' });
    }

    // Skapa en temporär katalog utanför projektmappen (undviker ts-node-dev restart)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-run-'));
    const testFile = path.join(tmpDir, 'generated.spec.ts');
    const configFile = path.join(tmpDir, 'playwright.config.js');  // JS — inte TS

    // Config som vanlig JS, undviker att ts-node-dev triggas
    const resultsJson = path.join(tmpDir, 'results.json').replace(/\\/g, '\\\\');
    const testDir = tmpDir.replace(/\\/g, '\\\\');
    const authFile = path.join(__dirname, '..', 'auth.json');
    const authLine = fs.existsSync(authFile)
        ? `storageState: '${authFile.replace(/\\/g, '\\\\')}',`
        : '';
    const configContent = `module.exports = {
  testDir: '${testDir}',
  timeout: 120000,
  use: { ignoreHTTPSErrors: true, headless: false, slowMo: 800, ${authLine} },
  reporter: [['list'], ['json', { outputFile: '${resultsJson}' }]],
};
`;
    // Replace .fill('...') with .pressSequentially('...', { delay: 80 }) for human-like typing
    const slowCode = code.replace(/\.fill\(('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\)/g, '.pressSequentially($1, { delay: 80 })');

    fs.writeFileSync(configFile, configContent, 'utf8');
    fs.writeFileSync(testFile, slowCode, 'utf8');

    logger.info(`[run-test] Running test: ${testFile}`);

    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    const backendDir = path.join(__dirname, '..');
    // Använd --grep . för att matcha alla tester och låt config peka på testDir
    execFile(npx, ['playwright', 'test', '--config', configFile, '--grep', '.'], {
        cwd: backendDir,
        timeout: 120000,
        shell: true,
        env: {
            ...process.env,
            NODE_PATH: path.join(backendDir, 'node_modules'),
        },
    }, (error, stdout, stderr) => {
        const output = stdout + (stderr ? '\n' + stderr : '');
        const passed = !error || error.code === 0;

        // Försök läsa JSON-resultat
        let results: any = null;
        try {
            const jsonPath = path.join(tmpDir, 'results.json');
            if (fs.existsSync(jsonPath)) {
                results = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            }
        } catch { /* ignore */ }

        // Städa upp temp-filer
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

        logger.info(`[run-test] ${passed ? 'PASSED' : 'FAILED'}`);
        res.json({ passed, output: output.trim(), results });
    });
});

app.listen(PORT, () => {
    logger.info(`Agent backend running on http://localhost:${PORT}`);
    logger.info(`Ollama model: ${process.env.OLLAMA_MODEL || 'llama3'}`);
});
