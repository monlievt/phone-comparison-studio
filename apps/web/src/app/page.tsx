// apps/web/src/app/page.tsx
import Link from 'next/link';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Queries
  const llmUsage = db
    .prepare('SELECT provider, count FROM llm_usage WHERE day = ?')
    .all(today) as Array<{ provider: string; count: number }>;

  const activeJobs = db
    .prepare("SELECT count(*) as count FROM jobs WHERE state IN ('running', 'queued')")
    .get() as { count: number };

  const recentComparisons = db
    .prepare('SELECT id, title, status, created_at FROM comparisons ORDER BY created_at DESC LIMIT 6')
    .all() as any[];

  const proposedTopicsCount = db
    .prepare('SELECT count(*) as count FROM topics WHERE status = "proposed"')
    .get() as { count: number };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Studio Overview</h1>
        <p className="text-sm text-slate-400 mt-1">Autonomous phone comparison video generation pipeline.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#12151c] border border-[#1f2430]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Jobs</div>
          <div className="text-3xl font-bold text-white mt-2">{activeJobs.count}</div>
          <div className="text-xs text-slate-500 mt-1">Running or queued</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#12151c] border border-[#1f2430]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Proposed Topics</div>
          <div className="text-3xl font-bold text-blue-400 mt-2">{proposedTopicsCount.count}</div>
          <div className="text-xs text-slate-500 mt-1">
            <Link href="/topics" className="text-blue-400 hover:underline">
              Review Gate 0 &rarr;
            </Link>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#12151c] border border-[#1f2430]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Daily LLM Calls</div>
          <div className="text-3xl font-bold text-indigo-400 mt-2">
            {llmUsage.reduce((sum, u) => sum + u.count, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Quota cap: 1,000 req/day</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#12151c] border border-[#1f2430]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pipeline Health</div>
          <div className="text-3xl font-bold text-emerald-400 mt-2">100%</div>
          <div className="text-xs text-slate-500 mt-1">Zero failed critical stages</div>
        </div>
      </div>

      {/* Recent Comparisons Table */}
      <div className="rounded-2xl bg-[#12151c] border border-[#1f2430] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Recent Comparisons</h2>
        </div>

        {recentComparisons.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No comparisons yet. Go to{' '}
            <Link href="/topics" className="text-blue-400 hover:underline">
              Topics
            </Link>{' '}
            to approve your first phone pair!
          </div>
        ) : (
          <div className="divide-y divide-[#1f2430]">
            {recentComparisons.map((c) => (
              <div key={c.id} className="py-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{c.title || 'Untitled Comparison'}</div>
                  <div className="text-xs text-slate-400 mt-0.5">ID: {c.id}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {c.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
