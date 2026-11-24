'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/comparisons', label: 'Comparisons' },
  { href: '/topics', label: 'Topics (Gate 0)' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/settings', label: 'Settings' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="border-b border-[#d5dbd1] bg-[#ffffff] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 min-h-[44px]">
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-[10px] bg-[#0e0f0c] text-[#9fe870] flex items-center justify-center font-black text-xs tracking-tight"
            >
              PS
            </span>
            <span className="text-[#0e0f0c] text-lg font-black tracking-tight">
              PhoneStudio
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3.5 py-2.5 min-h-[44px] inline-flex items-center rounded-full text-sm transition-colors ${
                    active
                      ? 'bg-[#0e0f0c] text-[#ffffff] font-bold'
                      : 'text-[#454745] hover:bg-[#e8ebe6] hover:text-[#0e0f0c] font-semibold'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/comparisons/new"
            className="px-4 sm:px-5 min-h-[44px] inline-flex items-center whitespace-nowrap rounded-full bg-[#9fe870] hover:bg-[#cdffad] active:bg-[#b8e69a] text-[#0e0f0c] font-bold text-sm transition-colors"
          >
            <span className="sm:hidden">+ New</span>
            <span className="hidden sm:inline">+ New Video</span>
          </Link>

          <button
            ref={triggerRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="md:hidden px-3.5 min-h-[44px] inline-flex items-center rounded-full border border-[#0e0f0c] bg-[#ffffff] hover:bg-[#f6f7f5] text-[#0e0f0c] font-bold text-xs"
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav-menu"
          aria-label="Mobile navigation"
          className="md:hidden border-t border-[#d5dbd1] bg-[#ffffff] px-4 py-3 space-y-1"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block px-4 py-3 min-h-[44px] rounded-[12px] text-sm transition-colors ${
                  active
                    ? 'bg-[#0e0f0c] text-[#ffffff] font-bold'
                    : 'text-[#0e0f0c] hover:bg-[#e8ebe6] font-semibold'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
