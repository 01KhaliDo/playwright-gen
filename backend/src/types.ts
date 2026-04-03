// =============================================================================
// types.ts — Alla gemensamma TypeScript-typer för backend
// =============================================================================

// Inkommande förfrågan från frontend när användaren klickar "Generera"
export interface GenerateRequest {
    url: string;          // Webbsidans URL
    scenarioCount: number; // Hur många testscenarier AI:n ska generera
}

// Resultatet från en crawlad sida
export interface CrawlResult {
    url: string;
    title: string;
    elements: ElementInfo[]; // Interaktiva element (knappar, inputs etc.)
    forms: FormInfo[];        // Formulär och deras fält
    links: LinkInfo[];        // Interna länkar (för att hitta fler sidor)
}

// Ett enskilt interaktivt element på en sida
export interface ElementInfo {
    tag: string;            // HTML-tag (button, input, a...)
    text?: string;          // Synlig text
    role?: string;          // ARIA-roll
    name?: string;          // name-attribut
    label?: string;         // Kopplad label
    placeholder?: string;   // Placeholder-text för inputs
    alt?: string;           // Alt-text för bilder
    'data-testid'?: string; // data-testid-attribut
    'aria-label'?: string;  // aria-label
    href?: string;          // Länkmål (för <a>-taggar)
    locator?: string;       // Playwright-locator (getByRole, getByLabel...)
}

export interface FormInfo {
    action: string;
    method: string;
    fields: ElementInfo[];
}

export interface LinkInfo {
    href: string;
    text: string;
}

// En AI-genererad Page Object Model-klass
export interface PageObjectModel {
    className: string;
    url: string;
    methods: POMMethod[];
}

export interface POMMethod {
    name: string;
    description: string;
    parameters: MethodParameter[];
    code: string;
}

export interface MethodParameter {
    name: string;
    type: string;
    description: string;
}

// Ett enskilt testscenario genererat av AI:n
export interface TestScenario {
    name: string;
    description: string;
    type: 'positive' | 'negative';
    steps: TestStep[];
}

export interface TestStep {
    description: string;
    action: string;
    expectedResult: string;
}

// Metadata om en genererad fil
export interface ArtifactInfo {
    type: 'pom' | 'test' | 'config' | 'summary';
    filename: string;
    filePath: string;
    fileSize: number;
}

// Progress-event som skickas via SSE till frontend
export interface ProgressEvent {
    step: 'crawler' | 'ai-pom' | 'ai-scenarios' | 'files' | 'done' | 'error';
    message: string;
    detail?: string;      // Extra detaljer (t.ex. antal element hittade)
    runId?: string;       // Sätts i "done"-steget
    error?: string;       // Felmeddelande om step === 'error'
}
