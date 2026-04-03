# Genererade Playwright-tester

**Webbsida:** https://www.youtube.com  
**Genererad:** 2026-03-13 00:12:19

## Page Object Models (1 st)
- `YouTubePage.po.ts` — 1 metoder

## Testscenarier (5 st)
- ✅ Positiva: 3 scenarier
- ❌ Negativa: 2 scenarier

- **Search for a video** (positive): 2 steg
- **Watch a video** (positive): 2 steg
- **Log in to YouTube** (positive): 2 steg
- **Invalid login credentials** (negative): 3 steg
- **Missing required fields** (negative): 3 steg

## Kom igång

```bash
# 1. Installera beroenden
npm install
npx playwright install chromium

# 2. Kör alla tester
npx playwright test

# 3. Visa HTML-rapport
npx playwright show-report
```
