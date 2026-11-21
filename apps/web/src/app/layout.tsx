import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Phone Comparison Studio',
  description: 'Automated YouTube phone comparison video studio',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0c10] text-slate-100 antialiased">
        <header className="border-b border-[#1f2430] bg-[#12151c]/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-xl">📱</span>
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  Phone Studio
                </span>
              </Link>
              <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
                <Link href="/" className="hover:text-slate-100 transition-colors">
                  Overview
                </Link>
                <Link href="/topics" className="hover:text-slate-100 transition-colors flex items-center gap-1.5">
                  <span>Topics</span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-mono">
                    Gate 0
                  </span>
                </Link>
                <Link href="/jobs" className="hover:text-slate-100 transition-colors">
                  Jobs Queue
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Worker Active</span>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
