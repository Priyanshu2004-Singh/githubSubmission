import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Newtonite OpsPulse | Mission-Critical Operations Platform',
  description: 'Enterprise operations coordination platform with real-time SSE sync, optimistic concurrency control, atomic work item claiming, and audited workflows.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
