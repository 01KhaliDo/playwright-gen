import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Playwright Test Generator',
    description: 'Generera AI-drivna Playwright-tester automatiskt för vilken webbsida som helst',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="sv">
            <body>{children}</body>
        </html>
    );
}
