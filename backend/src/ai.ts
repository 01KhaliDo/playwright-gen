// =============================================================================
// ai.ts — Ollama AI-integration
// Skickar crawl-data till lokal Ollama-instans och returnerar genererade tester.
// Steg 1: Generera Page Object Models
// Steg 2: Generera testscenarier (60% positiva, 40% negativa)
// =============================================================================
import { Ollama } from 'ollama';
import { z } from 'zod';
import { CrawlResult, PageObjectModel, TestScenario } from './types';
import { pageObjectPrompt, scenarioPrompt } from './prompts';
import { logger } from './logger';

// --- Zod-scheman för att validera AI:ns JSON-svar ---

const POMMethodSchema = z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.array(z.object({
        name: z.string(),
        type: z.string(),
        description: z.string(),
    })).default([]),
    code: z.string(),
});

const PageObjectSchema = z.object({
    className: z.string(),
    url: z.string(),
    methods: z.array(POMMethodSchema),
});

const GenerationResponseSchema = z.object({
    pageObjects: z.array(PageObjectSchema),
});

const TestStepSchema = z.object({
    description: z.string(),
    action: z.string(),
    expectedResult: z.string(),
});

const ScenarioSchema = z.object({
    name: z.string(),
    description: z.string(),
    type: z.enum(['positive', 'negative']),
    steps: z.array(TestStepSchema),
});

const ScenariosResponseSchema = z.object({
    scenarios: z.array(ScenarioSchema),
});

// --- AI-tjänsten ---

export class AIService {
    private model: string;
    private baseUrl: string;

    constructor() {
        this.model = process.env.OLLAMA_MODEL || 'llama3';
        this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    }

    /**
     * Steg 1: Genererar Page Object Model-klasser baserade på crawl-data.
     * Returns: array av PageObjectModel
     */
    async generatePageObjects(crawlResults: CrawlResult[]): Promise<PageObjectModel[]> {
        const url = crawlResults[0]?.url || 'unknown';
        const prompt = pageObjectPrompt(crawlResults, url);

        logger.info(`Sending POM prompt to Ollama (${this.model})...`);
        const content = await this.callOllama(
            prompt,
            'You are an expert test automation engineer specializing in Page Object Model design for Playwright tests. Generate clean, maintainable POM classes with semantic method names. Always respond with valid JSON only.',
            4000
        );

        const parsed = this.parseJSONResponse(content);
        const validated = GenerationResponseSchema.parse(parsed);
        return validated.pageObjects as PageObjectModel[];
    }

    /**
     * Steg 2: Genererar testscenarier baserat på crawl-data + de genererade POMs.
     * Returns: array av TestScenario
     */
    async generateScenarios(
        crawlResults: CrawlResult[],
        pageObjects: PageObjectModel[],
        count: number
    ): Promise<TestScenario[]> {
        const url = crawlResults[0]?.url || 'unknown';
        const prompt = scenarioPrompt(crawlResults, pageObjects, count, url);

        logger.info(`Sending scenario prompt to Ollama (${this.model})...`);
        const content = await this.callOllama(
            prompt,
            'You are an expert QA engineer. Generate realistic test scenarios covering positive and negative cases. Focus on user workflows and edge cases. Always respond with valid JSON only.',
            3000
        );

        const parsed = this.parseJSONResponse(content);
        const validated = ScenariosResponseSchema.parse(parsed);
        return validated.scenarios as TestScenario[];
    }

    /** Skickar ett prompt till Ollama med system-prompt och token-begränsning */
    private async callOllama(prompt: string, systemPrompt?: string, numPredict = 4096): Promise<string> {
        const ollama = new Ollama({ host: this.baseUrl });

        const messages: Array<{ role: string; content: string }> = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await ollama.chat({
            model: this.model,
            messages: messages as any,
            format: 'json',
            options: {
                temperature: 0.1,
                num_predict: numPredict,
            },
        });

        return response.message.content;
    }

    /**
     * Parsar AI:ns JSON-svar med automatisk felreparering.
     * Hanterar vanliga AI-misstag: trailing commas, JS-kommentarer,
     * avbrutna svar och specialtecken i strängar.
     */
    private parseJSONResponse(content: string): any {
        // Extrahera JSON-blocket (AI:n kan ha text runt det trots format:json)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error(`No JSON found in AI response. Response was: ${content.substring(0, 300)}`);
        }

        let jsonStr = jsonMatch[0];

        // Försök 1: Direkt parsning
        try {
            return JSON.parse(jsonStr);
        } catch (_e1) {
            logger.warn('Direct JSON parse failed, attempting repair...');
        }

        // Försök 2: Reparera vanliga fel
        try {
            jsonStr = this.repairJSON(jsonStr);
            return JSON.parse(jsonStr);
        } catch (_e2) {
            logger.warn('Repaired JSON parse failed, trying partial extraction...');
        }

        // Försök 3: Klipp av vid sista giltiga '}'  
        try {
            const lastBrace = jsonStr.lastIndexOf('}');
            if (lastBrace > 0) {
                return JSON.parse(jsonStr.substring(0, lastBrace + 1));
            }
        } catch (_e3) { /* ignorera */ }

        throw new Error(`Failed to parse JSON from AI response. First 300 chars: ${content.substring(0, 300)}`);
    }

    /**
     * Reparerar vanliga JSON-fel som AI-modeller gör:
     * - Trailing commas (,} eller ,])
     * - JS-kommentarer (// ...)
     * - Enkla citattecken istället för dubbla
     * - Radbrytningar inne i strängar
     */
    private repairJSON(str: string): string {
        return str
            // Ta bort JS-kommentarer
            .replace(/\/\/[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            // Ta bort trailing commas före } eller ]
            .replace(/,\s*([}\]])/g, '$1')
            // Ersätt radbrytningar inne i strängar med \n
            .replace(/"((?:[^"\\]|\\.)*)"\s*:/g, (match) =>
                match.replace(/\n/g, '\\n').replace(/\r/g, '')
            );
    }
}
