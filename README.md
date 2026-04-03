# playwright-gen

AI-driven Playwright-testgenerator. Anger en URL → AI crawlar sidan → genererar TypeScript-tester.

## Starta projektet

Du behöver två terminaler:

### Terminal 1 — Backend (port 3001)
```bash
cd backend
npm install
npx playwright install chromium
cp .env.example .env    # Editera vid behov
npm run dev
```

### Terminal 2 — Frontend (port 3000)
```bash
cd frontend
npm install
npm run dev
```

Öppna sedan **http://localhost:3000** i webbläsaren.

## Krav
- **Node.js** 18+
- **Ollama** installerat och igång: `ollama serve`
- Modellen nedladdad: `ollama pull llama3`

## Projektstruktur

```
playwright-gen/
├── backend/              ← Node.js + Express (port 3001)
│   └── src/
│       ├── server.ts     ← HTTP-server, SSE-progress, ZIP-nedladdning
│       ├── crawler.ts    ← Playwright web crawler
│       ├── ai.ts         ← Ollama AI-anrop (två steg: POM + scenarier)
│       ├── prompts.ts    ← AI-prompter (lätt att justera)
│       ├── testGenerator.ts ← Skapar .ts-filer på disk
│       ├── excel.ts      ← Placeholder för framtida Excel-integration
│       ├── types.ts      ← Gemensamma TypeScript-typer
│       └── logger.ts     ← Winston-logger
│
└── frontend/             ← Next.js (port 3000)
    └── src/app/
        ├── page.tsx      ← Huvud-UI (formulär, progress, nedladdning)
        ├── layout.tsx    ← Root layout
        └── globals.css   ← Stilmall (mörkt tema)
```
