'use client';

// =============================================================================
// agent/page.tsx — UI för TestAgent (agentic test generation)
//
// Agenten styr en riktig webbläsare steg-för-steg och bygger upp
// ett Playwright-test baserat på användarens intent.
//
// Endpoint: GET /api/generate-agentic?url=...&intent=...
// =============================================================================

import { useState, useEffect, useRef } from 'react';

const BACKEND = 'http://localhost:3001';

type Phase = 'form' | 'loading' | 'done' | 'error';

interface ValidationResult {
    isValid: boolean;
    score: number;
    errors: string[];
    warnings: string[];
}

interface AgentResult {
    success: boolean;
    url: string;
    intent: string;
    code: string;
    validation: ValidationResult;
    iterations: number;
}

const LOADING_MESSAGES = [
    'Startar webbläsaren...',
    'Skannar sidan...',
    'AI analyserar element...',
    'Väljer nästa steg...',
    'Kör action i webbläsaren...',
    'Verifierar resultat...',
    'Bygger upp testkoden...',
    'Kontrollerar om målet är uppnått...',
];

export default function AgentPage() {
    const [url, setUrl] = useState('');
    const [intent, setIntent] = useState('');
    const [phase, setPhase] = useState<Phase>('form');
    const [result, setResult] = useState<AgentResult | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const savedUrl = localStorage.getItem('playwrightGenUrl');
        if (savedUrl) setUrl(savedUrl);
    }, []);

    useEffect(() => {
        if (phase === 'loading') {
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
            msgTimerRef.current = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 3000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
            if (msgTimerRef.current) clearInterval(msgTimerRef.current);
            setElapsed(0);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (msgTimerRef.current) clearInterval(msgTimerRef.current);
        };
    }, [phase]);

    const formatElapsed = (s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (url) localStorage.setItem('playwrightGenUrl', url);

        setPhase('loading');
        setResult(null);
        setErrorMsg('');
        setCopySuccess(false);
        setLoadingMsgIdx(0);

        try {
            const queryUrl = `${BACKEND}/api/generate-agentic?url=${encodeURIComponent(url)}&intent=${encodeURIComponent(intent)}`;
            const response = await fetch(queryUrl);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Något gick fel.');
            }

            const data: AgentResult = await response.json();
            setResult(data);
            setPhase('done');
        } catch (err: any) {
            setErrorMsg(err.message || 'Ett okänt fel inträffade.');
            setPhase('error');
        }
    };

    const handleCopy = async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result.code);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleDownload = () => {
        if (!result) return;
        const blob = new Blob([result.code], { type: 'text/typescript' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        const safeName = intent
            .replace(/[^a-z0-9]/gi, '-')
            .toLowerCase()
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'agent-test';
        a.download = `${safeName}.spec.ts`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
    };

    const handleReset = () => {
        setPhase('form');
        setResult(null);
        setErrorMsg('');
        setUrl('');
        setIntent('');
        setCopySuccess(false);
    };

    return (
        <main style={{ padding: '60px 0 80px' }}>
            <div className="container">

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '10px',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: '100px', padding: '6px 16px', marginBottom: '24px',
                        fontSize: '13px', color: 'var(--accent)', fontWeight: 600,
                    }}>
                        <span>🤖</span> Agentic Test Generator
                    </div>
                    <h1 style={{ fontSize: '42px', fontWeight: 700, lineHeight: 1.2, marginBottom: '16px' }}>
                        Test{' '}
                        <span style={{ color: 'var(--accent)' }}>Agent</span>
                    </h1>
                    <p style={{ color: 'var(--text-dim)', fontSize: '17px', maxWidth: '520px', margin: '0 auto', marginBottom: '24px' }}>
                        Agenten styr en riktig webbläsare steg-för-steg och bygger upp ett komplett Playwright-test baserat på ditt mål.
                    </p>
                    <a
                        href="/test-builder"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            background: 'var(--surface-2)', color: 'var(--text-dim)',
                            textDecoration: 'none', padding: '10px 20px', borderRadius: '8px',
                            fontWeight: 600, fontSize: '14px', border: '1px solid var(--border)',
                        }}
                    >
                        ← Test Builder (enkel)
                    </a>
                </div>

                {/* Formulär-fas */}
                {phase === 'form' && (
                    <div className="card">
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Målsida (URL)</label>
                                <input
                                    type="url"
                                    placeholder="https://exempel.se"
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Vad vill du testa? (Intent)</label>
                                <input
                                    type="text"
                                    placeholder="T.ex. 'logga in med admin och navigera till dashboard'"
                                    value={intent}
                                    onChange={e => setIntent(e.target.value)}
                                    required
                                />
                                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                                    Agenten styr webbläsaren steg-för-steg och kan ta upp till 10 minuter.
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                            >
                                <span>🤖</span> Starta Agent
                            </button>
                        </form>

                        <div style={{
                            marginTop: '24px', padding: '16px',
                            background: 'var(--surface-2)', borderRadius: '8px',
                            fontSize: '13px', color: 'var(--text-dim)',
                        }}>
                            <strong style={{ color: 'var(--text)' }}>💡 Tips:</strong> Var specifik med ditt mål.
                            T.ex. <em>&quot;logga in med username Admin och password admin123, navigera till PIM och verifiera att Employee List visas&quot;</em>
                        </div>
                    </div>
                )}

                {/* Laddar-fas */}
                {phase === 'loading' && (
                    <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <div style={{
                            width: '56px', height: '56px', borderRadius: '50%',
                            border: '3px solid var(--accent)', borderTopColor: 'transparent',
                            animation: 'spin 1s linear infinite', margin: '0 auto 28px auto',
                        }} />
                        <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Agent jobbar...</h3>
                        <p style={{ color: 'var(--accent)', fontSize: '14px', fontWeight: 600, marginBottom: '6px', minHeight: '22px' }}>
                            {LOADING_MESSAGES[loadingMsgIdx]}
                        </p>
                        <p style={{ color: 'var(--text-dim)', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', marginBottom: '28px' }}>
                            {formatElapsed(elapsed)}
                        </p>

                        <div style={{
                            background: 'var(--surface-2)', borderRadius: '8px',
                            padding: '14px 20px', fontSize: '13px', color: 'var(--text-dim)',
                            maxWidth: '420px', margin: '0 auto 28px auto', textAlign: 'left',
                        }}>
                            <div style={{ marginBottom: '6px' }}>
                                <span style={{ color: 'var(--text-dim)' }}>URL: </span>
                                <code style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{url}</code>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-dim)' }}>Intent: </span>
                                <span style={{ color: 'var(--text)', fontStyle: 'italic' }}>&quot;{intent}&quot;</span>
                            </div>
                        </div>

                        <button
                            onClick={handleReset}
                            style={{
                                background: 'none', border: 'none', color: 'var(--text-dim)',
                                textDecoration: 'underline', cursor: 'pointer', fontSize: '13px',
                            }}
                        >
                            Avbryt
                        </button>
                    </div>
                )}

                {/* Klar-fas */}
                {phase === 'done' && result && (
                    <div className="card" style={{ animation: 'fadeIn 0.5s ease' }}>

                        {/* Rubrik + knappar */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'flex-start', marginBottom: '20px',
                            flexWrap: 'wrap', gap: '12px',
                        }}>
                            <div>
                                <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ color: result.success ? 'var(--green)' : 'var(--yellow)' }}>
                                        {result.success ? '✅' : '⚠️'}
                                    </span>
                                    {result.success ? 'Agent klar' : 'Agent klar (ofullständigt)'}
                                    {result.validation && (
                                        <span style={{
                                            fontSize: '12px', padding: '4px 8px', borderRadius: '12px', fontWeight: 600,
                                            background: result.validation.score >= 80
                                                ? 'rgba(52,211,153,0.1)'
                                                : result.validation.score >= 50
                                                    ? 'rgba(251,191,36,0.1)'
                                                    : 'rgba(248,113,113,0.1)',
                                            color: result.validation.score >= 80
                                                ? 'var(--green)'
                                                : result.validation.score >= 50
                                                    ? 'var(--yellow)'
                                                    : 'var(--red)',
                                            border: `1px solid ${result.validation.score >= 80
                                                ? 'var(--green)'
                                                : result.validation.score >= 50
                                                    ? 'var(--yellow)'
                                                    : 'var(--red)'}`,
                                        }}>
                                            Quality: {result.validation.score}/100
                                        </span>
                                    )}
                                </h2>
                                <div style={{ fontSize: '13px', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div>URL: <code style={{ color: 'var(--text)' }}>{result.url}</code></div>
                                    <div>Intent: <span style={{ fontStyle: 'italic', color: 'var(--text)' }}>&quot;{result.intent}&quot;</span></div>
                                    <div>
                                        Steg utförda:{' '}
                                        <strong style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                                            {result.iterations}
                                        </strong>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button onClick={handleDownload} className="btn btn-primary">
                                    💾 Ladda ner
                                </button>
                                <button
                                    onClick={handleCopy}
                                    className="btn"
                                    style={{
                                        background: copySuccess ? 'var(--green)' : 'var(--surface-2)',
                                        color: copySuccess ? '#0d1a12' : 'var(--text)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    {copySuccess ? 'Kopierad! ✓' : 'Kopiera kod'}
                                </button>
                                <button
                                    onClick={handleReset}
                                    className="btn"
                                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                >
                                    Nytt test
                                </button>
                            </div>
                        </div>

                        {/* Kodblock */}
                        <div style={{
                            background: '#0d1117', padding: '24px', borderRadius: '12px',
                            border: '1px solid var(--border)', overflowX: 'auto',
                            fontFamily: 'JetBrains Mono, monospace', fontSize: '14px',
                            lineHeight: 1.6, color: '#e2e8f0',
                            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)',
                        }}>
                            <code>
                                {result.code.split('\n').map((line, i) => (
                                    <div key={i} style={{ whiteSpace: 'pre' }}>{line}</div>
                                ))}
                            </code>
                        </div>

                        {/* Valideringsmeddelanden */}
                        {result.validation && (result.validation.errors.length > 0 || result.validation.warnings.length > 0) && (
                            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {result.validation.errors.length > 0 && (
                                    <div style={{
                                        padding: '16px', background: 'rgba(248,113,113,0.1)',
                                        border: '1px solid var(--red)', borderRadius: '8px',
                                    }}>
                                        <h4 style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '8px' }}>
                                            ❌ Kritiska fel ({result.validation.errors.length})
                                        </h4>
                                        <ul style={{ margin: 0, paddingLeft: '24px', color: 'var(--text)', fontSize: '13px', lineHeight: 1.6 }}>
                                            {result.validation.errors.map((err, i) => <li key={i}>{err}</li>)}
                                        </ul>
                                    </div>
                                )}
                                {result.validation.warnings.length > 0 && (
                                    <div style={{
                                        padding: '16px', background: 'rgba(251,191,36,0.1)',
                                        border: '1px solid var(--yellow)', borderRadius: '8px',
                                    }}>
                                        <h4 style={{ color: 'var(--yellow)', fontSize: '14px', marginBottom: '8px' }}>
                                            ⚠️ Varningar ({result.validation.warnings.length})
                                        </h4>
                                        <ul style={{ margin: 0, paddingLeft: '24px', color: 'var(--text)', fontSize: '13px', lineHeight: 1.6 }}>
                                            {result.validation.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Fel-fas */}
                {phase === 'error' && (
                    <div className="card" style={{ textAlign: 'center', padding: '60px 20px', borderColor: 'var(--red)' }}>
                        <div style={{
                            width: '60px', height: '60px', background: 'rgba(248,113,113,0.1)',
                            color: 'var(--red)', borderRadius: '50%', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: '24px', margin: '0 auto 20px auto',
                        }}>
                            ❌
                        </div>
                        <h3 style={{ fontSize: '20px', color: 'var(--red)', marginBottom: '8px' }}>
                            Agenten misslyckades
                        </h3>
                        <p style={{ color: 'var(--text-dim)', fontSize: '15px', maxWidth: '400px', margin: '0 auto 24px auto' }}>
                            {errorMsg}
                        </p>
                        <button
                            onClick={handleReset}
                            className="btn"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        >
                            Försök igen
                        </button>
                    </div>
                )}

            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                `
            }} />
        </main>
    );
}
