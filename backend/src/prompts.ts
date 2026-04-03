// =============================================================================
// prompts.ts — AI-prompter som skickas till Ollama
// VIKTIGT: Håll dessa korta! Längre prompter = fler tokens = långsammare svar.
// Originalprojektets prompts används som mall — de är bevisligen effektiva.
// =============================================================================

/**
 * Prompt för att generera Page Object Model-klasser.
 * Skickar max 20 element per sida (som originalet) — inte 50.
 */
export const pageObjectPrompt = (crawlResults: any[], websiteUrl: string): string => {
  const pagesSummary = crawlResults.map(result => {
    const elements = result.elements.slice(0, 20); // Max 20, som originalet
    const forms = result.forms;
    return `
Page: ${result.url}
Title: ${result.title}
Key Elements: ${elements.map((el: any) => `${el.tag}(${el.locator})`).join(', ')}
Forms: ${forms.length} forms found
    `.trim();
  }).join('\n\n');

  return `
Generate Page Object Model classes for the following website pages. Each POM should:
- Have a descriptive class name based on the page purpose and functionality
- Include methods for all major user interactions found on the page
- Use the provided Playwright locators following this priority order: 1. data-testid, 2. getByRole, 3. getByLabel, 4. getByPlaceholder, 5. href-based locator, 6. text locator
- CRITICAL: When multiple links have the same text (e.g. several "GitHub" links), use the href attribute to target the correct one!
- UNIVERSAL UI RULES: For hidden elements/hover, always \`.hover()\` the parent container before clicking. For forms without submit buttons, use \`await page.keyboard.press('Enter');\`. Never click checkboxes to trigger actions like delete/submit. Always scope locators for list items to the specific row first (e.g. \`locator('li').filter({hasText: 'A'}).locator('button')\`).
- Follow semantic naming conventions (e.g., login(), search(query), addToCart(product))
- Include proper TypeScript types and error handling
- Use stable selectors that won't break with UI changes

Website URL: ${websiteUrl}
Website Analysis:
${pagesSummary}

Generate exactly ${crawlResults.length} Page Object Model classes. Return as JSON:
{
  "pageObjects": [
    {
      "className": "string",
      "url": "string",
      "methods": [
        {
          "name": "string",
          "description": "string",
          "parameters": [
            { "name": "string", "type": "string", "description": "string" }
          ],
          "code": "string"
        }
      ]
    }
  ]
}
  `.trim();
};

/**
 * Prompt för att generera testscenarier.
 * Max 10 element per sida (som originalet) — inte 20+.
 */
export const scenarioPrompt = (
  crawlResults: any[],
  pageObjects: any[],
  count: number,
  websiteUrl: string
): string => {
  const positiveCount = Math.ceil(count * 0.6);
  const negativeCount = count - positiveCount;

  const pagesSummary = crawlResults.map(result => `
Page: ${result.url}
Title: ${result.title}
Available Actions: ${result.elements.slice(0, 10).map((el: any) => el.text || el.placeholder || el.tag).join(', ')}
  `.trim()).join('\n\n');

  const pomMethods = pageObjects.map(pom =>
    `${pom.className}: ${pom.methods.map((m: any) => m.name).join(', ')}`
  ).join('\n');

  return `
Generate EXACTLY ${count} test scenarios for the following website. Create EXACTLY ${positiveCount} positive scenarios and EXACTLY ${negativeCount} negative scenarios.

Website URL: ${websiteUrl}
Website Pages:
${pagesSummary}

Available POM Methods:
${pomMethods}

Positive scenarios should cover:
- Happy path user workflows based on the actual website functionality
- Successful form submissions and data entry
- Navigation flows between pages

Negative scenarios should cover:
- Invalid form inputs and edge cases
- Missing required fields and validation errors
- Boundary testing and invalid data

IMPORTANT: Return EXACTLY ${count} scenarios total (${positiveCount} positive, ${negativeCount} negative).

Return as JSON:
{
  "scenarios": [
    {
      "name": "string",
      "description": "string",
      "type": "positive",
      "steps": [
        { "description": "string", "action": "string", "expectedResult": "string" }
      ]
    }
  ]
}
  `.trim();
};
