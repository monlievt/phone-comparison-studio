'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data.error === 'string' ? data.error : data.error?.message;
        throw new Error(msg || 'Incorrect operator password');
      }

      const params = new URLSearchParams(window.location.search);
      const nextPath = params.get('next');
      router.push(nextPath && nextPath.startsWith('/') ? nextPath : '/');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[65vh] flex items-center justify-center">
      <div className="w-full max-w-sm p-6 sm:p-8 rounded-[24px] bg-[#ffffff] border border-[#d5dbd1] space-y-6">
        <div className="space-y-1 border-b border-[#e8ebe6] pb-4">
          <h1 className="text-2xl font-black text-[#0e0f0c] tracking-tight">Operator Login</h1>
          <p className="text-xs text-[#595c58]">
            Enter the password configured in APP_PASSWORD inside your local .env file.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3.5 rounded-[12px] bg-[#320707] text-[#ffd11a] text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="studio-password" className="block text-xs font-bold text-[#454745]">
              Studio password
            </label>
            <input
              id="studio-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
              className="w-full px-4 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58] text-sm font-semibold text-[#0e0f0c]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
