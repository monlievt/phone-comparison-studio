// apps/web/src/app/login/page.tsx
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
        throw new Error('Incorrect password');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm p-8 rounded-2xl bg-[#12151c] border border-[#1f2430] space-y-6">
        <div className="text-center">
          <div className="text-3xl mb-2">📱</div>
          <h1 className="text-xl font-bold text-white">Phone Studio Login</h1>
          <p className="text-xs text-slate-400 mt-1">Enter operator password configured in .env</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="Operator Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#181d26] border border-[#1f2430] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white transition-colors disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In to Studio'}
          </button>
        </form>
      </div>
    </div>
  );
}
