// =============================================================================
// testGenerator.ts — Skapar Playwright .ts-filer på disk
// Tar AI:ns output (POMs + scenarios) och genererar färdiga testfiler.
// Alla kända buggar från originalprojektet är fixade här:
//   - testDir: '.' (inte './tests')
//   - import från './ClassName' (inte '../page-objects/...')
//   - waitForLoadState('load') (inte 'networkidle')
//   - test.skip(true, 'msg') (inte test.skip('msg'))
// =============================================================================
import fs from 'fs-extra';
import path from 'path';
import { PageObjectModel, TestScenario, ArtifactInfo } from './types';
import { logger } from './logger';

export class TestGeneratorService {
  private outputDir: string;
  private pageObjects: PageObjectModel[] = [];

  constructor(runId: string) {
    // Alla genererade filer sparas i /tmp/playwright-gen/{runId}/
    this.outputDir = path.join(process.cwd(), 'tmp', runId);
  }

  /** Returnerar sökvägen till output-mappen (används för ZIP-skapande) */
  getOutputDir(): string {
    return this.outputDir;
  }

  /** Huvud-metoden: genererar alla filer och returnerar metadata */
  async generateAll(
    pageObjects: PageObjectModel[],
    scenarios: TestScenario[],
    baseUrl: string
  ): Promise<ArtifactInfo[]> {
    this.pageObjects = pageObjects;
    const artifacts: ArtifactInfo[] = [];

    await fs.ensureDir(this.outputDir);

    // 1. Skapa Page Object Model-filer (.po.ts)
    for (const pom of pageObjects) {
      const artifact = await this.writePOMFile(pom);
      artifacts.push(artifact);
    }

    // 2. Dela upp scenarier i positiva och negativa
    const positive = scenarios.filter(s => s.type === 'positive');
    const negative = scenarios.filter(s => s.type === 'negative');

    // 3. Skapa spec-filer per scenario-typ
    if (positive.length > 0) {
      const artifact = await this.writeSpecFile('positive-scenarios.spec.ts', positive, pageObjects, 'Positive Test Scenarios', baseUrl);
      artifacts.push(artifact);
    }
    if (negative.length > 0) {
      const artifact = await this.writeSpecFile('negative-scenarios.spec.ts', negative, pageObjects, 'Negative Test Scenarios', baseUrl);
      artifacts.push(artifact);
    }

    // 4. Skapa playwright.config.ts
    artifacts.push(await this.writePlaywrightConfig(baseUrl));

    // 5. Skapa tsconfig.json
    artifacts.push(await this.writeTsConfig());

    // 6. Skapa package.json
    artifacts.push(await this.writePackageJson());

    // 7. Skapa SUMMARY.md
    artifacts.push(await this.writeSummary(pageObjects, scenarios, baseUrl));

    logger.info(`Generated ${artifacts.length} files in ${this.outputDir}`);
    return artifacts;
  }

  // ---------------------------------------------------------------------------
  // Privata hjälpmetoder för att skriva varje filtyp
  // ---------------------------------------------------------------------------

  /**
   * Rättar vanliga AI-misstag i POM-metodkropp:
   *   - `page.xxx()`  → `this.page.xxx()`
   *   - CSS-attr selektorer med enkla citattecken inuti enkla citatteckenstresarar:
   *     'button[role='button']' → 'button[role="button"]'
   */
  private fixPOMCode(code: string): string {
    return code
      // Ersätt `page.` med `this.page.` men undvik att dubbelkorrigera `this.page.`
      .replace(/(?<!this\.)\bpage\./g, 'this.page.')
      // Fixa CSS-attribut-selektorer med enkla citaten inuti enkla citatsträngar
      // T.ex: [role='button'] → [role="button"]  (undviker SyntaxError)
      .replace(/\[([\w-]+)='([^']*)'/g, '[$1="$2"');
  }

  /**
   * Rättar AI-genererade teststeg:
   * AI:n skriver ibland:
   *   - Bara metodnamnet: "gotoHem"                   → "await portfolioPage.gotoHem();"
   *   - Klassnamn.metod: "YouTubePage.goToHomePage"   → "await youTubePage.goToHomePage();"
   *   - Klassnamn.metod med semikolon/inget parentes  → fixas
   */
  private fixTestAction(action: string, pageObjects: PageObjectModel[]): string {
    let trimmed = action.trim().replace(/;$/, '');  // Ta bort trailing semikolon för enklare matchning

    // Mönster 1: "ClassName.methodName" eller "ClassName.methodName()" (utan instans)
    const classMethodMatch = trimmed.match(/^([A-Z][a-zA-Z0-9]*)\.(\w+)(\(.*\))?$/);
    if (classMethodMatch) {
      const [, className, methodName] = classMethodMatch;
      // Hitta rätt POM baserat på klassnamn
      const pom = pageObjects.find(p => p.className === className)
        ?? pageObjects.find(p => p.methods.find(m => m.name === methodName));
      if (pom) {
        const instanceName = pom.className.charAt(0).toLowerCase() + pom.className.slice(1);
        return `await ${instanceName}.${methodName}();`;
      }
    }

    // Mönster 2: Redan ett giltigt TypeScript-uttryck (innehåller parentes, await, slaå eller page.)
    if (/[().]/.test(trimmed) || trimmed.startsWith('await') || trimmed.startsWith('//')) {
      // Se till att async-anrop har await
      if (/(?:page|this)\.\w/.test(trimmed) && !trimmed.startsWith('await')) {
        return `await ${trimmed};`;
      }
      return `${trimmed};`;
    }

    // Mönster 3: Bara metodnamnet utan parentes (t.ex. "gotoHem")
    for (const pom of pageObjects) {
      const match = pom.methods.find(m => m.name === trimmed);
      if (match) {
        const instanceName = pom.className.charAt(0).toLowerCase() + pom.className.slice(1);
        return `await ${instanceName}.${trimmed}();`;
      }
    }

    // Fallback: kommentera ut så filen åtminstone kompilerar
    return `// TODO: ${trimmed}`;
  }

  private async writePOMFile(pom: PageObjectModel): Promise<ArtifactInfo> {
    const filename = `${pom.className}.po.ts`;
    const filePath = path.join(this.outputDir, filename);
    const hostname = (() => { try { return new URL(pom.url).hostname; } catch { return pom.url; } })();

    const methods = pom.methods.map(method => {
      const params = method.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
      // BUGGFIX: Rätta `page.` → `this.page.` i AI-genererad kod
      const fixedCode = this.fixPOMCode(method.code);
      return `
  /**
   * ${method.description}
   */
  async ${method.name}(${params}): Promise<void> {
    ${fixedCode}
  }`;
    }).join('\n');

    const content = `import { Page, expect } from '@playwright/test';

/**
 * Page Object Model: ${pom.className}
 * URL: ${pom.url}
 * Webbsida: ${hostname}
 */
export class ${pom.className} {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigera till sidan */
  async goto(): Promise<void> {
    await this.page.goto('${pom.url}');
    // OBS: Använd 'load' istället för 'networkidle' — moderna sidor timeout:ar annars
    await this.page.waitForLoadState('load');
  }
${methods}

  // --- Hjälpmetoder ---

  /** Vänta på att sidan ska laddas */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('load');
  }

  /** Hämta sidans URL */
  async getUrl(): Promise<string> {
    return this.page.url();
  }

  /** Hämta sidans titel */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /** Kolla om ett element är synligt (returnerar true/false, kastar inte fel) */
  async isVisible(selector: string): Promise<boolean> {
    try {
      await this.page.locator(selector).first().waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
`;
    await fs.writeFile(filePath, content);
    const stats = await fs.stat(filePath);
    return { type: 'pom', filename, filePath, fileSize: stats.size };
  }

  private async writeSpecFile(
    filename: string,
    scenarios: TestScenario[],
    pageObjects: PageObjectModel[],
    description: string,
    baseUrl: string
  ): Promise<ArtifactInfo> {
    const filePath = path.join(this.outputDir, filename);
    const hostname = (() => { try { return new URL(baseUrl).hostname; } catch { return baseUrl; } })();

    // BUGGFIX: Importera från './' (inte '../page-objects/')
    const imports = pageObjects.map(pom =>
      `import { ${pom.className} } from './${pom.className}.po';`
    ).join('\n');

    // Skapa POM-instanser inuti beforeEach-blocket
    const pomInstances = pageObjects.map(pom => {
      const instanceName = pom.className.charAt(0).toLowerCase() + pom.className.slice(1);
      return `    const ${instanceName} = new ${pom.className}(page);`;
    }).join('\n');

    const testCases = scenarios.map(scenario => {
      const steps = scenario.steps.map(step => {
        // BUGGFIX: Rätta AI-genererade teststeg som saknar await/instans/parentes
        const fixedAction = this.fixTestAction(step.action, pageObjects);
        return `    // ${step.description}\n    ${fixedAction}`;
      }).join('\n\n');

      return `
  test('${scenario.name}', async ({ page }) => {
    // ${scenario.description}
${pomInstances ? pomInstances + '\n' : ''}${steps}
  });`;
    }).join('\n');

    const content = `import { test, expect } from '@playwright/test';
${imports}

/**
 * ${description}
 * Genererad automatiskt av playwright-gen för: ${hostname}
 */
test.describe('${hostname} — ${description}', () => {

  test.beforeEach(async ({ page }) => {
    // Navigera till startsidan före varje test
    await page.goto('${baseUrl}');
    await page.waitForLoadState('load');
  });
${testCases}
});
`;
    await fs.writeFile(filePath, content);
    const stats = await fs.stat(filePath);
    return { type: 'test', filename, filePath, fileSize: stats.size };
  }

  private async writePlaywrightConfig(baseUrl: string): Promise<ArtifactInfo> {
    const filename = 'playwright.config.ts';
    const filePath = path.join(this.outputDir, filename);

    const content = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // BUGGFIX: testDir '.' hittar spec-filer i samma mapp som config-filen
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: '${baseUrl}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
`;
    await fs.writeFile(filePath, content);
    const stats = await fs.stat(filePath);
    return { type: 'config', filename, filePath, fileSize: stats.size };
  }

  private async writeTsConfig(): Promise<ArtifactInfo> {
    const filename = 'tsconfig.json';
    const filePath = path.join(this.outputDir, filename);
    const content = JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        lib: ['ES2020'],
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        skipLibCheck: true,
        types: ['@playwright/test'],
      },
      // BUGGFIX: '**/*.ts' hittar spec-filerna och POM-filerna i rotmappen
      include: ['**/*.ts'],
      exclude: ['node_modules', 'test-results', 'playwright-report'],
    }, null, 2);
    await fs.writeFile(filePath, content);
    const stats = await fs.stat(filePath);
    return { type: 'config', filename, filePath, fileSize: stats.size };
  }

  private async writePackageJson(): Promise<ArtifactInfo> {
    const filename = 'package.json';
    const filePath = path.join(this.outputDir, filename);
    const content = JSON.stringify({
      name: 'generated-playwright-tests',
      version: '1.0.0',
      scripts: {
        test: 'playwright test',
        'test:headed': 'playwright test --headed',
        report: 'playwright show-report',
      },
      devDependencies: {
        '@playwright/test': '^1.41.0',
        typescript: '^5.3.0',
      },
    }, null, 2);
    await fs.writeFile(filePath, content);
    const stats = await fs.stat(filePath);
    return { type: 'config', filename, filePath, fileSize: stats.size };
  }

  private async writeSummary(
    pageObjects: PageObjectModel[],
    scenarios: TestScenario[],
    baseUrl: string
  ): Promise<ArtifactInfo> {
    const filename = 'SUMMARY.md';
    const filePath = path.join(this.outputDir, filename);
    const positive = scenarios.filter(s => s.type === 'positive');
    const negative = scenarios.filter(s => s.type === 'negative');

    const content = `# Genererade Playwright-tester

**Webbsida:** ${baseUrl}  
**Genererad:** ${new Date().toLocaleString('sv-SE')}

## Page Object Models (${pageObjects.length} st)
${pageObjects.map(p => `- \`${p.className}.po.ts\` — ${p.methods.length} metoder`).join('\n')}

## Testscenarier (${scenarios.length} st)
- ✅ Positiva: ${positive.length} scenarier
- ❌ Negativa: ${negative.length} scenarier

${scenarios.map(s => `- **${s.name}** (${s.type}): ${s.steps.length} steg`).join('\n')}

## Kom igång

\`\`\`bash
# 1. Installera beroenden
npm install
npx playwright install chromium

# 2. Kör alla tester
npx playwright test

# 3. Visa HTML-rapport
npx playwright show-report
\`\`\`
`;
    await fs.writeFile(filePath, content);
    const stats = await fs.stat(filePath);
    return { type: 'summary', filename, filePath, fileSize: stats.size };
  }
}
