// =============================================================================
// server.ts — Express HTTP-server (backend entry point)
//
// Endpoints:
//   GET /api/generate?url=...&count=5  → Server-Sent Events (SSE) progress
//   GET /api/download/:runId           → ZIP-fil med genererade tester
//   GET /health                        → Hälsokontroll
//
// Flöde:
//   1. Frontend anropar /api/generate med URL + antal tester
//   2. Servern öppnar en SSE-ström och skickar progress-events i realtid
//   3. Crawler → AI (POMs) → AI (scenarios) → Filgenerering → Klar
//   4. I "done"-event skickas runId som frontend kan använda för nedladdning
//   5. Frontend anropar /api/download/:runId för att hämta ZIP-filen
// =============================================================================
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';
import archiver from 'archiver';
import { CrawlerService } from './crawler';
import { AIService } from './ai';
import { TestGeneratorService } from './testGenerator';
import { ScannerService } from './scanner';
import { TestBuilderService } from './testBuilder';
// import { TestRunnerService } from './testRunner'; // Removed as requested
import { TestValidatorService } from './testValidator';
import { ProgressEvent } from './types';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Låt frontend (localhost:3000) kommunicera med backend (localhost:3001)
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// ---------------------------------------------------------------------------
// GET /health — Hälsokontroll
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// GET /api/crawl-debug?url=... — Kör bara crawlern och returnerar rå JSON
// Bra för att se exakt vad crawlern samlar in (utan att anropa AI:n)
// ---------------------------------------------------------------------------
app.get('/api/crawl-debug', async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'url krävs' });
    const crawlerService = new CrawlerService(parseInt(process.env.MAX_PAGES || '5'));
    try {
        await crawlerService.initialize();
        const results = await crawlerService.crawlSite(url);
        await crawlerService.close();
        res.json({ url, pages: results.length, results });
    } catch (err: any) {
        try { await crawlerService.close(); } catch { }
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/scan?url=... — Skannar EN sida med Playwright, returnerar strukturerad JSON
// Steg 1 i pipeline: inga länkar följs, bara DOM-extraktion
// ---------------------------------------------------------------------------
app.get('/api/scan', async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'url krävs' });
    try {
        new URL(url);
    } catch {
        return res.status(400).json({ error: 'Ogiltig URL' });
    }
    const scanner = new ScannerService();
    try {
        const result = await scanner.scan(url);
        res.json(result);
    } catch (err: any) {
        logger.error(`Scan failed for ${url}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});


// ---------------------------------------------------------------------------
// Helper: smartScan
// Skannar steg 1 (startUrl), analyserar intent mot länkarna på sidan,
// och skannar upp till MAX_EXTRA_PAGES relevanta undersidor automatiskt.
// ---------------------------------------------------------------------------
const PAGE_KEYWORD_MAP: Record<string, string[]> = {
    'cart': ['cart', 'kundvagn', 'basket', 'bag', 'korv'],
    'checkout': ['checkout', 'betala', 'payment', 'order', 'kassa'],
    'login': ['login', 'logga in', 'sign in', 'signin', 'auth'],
    'register': ['register', 'signup', 'sign up', 'skapa konto', 'registrera'],
    'profile': ['profile', 'account', 'konto', 'profil', 'my account'],
    'search': ['search', 'sök', 'results', 'resultat', 'hitta'],
    'product': ['product', 'item', 'produkt', 'detalj', 'detail', 'inventory'],
    'dashboard': ['dashboard', 'overview', 'start', 'hem', 'panel'],
};
const MAX_EXTRA_PAGES = 2;

async function smartScan(startUrl: string, intent: string): Promise<import('./scanner').ScanResult> {
    const scanner = new ScannerService();
    const intentLower = intent.toLowerCase();

    // Steg 1: Scanna startsidan
    logger.info(`[smartScan] Primary scan: ${startUrl}`);
    const primaryScan = await scanner.scan(startUrl);

    // Steg 2: Hitta vilka "page-kategorier" intentet nämner
    const relevantKeywords = Object.entries(PAGE_KEYWORD_MAP)
        .filter(([, kws]) => kws.some(kw => intentLower.includes(kw)))
        .map(([category]) => category);

    if (relevantKeywords.length === 0) {
        logger.info(`[smartScan] No extra pages needed for intent: "${intent}"`);
        return primaryScan;
    }

    logger.info(`[smartScan] Intent mentions pages: ${relevantKeywords.join(', ')} — searching linked pages`);

    // Steg 3: Matcha mot de verkliga länkarna som hittades på primärsidan
    const origin = new URL(startUrl).origin;
    const extraUrls = new Set<string>();

    for (const category of relevantKeywords) {
        const categoryKeywords = PAGE_KEYWORD_MAP[category];
        for (const link of primaryScan.links) {
            if (extraUrls.size >= MAX_EXTRA_PAGES) break;
            try {
                const linkUrl = new URL(link.href, origin);
                // Hoppa över externa domäner
                if (linkUrl.origin !== origin) continue;
                const path = linkUrl.pathname.toLowerCase();
                const text = link.text.toLowerCase();
                if (categoryKeywords.some(kw => path.includes(kw) || text.includes(kw))) {
                    const fullUrl = linkUrl.href;
                    if (fullUrl !== startUrl) {
                        extraUrls.add(fullUrl);
                        logger.info(`[smartScan] Queuing sub-page for "${category}": ${fullUrl}`);
                    }
                }
            } catch { /* skip invalid link */ }
        }
    }

    if (extraUrls.size === 0) {
        logger.info(`[smartScan] No matching linked pages found — using primary scan only`);
        return primaryScan;
    }

    // Steg 4: Slå ihop med scanMultiple
    const allUrls = [startUrl, ...extraUrls];
    logger.info(`[smartScan] Multi-scan: ${allUrls.join(', ')}`);
    return scanner.scanMultiple(allUrls);
}

// ---------------------------------------------------------------------------
// GET /api/generate-test?url=...&intent=...
// Steg 2: Skannar sidan + skickar till AI → returnerar ett enkelt Playwright-test
// ---------------------------------------------------------------------------
app.get('/api/generate-test', async (req, res) => {
    const url = req.query.url as string;
    const intent = (req.query.intent as string)?.trim();

    if (!url) return res.status(400).json({ error: 'url krävs' });
    if (!intent) return res.status(400).json({ error: 'intent krävs (t.ex. "testa sökfunktionen")' });

    try { new URL(url); } catch {
        return res.status(400).json({ error: 'Ogiltig URL' });
    }

    try {
        // Steg 1: Smart multi-page scan
        logger.info(`[generate-test] Smart scanning ${url} for intent="${intent}"...`);
        const scan = await smartScan(url, intent);
        logger.info(`[generate-test] Scan complete: ${scan.buttons.length} buttons, ${scan.inputs.length} inputs from ${scan.url}`);

        // Steg 2: Generera test med AI
        logger.info(`[generate-test] AI generating test for intent="${intent}"...`);
        const builder = new TestBuilderService();
        const result = await builder.generateTest(scan, intent);

        // Steg 3: Validera kod
        const validation = TestValidatorService.validate(result.code);

        // Returnera JSON istället för text/plain
        res.json({
            success: true,
            url,
            intent,
            code: result.code,
            validation
        });
    } catch (err: any) {
        logger.error(`[generate-test] Failed: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/generate-agentic?url=...&intent=...
// Steg 4: Agent-loop som interagerar med webbläsaren för att bygga testet steg-för-steg
// ---------------------------------------------------------------------------
app.get('/api/generate-agentic', async (req, res) => {
    const url = req.query.url as string;
    const intent = (req.query.intent as string)?.trim();

    if (!url) return res.status(400).json({ error: 'url krävs' });
    if (!intent) return res.status(400).json({ error: 'intent krävs' });

    try { new URL(url); } catch { return res.status(400).json({ error: 'Ogiltig URL' }); }

    try {
        logger.info(`[generate-agentic] Starting Agent for ${url} with intent="${intent}"`);
        // Import dynamically here to avoid replacing top of file if not needed
        const { TestAgentService } = await import('./testAgent');
        const agent = new TestAgentService();
        const result = await agent.runAgent(url, intent);

        res.json(result);
    } catch (err: any) {
        logger.error(`[generate-agentic] Failed: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/run-test 
// Steg 2b: Tar emot TS-kod, sparar till tempfil, kör `npx playwright test` och returnerar output.
// ---------------------------------------------------------------------------
// POST /api/run-test — REMOVED AS REQUESTED BY USER

// ---------------------------------------------------------------------------
// GET /api/generate?url=...&count=5
// Startar generering och strömmar progress via Server-Sent Events
// ---------------------------------------------------------------------------
app.get('/api/generate', async (req, res) => {
    const url = req.query.url as string;
    const count = parseInt(req.query.count as string) || 5;

    // Validera indata
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    try {
        new URL(url); // Kastar om URL:en är ogiltig
    } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Sätt upp SSE-headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Stäng av Nginx-buffering
    res.flushHeaders();

    // Hjälpfunktion för att skicka ett SSE-event till frontend
    const sendEvent = (event: ProgressEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const runId = uuidv4();
    const crawlerService = new CrawlerService(parseInt(process.env.MAX_PAGES || '5'));
    const aiService = new AIService();
    const testGen = new TestGeneratorService(runId);

    try {
        // Steg 1: Crawla webbsidan
        sendEvent({ step: 'crawler', message: `Startar crawling av ${url}...` });
        await crawlerService.initialize();
        const crawlResults = await crawlerService.crawlSite(url);
        await crawlerService.close();

        const totalElements = crawlResults.reduce((acc, r) => acc + r.elements.length, 0);
        sendEvent({
            step: 'crawler',
            message: `Crawling klar!`,
            detail: `Hittade ${crawlResults.length} sida(or) och ${totalElements} element`,
        });

        // Steg 2: Generera Page Object Models med AI
        sendEvent({ step: 'ai-pom', message: 'AI genererar Page Object Models...' });
        const pageObjects = await aiService.generatePageObjects(crawlResults);
        sendEvent({
            step: 'ai-pom',
            message: 'Page Objects klara!',
            detail: `Genererade ${pageObjects.length} POM-klass(er)`,
        });

        // Steg 3: Generera testscenarier med AI
        sendEvent({ step: 'ai-scenarios', message: `AI genererar ${count} testscenarier...` });
        const scenarios = await aiService.generateScenarios(crawlResults, pageObjects, count);
        const pos = scenarios.filter(s => s.type === 'positive').length;
        const neg = scenarios.filter(s => s.type === 'negative').length;
        sendEvent({
            step: 'ai-scenarios',
            message: 'Scenarier klara!',
            detail: `${pos} positiva, ${neg} negativa`,
        });

        // Steg 4: Skapa testfiler på disk
        sendEvent({ step: 'files', message: 'Skapar testfiler...' });
        const artifacts = await testGen.generateAll(pageObjects, scenarios, url);
        sendEvent({
            step: 'files',
            message: 'Filer skapade!',
            detail: `${artifacts.length} filer redo för nedladdning`,
        });

        // Steg 5: Klar! Skicka runId till frontend
        sendEvent({ step: 'done', message: 'Klart! Redo för nedladdning.', runId });

    } catch (error: any) {
        logger.error(`Generation failed for ${url}: ${error.message}`);
        sendEvent({ step: 'error', message: 'Något gick fel', error: error.message });
        // Försök stänga crawlern om den är öppen
        try { await crawlerService.close(); } catch { }
    } finally {
        res.end();
    }
});

// ---------------------------------------------------------------------------
// GET /api/download/:runId
// Packar ihop de genererade filerna till en ZIP och skickar tillbaka
// ---------------------------------------------------------------------------
app.get('/api/download/:runId', async (req, res) => {
    const { runId } = req.params;
    const outputDir = path.join(process.cwd(), 'tmp', runId);

    // Kontrollera att mappen finns
    if (!await fs.pathExists(outputDir)) {
        return res.status(404).json({ error: 'Run not found or expired' });
    }

    // Sätt headers för ZIP-nedladdning
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="playwright-tests-${runId.substring(0, 8)}.zip"`);

    // Skapa och strömma ZIP-arkivet direkt till HTTP-svaret
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
        logger.error(`Archive error: ${err}`);
        res.status(500).end();
    });

    archive.pipe(res);
    archive.directory(outputDir, false); // false = lägg filerna i ZIP-roten
    await archive.finalize();

    logger.info(`ZIP downloaded for runId: ${runId}`);
});

// ---------------------------------------------------------------------------
// Starta servern
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    logger.info(`Backend running on http://localhost:${PORT}`);
    logger.info(`Ollama model: ${process.env.OLLAMA_MODEL || 'llama3'}`);
});
