import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Agent Core',
    description: 'AI-driven Playwright Test Agent',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="sv">
            <body>{children}</body>
        </html>
    );
}
