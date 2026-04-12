'use client';

// =============================================================================
// page.tsx — Huvud-UI för Playwright Test Generator
//
// Tre faser:
//   1. Formulär  — Användaren anger URL + antal tester
//   2. Progress  — SSE-ström visar live-status (Crawler → AI → Filer)
//   3. Nedladdning — Ladda ner ZIP med genererade testfiler
// =============================================================================

import { useState, useRef } from 'react';

const BACKEND = 'http://localhost:3001';

// Typen för varje progress-event från backend (matchar backend/src/types.ts)
type Step = 'crawler' | 'ai-pom' | 'ai-scenarios' | 'files' | 'done' | 'error';

interface ProgressEvent {
    step: Step;
    message: string;
    detail?: string;
    runId?: string;
    error?: string;
}

// Statisk definition av alla steg som visas i UI:t
const STEPS: { id: Step; label: string; icon: string }[] = [
    { id: 'crawler', label: 'Web Crawler', icon: '🔍' },
    { id: 'ai-pom', label: 'Page Objects', icon: '🤖' },
    { id: 'ai-scenarios', label: 'Testscenarier', icon: '📝' },
    { id: 'files', label: 'Filgenerering', icon: '📁' },
    { id: 'done', label: 'Klar', icon: '✅' },
];

type Phase = 'form' | 'loading' | 'done' | 'error';

export default function HomePage() {
    const [url, setUrl] = useState('');
    const [count, setCount] = useState(5);
    const [phase, setPhase] = useState<Phase>('form');
    const [events, setEvents] = useState<ProgressEvent[]>([]);
    const [runId, setRunId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const eventSourceRef = useRef<EventSource | null>(null);

    // Returnerar vilket steg som är aktivt baserat på senaste event
    const activeStep = events.length > 0 ? events[events.length - 1].step : null;

    const getStepStatus = (stepId: Step): 'pending' | 'active' | 'done' | 'error' => {
        if (phase === 'error' && stepId === activeStep) return 'error';
        const stepOrder = STEPS.map(s => s.id);
        const activeIdx = activeStep ? stepOrder.indexOf(activeStep) : -1;
        const stepIdx = stepOrder.indexOf(stepId);

        if (stepIdx < activeIdx) return 'done';
        if (stepIdx === activeIdx) return phase === 'done' ? 'done' : 'active';
        return 'pending';
    };

    // Hämtar senaste detalj för ett steg
    const getStepDetail = (stepId: Step): string => {
        const stepEvents = events.filter(e => e.step === stepId);
        const last = stepEvents[stepEvents.length - 1];
        return last?.detail || last?.message || '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;

        setPhase('loading');
        setEvents([]);
        setRunId(null);
        setErrorMsg('');

        // Öppna SSE-anslutning till backend
        // BUGGFIX: Lägg till _t=timestamp så webbläsaren aldrig cachar SSE-requests
        const params = new URLSearchParams({ url: url.trim(), count: count.toString(), _t: Date.now().toString() });
        const es = new EventSource(`${BACKEND}/api/generate?${params}`);
        eventSourceRef.current = es;

        es.onmessage = (e) => {
            const event: ProgressEvent = JSON.parse(e.data);
            setEvents(prev => [...prev, event]);

            if (event.step === 'done') {
                setRunId(event.runId || null);
                setPhase('done');
                es.close();
            }
            if (event.step === 'error') {
                setErrorMsg(event.error || 'Okänt fel');
                setPhase('error');
                es.close();
            }
        };

        es.onerror = () => {
            setErrorMsg('Kunde inte ansluta till backend. Är servern igång på port 3001?');
            setPhase('error');
            es.close();
        };
    };

    const handleReset = () => {
        eventSourceRef.current?.close();
        setPhase('form');
        setEvents([]);
        setRunId(null);
        setErrorMsg('');
        setUrl(''); // BUGGFIX: Rensa URL-fältet så gammal URL inte skickas igen av misstag
    };

    return (
        <main style={{ padding: '60px 0 80px' }}>
            <div className="container">

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '100px',
                        padding: '6px 16px',
                        marginBottom: '24px',
                        fontSize: '13px',
                        color: 'var(--accent)',
                        fontWeight: 600,
                    }}>
                        <span>⚡</span> AI-driven testgenerering
                    </div>
                    <h1 style={{ fontSize: '42px', fontWeight: 700, lineHeight: 1.2, marginBottom: '16px' }}>
                        Playwright Test{' '}
                        <span style={{ color: 'var(--accent)' }}>Generator</span>
                    </h1>
                    <p style={{ color: 'var(--text-dim)', fontSize: '17px', maxWidth: '500px', margin: '0 auto', marginBottom: '24px' }}>
                        Ange en URL — AI:n crawlar sidan och genererar kompletta Playwright-tester åt dig.
                    </p>
                    <div style={{ display: 'inline-flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <a
                            href="/test-builder"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                background: 'var(--surface-2)', color: 'var(--text-dim)',
                                textDecoration: 'none', padding: '10px 20px', borderRadius: '8px',
                                fontWeight: 600, fontSize: '14px', border: '1px solid var(--border)',
                            }}
                        >
                            Test Builder (enkel) →
                        </a>
                        <a
                            href="/agent"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                background: 'var(--accent)', color: '#fff',
                                textDecoration: 'none', padding: '10px 20px', borderRadius: '8px',
                                fontWeight: 600, fontSize: '15px',
                            }}
                        >
                            🤖 Test Agent →
                        </a>
                    </div>
                </div>

                {/* Formulär-fas */}
                {phase === 'form' && (
                    <div className="card">
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Webbsidans URL</label>
                                <input
                                    type="url"
                                    placeholder="https://example.com"
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Antal testscenarier</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={count}
                                    onChange={e => setCount(parseInt(e.target.value) || 5)}
                                />
                                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                                    {Math.ceil(count * 0.6)} positiva + {count - Math.ceil(count * 0.6)} negativa scenarier
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
                                <span>🚀</span> Generera tester
                            </button>
                        </form>

                        {/* Tips */}
                        <div style={{
                            marginTop: '24px',
                            padding: '16px',
                            background: 'var(--surface-2)',
                            borderRadius: '8px',
                            fontSize: '13px',
                            color: 'var(--text-dim)',
                        }}>
                            <strong style={{ color: 'var(--text)' }}>💡 Tips:</strong> Generering tar 1–3 minuter beroende på webbsidans storlek och Ollama-modellens hastighet.
                            Se till att <code style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent)' }}>ollama serve</code> körs lokalt.
                        </div>
                    </div >
                )
                }

                {/* Progress-fas */}
                {
                    (phase === 'loading' || phase === 'done' || phase === 'error') && (
                        <div className="card">
                            {/* URL-info */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '12px 16px',
                                background: 'var(--surface-2)',
                                borderRadius: '8px',
                                marginBottom: '24px',
                                fontSize: '14px',
                                overflow: 'hidden',
                            }}>
                                <span>🌐</span>
                                <code style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {url}
                                </code>
                            </div>

                            {/* Progress-steg */}
                            <div className="steps" style={{ marginBottom: '24px' }}>
                                {STEPS.map(step => {
                                    const status = getStepStatus(step.id);
                                    const detail = getStepDetail(step.id);
                                    return (
                                        <div key={step.id} className={`step ${status}`}>
                                            <div className="step-icon">
                                                {status === 'done' ? '✓' : status === 'error' ? '✕' : step.icon}
                                            </div>
                                            <div className="step-content">
                                                <div className="step-title">{step.label}</div>
                                                {detail && <div className="step-detail">{detail}</div>}
                                            </div>
                                            {status === 'active' && (
                                                <div style={{
                                                    width: '16px',
                                                    height: '16px',
                                                    borderRadius: '50%',
                                                    border: '2px solid var(--accent)',
                                                    borderTopColor: 'transparent',
                                                    animation: 'spin 0.8s linear infinite',
                                                    flexShrink: 0,
                                                }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Nedladdning (visas när done) */}
                            {phase === 'done' && runId && (
                                <div>
                                    <div style={{
                                        textAlign: 'center',
                                        marginBottom: '16px',
                                        color: 'var(--green)',
                                        fontSize: '15px',
                                        fontWeight: 600,
                                    }}>
                                        ✅ Testfiler redo!
                                    </div>
                                    <a
                                        href={`${BACKEND}/api/download/${runId}`}
                                        className="btn btn-download"
                                        download
                                    >
                                        <span>📥</span> Ladda ner ZIP-fil
                                    </a>
                                </div>
                            )}

                            {/* Felmeddelande */}
                            {phase === 'error' && (
                                <div style={{
                                    padding: '16px',
                                    background: 'rgba(248,113,113,0.08)',
                                    border: '1px solid var(--red)',
                                    borderRadius: '8px',
                                    color: 'var(--red)',
                                    fontSize: '14px',
                                    marginBottom: '16px',
                                }}>
                                    <strong>❌ Fel:</strong> {errorMsg}
                                </div>
                            )}

                            {/* Tillbaka/Ny generering */}
                            {(phase === 'done' || phase === 'error') && (
                                <button
                                    onClick={handleReset}
                                    className="btn btn-primary"
                                    style={{ width: '100%', justifyContent: 'center', marginTop: '12px', background: 'var(--surface-2)', color: 'var(--text-dim)' }}
                                >
                                    ← Generera för en annan sida
                                </button>
                            )}
                        </div>
                    )
                }

                {/* Instruktioner hur man kör testerna */}
                <div className="card" style={{ marginTop: '24px', fontSize: '14px', color: 'var(--text-dim)' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
                        📋 Så här kör du de genererade testerna
                    </h3>
                    <ol style={{ paddingLeft: '20px', lineHeight: 2 }}>
                        <li>Packa upp ZIP-filen i en mapp</li>
                        <li>Kör <code style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: '4px' }}>npm install</code> i mappen</li>
                        <li>Kör <code style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: '4px' }}>npx playwright install chromium</code></li>
                        <li>Kör <code style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: '4px' }}>npx playwright test</code></li>
                    </ol>
                </div>

            </div >

            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </main >
    );
}
