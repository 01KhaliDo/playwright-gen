import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { TestAgentService } from './testAgent';
import { logger } from './logger';

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

app.listen(PORT, () => {
    logger.info(`Agent backend running on http://localhost:${PORT}`);
    logger.info(`Ollama model: ${process.env.OLLAMA_MODEL || 'llama3'}`);
});
