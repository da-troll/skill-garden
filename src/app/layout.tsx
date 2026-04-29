import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skill Garden — Trollefsen household',
  description: 'Browsable explorer for Claude Skills across the household',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink font-mono antialiased">{children}</body>
    </html>
  );
}
