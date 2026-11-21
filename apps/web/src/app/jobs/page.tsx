// apps/web/src/app/jobs/page.tsx
'use client';

import { useEffect, useState } from 'react';

interface Job {
  id: string;
  type: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'blocked';
  attempt: number;
  progress: number;
  error?: string;
  created_at: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      setJobs(data.jobs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const timer = setInterval(loadJobs, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleRetry = async (jobId: string) => {
    await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    loadJobs();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Jobs Queue Monitor</h1>
        <p className="text-sm text-slate-400 mt-1">Live status of background worker tasks and pipeline stages.</p>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#12151c] border border-[#1f2430] text-slate-400">
          No jobs in queue.
        </div>
      ) : (
        <div className="rounded-2xl bg-[#12151c] border border-[#1f2430] overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-[#181d26] text-xs font-semibold uppercase text-slate-400 border-b border-[#1f2430]">
              <tr>
                <th className="px-6 py-4">Job Type</th>
                <th className="px-6 py-4">State</th>
                <th className="px-6 py-4">Progress</th>
                <th className="px-6 py-4">Attempt</th>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2430]">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-[#181d26]/50">
                  <td className="px-6 py-4 font-mono text-xs text-white">{j.type}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        j.state === 'done'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : j.state === 'running'
                          ? 'bg-blue-500/10 text-blue-400 animate-pulse'
                          : j.state === 'failed'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      {j.state}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono">{j.progress}%</td>
                  <td className="px-6 py-4 text-xs font-mono">{j.attempt}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">{j.created_at.slice(11, 19)}</td>
                  <td className="px-6 py-4 text-right">
                    {j.state === 'failed' && (
                      <button
                        onClick={() => handleRetry(j.id)}
                        className="text-xs text-blue-400 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
