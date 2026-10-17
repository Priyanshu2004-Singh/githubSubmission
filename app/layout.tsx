import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0e17] text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
