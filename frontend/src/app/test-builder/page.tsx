'use client';

import { useState, useEffect } from 'react';

const BACKEND = 'http://localhost:3001';

type Phase = 'form' | 'loading' | 'done' | 'error';

export default function TestBuilderPage() {
    const [url, setUrl] = useState('');
    const [intent, setIntent] = useState('');

    useEffect(() => {
        const savedUrl = localStorage.getItem('playwrightGenUrl');
        if (savedUrl) setUrl(savedUrl);
    }, []);
    const [phase, setPhase] = useState<Phase>('form');
    const [resultCode, setResultCode] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);

    interface ValidationResult {
        isValid: boolean;
        score: number;
        errors: string[];
        warnings: string[];
    }
    const [validation, setValidation] = useState<ValidationResult | null>(null);

    // Nya states för att köra testet
    const [isTesting, setIsTesting] = useState(false);
    const [testOutput, setTestOutput] = useState<{ success: boolean, text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Spara URL i localStorage
        if (url) localStorage.setItem('playwrightGenUrl', url);

        setPhase('loading');
        setErrorMsg('');
        setResultCode('');
        setCopySuccess(false);

        try {
            const queryUrl = `${BACKEND}/api/generate-test?url=${encodeURIComponent(url)}&intent=${encodeURIComponent(intent)}`;
            const response = await fetch(queryUrl);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Något gick fel.');
            }

            const data = await response.json();
            setResultCode(data.code);
            setValidation(data.validation);
            setPhase('done');
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || 'Ett okänt fel inträffade.');
            setPhase('error');
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(resultCode);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const handleReset = () => {
        setPhase('form');
        setResultCode('');
        setErrorMsg('');
        setUrl('');
        setIntent('');
        setCopySuccess(false);
        setTestOutput(null);
        setValidation(null);
    };

    const handleDownloadTest = () => {
        const blob = new Blob([resultCode], { type: 'text/typescript' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;

        // Skapa ett snyggt filnamn baserat på intent, t.ex. "testa-sok-funktionen.spec.ts"
        const safeIntentName = intent.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'test';
        a.download = `${safeIntentName}.spec.ts`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
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
                        <span>🎯</span> Single Test Builder
                    </div>
                    <h1 style={{ fontSize: '42px', fontWeight: 700, lineHeight: 1.2, marginBottom: '16px' }}>
                        Playwright Test{' '}
                        <span style={{ color: 'var(--accent)' }}>Builder</span>
                    </h1>
                    <p style={{ color: 'var(--text-dim)', fontSize: '17px', maxWidth: '500px', margin: '0 auto', marginBottom: '24px' }}>
                        Steg 2: Skapa ett enskilt test utifrån ett specifikt mål (intent).
                    </p>
                    <div style={{ display: 'inline-flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <a
                            href="/"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                background: 'var(--surface-2)', color: 'var(--text-dim)',
                                textDecoration: 'none', padding: '10px 20px', borderRadius: '8px',
                                fontWeight: 600, fontSize: '14px', border: '1px solid var(--border)',
                            }}
                        >
                            ← Full Generator
                        </a>
                        <a
                            href="/agent"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                background: 'var(--accent)', color: '#fff',
                                textDecoration: 'none', padding: '10px 20px', borderRadius: '8px',
                                fontWeight: 600, fontSize: '14px',
                            }}
                        >
                            🤖 Prova Test Agent →
                        </a>
                    </div>
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
                                    onChange={(e) => setUrl(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label>Vad vill du testa? (Intent)</label>
                                <input
                                    type="text"
                                    placeholder="T.ex. 'testa sökfunktionen' eller 'verifiera att mörkt tema fungerar'"
                                    value={intent}
                                    onChange={(e) => setIntent(e.target.value)}
                                    required
                                />
                                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                                    AI:n kommer skanna sidan och generera ETT enda fokuserat Playwright-test för detta syfte.
                                </div>
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
                                <span>🧠</span> Skanna & Generera Test
                            </button>
                        </form>
                    </div>
                )}

                {/* Laddar-fas */}
                {phase === 'loading' && (
                    <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            border: '3px solid var(--accent)',
                            borderTopColor: 'transparent',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 20px auto'
                        }}></div>
                        <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Skapar test...</h3>
                        <p style={{ color: 'var(--text-dim)', fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
                            Gör en headless rendering av <code style={{ color: 'var(--accent)' }}>{url}</code>, analyserar DOM-trädet och låter AI skriva testkoden.
                        </p>
                        <button
                            onClick={handleReset}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-dim)',
                                textDecoration: 'underline',
                                cursor: 'pointer',
                                marginTop: '20px',
                                fontSize: '13px'
                            }}
                        >
                            Avbryt
                        </button>
                    </div>
                )}

                {/* Klar-fas */}
                {phase === 'done' && (
                    <div className="card" style={{ animation: 'fadeIn 0.5s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span style={{ color: 'var(--green)' }}>✅</span> Test genererat
                                    {validation && (
                                        <span style={{
                                            marginLeft: '12px',
                                            fontSize: '12px',
                                            padding: '4px 8px',
                                            borderRadius: '12px',
                                            background: validation.score >= 80 ? 'rgba(34, 197, 94, 0.1)' : validation.score >= 50 ? 'rgba(234, 179, 8, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                                            color: validation.score >= 80 ? 'var(--green)' : validation.score >= 50 ? '#eab308' : 'var(--red)',
                                            fontWeight: 600,
                                            border: `1px solid ${validation.score >= 80 ? 'var(--green)' : validation.score >= 50 ? '#eab308' : 'var(--red)'}`
                                        }}>
                                            Quality Score: {validation.score}/100
                                        </span>
                                    )}
                                </h2>
                                <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                                    <div style={{ marginBottom: '4px' }}>
                                        För URL: <code style={{ color: 'var(--text)' }}>{url}</code>
                                    </div>
                                    <div>
                                        Intent: <span style={{ fontStyle: 'italic', color: 'var(--text)' }}>&quot;{intent}&quot;</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={handleDownloadTest}
                                    className="btn btn-primary"
                                >
                                    💾 Ladda ner test
                                </button>
                                <button
                                    onClick={handleCopy}
                                    className="btn"
                                    style={{ background: copySuccess ? 'var(--green)' : 'var(--surface-2)', color: copySuccess ? '#0d1a12' : 'var(--text)', border: '1px solid var(--border)' }}
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

                        <div style={{
                            background: '#0d1117',
                            padding: '24px',
                            borderRadius: '12px',
                            border: '1px solid var(--border)',
                            overflowX: 'auto',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '14px',
                            lineHeight: 1.6,
                            color: '#e2e8f0',
                            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)'
                        }}>
                            <code>
                                {resultCode.split('\n').map((line, i) => (
                                    <div key={i} style={{ whiteSpace: 'pre' }}>{line}</div>
                                ))}
                            </code>
                        </div>

                        {/* Valideringsmeddelanden */}
                        {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
                            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {validation.errors.length > 0 && (
                                    <div style={{ padding: '16px', background: 'rgba(248, 113, 113, 0.1)', border: '1px solid var(--red)', borderRadius: '8px' }}>
                                        <h4 style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>❌</span> Kritiska fel ({validation.errors.length})
                                        </h4>
                                        <ul style={{ margin: 0, paddingLeft: '24px', color: 'var(--text)', fontSize: '13px', lineHeight: 1.6 }}>
                                            {validation.errors.map((err, i) => <li key={i}>{err}</li>)}
                                        </ul>
                                    </div>
                                )}
                                {validation.warnings.length > 0 && (
                                    <div style={{ padding: '16px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #eab308', borderRadius: '8px' }}>
                                        <h4 style={{ color: '#eab308', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>⚠️</span> Varningar / Dåliga mönster ({validation.warnings.length})
                                        </h4>
                                        <ul style={{ margin: 0, paddingLeft: '24px', color: 'var(--text)', fontSize: '13px', lineHeight: 1.6 }}>
                                            {validation.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
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
                            width: '60px',
                            height: '60px',
                            background: 'rgba(248, 113, 113, 0.1)',
                            color: 'var(--red)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px',
                            margin: '0 auto 20px auto'
                        }}>
                            ❌
                        </div>
                        <h3 style={{ fontSize: '20px', color: 'var(--red)', marginBottom: '8px' }}>Fel vid generering</h3>
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
            `}} />
        </main>
    );
}
