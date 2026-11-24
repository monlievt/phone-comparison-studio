'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Job {
  id: string;
  comparison_id?: string | null;
  type: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'blocked';
  attempt: number;
  max_attempts: number;
  progress: number;
  payload_json?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

function getJobFormat(job: Job): string | null {
  if (!job.payload_json) return null;
  try {
    const parsed = JSON.parse(job.payload_json) as { format?: string };
    return typeof parsed.format === 'string' ? parsed.format : null;
  } catch {
    return null;
  }
}

function isSupersededBySuccess(job: Job, allJobs: Job[]): boolean {
  if (!job.comparison_id) return false;
  const failedAt = Date.parse(job.updated_at || job.created_at);
  if (Number.isNaN(failedAt)) return false;
  const format = getJobFormat(job);

  return allJobs.some((other) => {
    if (other.id === job.id || other.state !== 'done') return false;
    if (other.comparison_id !== job.comparison_id || other.type !== job.type) return false;
    if (format !== null && getJobFormat(other) !== format) return false;
    const doneAt = Date.parse(other.updated_at || other.created_at);
    return !Number.isNaN(doneAt) && doneAt > failedAt;
  });
}

interface LogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobLogs, setJobLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const timer = setInterval(loadJobs, 2500);
    return () => clearInterval(timer);
  }, []);

  // Close execution log dialog with Escape (R-26, R-32)
  useEffect(() => {
    if (!selectedJobId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedJobId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedJobId]);

  const handleOpenLogs = async (jobId: string) => {
    setSelectedJobId(jobId);
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/logs`);
      const data = await res.json();
      setJobLogs(data.logs || []);
    } catch {
      setJobLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      await loadJobs();
      if (selectedJobId === jobId) {
        await handleOpenLogs(jobId);
      }
    } finally {
      setRetryingId(null);
    }
  };

  const handleDismiss = async (jobId: string) => {
    setDismissingId(jobId);
    try {
      const res = await fetch('/api/jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
      }
      await loadJobs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not dismiss job');
    } finally {
      setDismissingId(null);
    }
  };

  const failedJobs = jobs.filter(
    (j) => (j.state === 'failed' || j.state === 'blocked') && !isSupersededBySuccess(j, jobs)
  );
  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0e0f0c] tracking-tight">
            Background Worker Jobs
          </h1>
          <p className="text-sm text-[#454745] mt-1">
            Inspect active, completed, blocked, and failed pipeline stages. Retry any failed task without re-running completed stages.
          </p>
        </div>

        <button
          type="button"
          onClick={loadJobs}
          className="px-5 min-h-[44px] rounded-full bg-[#ffffff] border border-[#0e0f0c] hover:bg-[#f6f7f5] text-xs font-bold text-[#0e0f0c] self-start sm:self-auto"
        >
          Refresh Queue
        </button>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-[16px] bg-[#320707] text-[#ffd11a] text-xs font-bold">
          Failed to load job queue: {error}
        </div>
      )}

      {failedJobs.length > 0 && (
        <section aria-label="Failed and blocked jobs" className="p-5 sm:p-6 rounded-[24px] bg-[#320707] text-white border border-[#d03238] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-[#ffd11a]">
              Action Required: {failedJobs.length} Failed or Blocked Job(s)
            </h2>
            <Link href="/settings" className="text-xs font-bold text-[#9fe870] underline">
              Open Settings
            </Link>
          </div>

          <div className="space-y-2">
            {failedJobs.map((f) => (
              <div
                key={f.id}
                className="p-3.5 rounded-[16px] bg-[#1a0404] border border-[#d03238]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-bold text-white flex flex-wrap items-center gap-2">
                    <span>{f.type}</span>
                    <span className="text-[#b8bcb4] font-mono text-[11px]">{f.id.slice(0, 10)}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#d03238] text-white text-[10px] uppercase font-bold">
                      {f.state}
                    </span>
                  </div>
                  <div className="text-[#ffd11a] font-medium line-clamp-2">
                    {f.error || 'Task failed during execution.'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenLogs(f.id)}
                    className="px-4 min-h-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white font-bold text-xs"
                  >
                    View Log
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRetry(f.id)}
                    disabled={retryingId === f.id || dismissingId === f.id}
                    className="px-4 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
                  >
                    {retryingId === f.id ? 'Retrying...' : 'Retry'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismiss(f.id)}
                    disabled={dismissingId === f.id || retryingId === f.id}
                    className="px-4 min-h-[44px] rounded-full border border-white/40 text-white hover:bg-white/15 font-bold text-xs"
                  >
                    {dismissingId === f.id ? 'Dismissing...' : 'Dismiss'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="bg-[#ffffff] rounded-[24px] p-4 sm:p-6 border border-[#d5dbd1] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f8f9f7] text-[#0e0f0c] font-bold uppercase text-[11px] border-b border-[#e8ebe6]">
              <tr>
                <th className="px-4 py-3">Job Type</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8ebe6]">
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#595c58]">
                    Loading background jobs...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#595c58]">
                    Queue is empty. Create a comparison or scan topics to enqueue worker jobs.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[#f8f9f7]">
                    <td className="px-4 py-4">
                      <div className="font-bold text-[#0e0f0c] text-sm">{job.type}</div>
                      <div className="text-[11px] text-[#595c58] font-mono flex flex-wrap items-center gap-2 mt-0.5">
                        <span>{job.id.slice(0, 12)}</span>
                        {job.comparison_id && (
                          <Link
                            href={`/comparisons/${job.comparison_id}`}
                            className="text-[#054d28] font-bold underline"
                          >
                            Open comparison
                          </Link>
                        )}
                      </div>
                      {job.error && (
                        <div className="mt-2 p-2.5 rounded-[10px] bg-[#320707] text-[#ffd11a] text-[11px] font-mono max-w-xl">
                          <div className="line-clamp-2">{job.error}</div>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase ${
                          job.state === 'done'
                            ? 'bg-[#e2f6d5] text-[#054d28]'
                            : job.state === 'running'
                            ? 'bg-[#fff8eb] text-[#7a5901]'
                            : job.state === 'failed' || job.state === 'blocked'
                            ? 'bg-[#320707] text-[#ffd11a]'
                            : 'bg-[#e8ebe6] text-[#0e0f0c]'
                        }`}
                      >
                        {job.state}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="w-24 bg-[#e8ebe6] h-2 rounded-full overflow-hidden">
                        <div
                          className={job.state === 'failed' ? 'h-full bg-[#d03238]' : 'h-full bg-[#054d28]'}
                          style={{
                            width: `${
                              job.state === 'done'
                                ? 100
                                : Math.min(100, Math.round(job.progress)) || (job.state === 'running' ? 20 : 0)
                            }%`,
                          }}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-4 font-semibold text-[#0e0f0c]">
                      {job.attempt} / {job.max_attempts}
                    </td>

                    <td className="px-4 py-4 text-[#595c58]">
                      {new Date(job.created_at).toLocaleTimeString()}
                    </td>

                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenLogs(job.id)}
                          className="px-3.5 min-h-[44px] rounded-full bg-[#f8f9f7] hover:bg-[#e8ebe6] border border-[#d5dbd1] text-[#0e0f0c] font-bold text-xs whitespace-nowrap"
                        >
                          View Logs
                        </button>

                        {(job.state === 'failed' || job.state === 'blocked') && (
                          <button
                            type="button"
                            onClick={() => handleRetry(job.id)}
                            disabled={retryingId === job.id}
                            className="px-4 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs whitespace-nowrap"
                          >
                            {retryingId === job.id ? 'Retrying...' : 'Retry'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedJobId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-modal-title"
          className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
        >
          <div className="bg-[#0e0f0c] text-white rounded-[24px] max-w-2xl w-full p-6 sm:p-8 space-y-5 border border-[#373932] max-h-[85vh] flex flex-col justify-between">
            <div className="flex items-start justify-between gap-4 border-b border-[#2c2e28] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="log-modal-title" className="text-base font-black text-white">
                    Execution Log
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-[#1a1c17] text-[#9fe870] border border-[#373932]">
                    {selectedJob?.state}
                  </span>
                </div>
                <div className="text-xs text-[#b8bcb4] font-mono mt-1">
                  {selectedJob?.type} · {selectedJobId}
                </div>
              </div>

              <button
                type="button"
                aria-label="Close execution log"
                onClick={() => setSelectedJobId(null)}
                className="min-w-[44px] min-h-[44px] rounded-full bg-[#1a1c17] hover:bg-[#2c2e28] flex items-center justify-center text-white font-bold text-sm"
              >
                <span aria-hidden="true">X</span>
              </button>
            </div>

            {selectedJob?.error && (
              <div className="p-4 rounded-[16px] bg-[#320707] border border-[#d03238] text-xs font-mono text-[#ffd11a] whitespace-pre-wrap">
                {selectedJob.error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 p-4 rounded-[16px] bg-[#050607] border border-[#2c2e28] font-mono text-xs max-h-72">
              {logsLoading ? (
                <div className="text-center text-[#b8bcb4] py-8">Loading log entries...</div>
              ) : jobLogs.length === 0 ? (
                <div className="text-center text-[#b8bcb4] py-8">No log entries recorded for this job.</div>
              ) : (
                jobLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="text-[#b8bcb4] shrink-0 text-[11px]">
                      {new Date(log.at).toLocaleTimeString()}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                        log.level === 'error'
                          ? 'bg-[#d03238] text-white'
                          : log.level === 'warn'
                          ? 'bg-[#ffd11a] text-[#0e0f0c]'
                          : 'bg-[#e2f6d5] text-[#054d28]'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="break-words text-[#e8ebe6]">{log.message}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#2c2e28]">
              <div className="text-xs text-[#b8bcb4]">
                Retries remaining: {Math.max(0, (selectedJob?.max_attempts ?? 2) - (selectedJob?.attempt ?? 0))}
              </div>
              <div className="flex items-center gap-2">
                {(selectedJob?.state === 'failed' || selectedJob?.state === 'blocked') && (
                  <button
                    type="button"
                    onClick={() => handleRetry(selectedJobId)}
                    disabled={retryingId === selectedJobId}
                    className="px-5 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
                  >
                    {retryingId === selectedJobId ? 'Retrying...' : 'Retry Task'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
