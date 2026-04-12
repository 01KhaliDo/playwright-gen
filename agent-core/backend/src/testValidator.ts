export interface ValidationResult {
    isValid: boolean;
    score: number;
    errors: string[];
    warnings: string[];
}

export class TestValidatorService {
    /**
     * Validerar den genererade Playwright-koden statiskt.
     * Kontrollerar efter grundstruktur och kända anti-mönster.
     */
    static validate(code: string): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let score = 100;

        // 1. Kritiska strukturella fel (Errors)
        if (!code.includes('import { test') || !code.includes('expect } from')) {
            errors.push('Saknar giltig import av test och expect från @playwright/test.');
            score -= 30;
        }

        if (!code.includes('test(')) {
            errors.push('Saknar test()-deklarationen.');
            score -= 30;
        }

        if (!code.includes('page.goto(')) {
            errors.push('Saknar page.goto() för att navigera till start-URL:en.');
            score -= 20;
        }

        if (!code.includes('expect(')) {
            errors.push('Saknar assertions (expect). Ett test måste verifiera något.');
            score -= 40;
        }

        // 2. Varningar och dåliga mönster (Warnings)
        if (code.includes('page.waitForTimeout(')) {
            warnings.push('Använder page.waitForTimeout(). Detta är ett anti-mönster – använd assertions eller waitFor-events istället.');
            score -= 10;
        }

        if (code.includes('.toBeChecked()')) {
            // Kolla om texten runt toBeChecked indikerar en vanlig knapp
            if (code.match(/getByRole\(['"]button['"]\).*?\.toBeChecked\(\)/) || code.includes('button')) {
                warnings.push('Verifiera att .toBeChecked() används på checkboxar/radios och inte på vanliga knappar (buttons).');
                score -= 15;
            }
        }

        if (code.match(/\bhref\(\)/)) {
            warnings.push('Använder den ogiltiga funktionen .href(). För att hämta href använd .getAttribute("href").');
            score -= 15;
        }

        // Räkna hur många TODO:s AI:n lämnade (element som inte hittades i skanningsresultaten)
        const missingLocatorMatches = code.match(/\/\/ TODO: element not found in scan/g);
        if (missingLocatorMatches) {
            const count = missingLocatorMatches.length;
            warnings.push(
                `AI:n hittade inte ${count} element i skannade HTML:en och lämnade TODO-kommentar${count > 1 ? 'er' : ''} i koden. ` +
                `Dessa locatorer gäller förmodligen sidor eller element som inte var synliga på start-URL:en. ` +
                `Kontrollera och ersätt manuellt.`
            );
            score -= count * 15;
        }

        if (code.match(/expect\(.*?\)\.toBeVisible\(\)/) && (code.match(/click\(\)/) || code.match(/goto\(/))) {
            // Om testet bara klickar på något och sen kollar om samma sak är visible.
            // Lite grov regel, men lägger en varning som hints.
            // (Detta kan vara legitimt ibland, så vi gör poängavdraget litet).
        }

        // Begränsa poängen till mellan 0 och 100
        score = Math.max(0, Math.min(100, score));

        // Testet är giltigt om vi har ett score över t.ex. 50 och inga kritiska errors.
        const isValid = errors.length === 0;

        return {
            isValid,
            score,
            errors,
            warnings
        };
    }
}
