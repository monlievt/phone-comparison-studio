import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import GlobalPipelineBanner from '@/components/GlobalPipelineBanner';

export const metadata: Metadata = {
  title: 'PhoneStudio: Local Video Production Deck',
  description: 'Local smartphone comparison video studio with deterministic verdicts and Remotion rendering',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#e8ebe6] text-[#0e0f0c] antialiased flex flex-col justify-between">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-full focus:bg-[#0e0f0c] focus:text-white focus:text-xs focus:font-bold"
        >
          Skip to main content
        </a>

        <Navbar />
        <GlobalPipelineBanner />

        <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1 w-full">
          {children}
        </main>

        <footer className="bg-[#0e0f0c] text-[#e8ebe6] border-t border-[#1a1b18] mt-12 py-8 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">PhoneStudio</span>
              <span className="text-[#b8bcb4]">Local smartphone comparison pipeline</span>
            </div>
            <div className="text-[#b8bcb4]">
              Local SQLite queue · Deterministic verdicts · Verified numbers only
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
