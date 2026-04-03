# Genererade Playwright-tester

**Webbsida:** https://www.youtube.com/  
**Genererad:** 2026-03-13 00:00:25

## Page Object Models (4 st)
- `YouTubePage.po.ts` — 4 metoder
- `ShortsPage.po.ts` — 2 metoder
- `SubscriptionsPage.po.ts` — 2 metoder
- `YourPage.po.ts` — 2 metoder

## Testscenarier (5 st)
- ✅ Positiva: 3 scenarier
- ❌ Negativa: 2 scenarier

- **Search for a video and navigate to its page** (positive): 3 steg
- **Login and navigate to subscriptions page** (positive): 5 steg
- **Navigate to your page and verify the videos are displayed** (positive): 3 steg
- **Search for a video with invalid input** (negative): 2 steg
- **Try to login with invalid credentials** (negative): 3 steg

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
