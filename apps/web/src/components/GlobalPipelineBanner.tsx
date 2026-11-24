'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Job {
  id: string;
  comparison_id?: string | null;
  type: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'blocked';
  progress?: number | null;
  payload_json?: string | null;
  created_at: string;
  updated_at: string;
}

export default function GlobalPipelineBanner() {
  const pathname = usePathname();
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [lastFinishedJob, setLastFinishedJob] = useState<{ comparisonId?: string } | null>(null);
  const [showFinishedToast, setShowFinishedToast] = useState(false);
  const prevActiveCount = useRef(0);
  const lastActiveComparisonId = useRef<string | null>(null);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) return;
      const data = await res.json();
      const allJobs: Job[] = data.jobs || [];
      const active = allJobs.filter((j) => j.state === 'running' || j.state === 'queued');
      setActiveJobs(active);

      for (const j of active) {
        if (j.comparison_id) {
          lastActiveComparisonId.current = j.comparison_id;
          break;
        }
        if (j.payload_json) {
          try {
            const p = JSON.parse(j.payload_json) as { comparisonId?: string };
            if (p.comparisonId) {
              lastActiveComparisonId.current = p.comparisonId;
              break;
            }
          } catch {
            // ignore malformed payload_json
          }
        }
      }

      if (prevActiveCount.current > 0 && active.length === 0) {
        setShowFinishedToast(true);
        setLastFinishedJob({ comparisonId: lastActiveComparisonId.current || undefined });
        setTimeout(() => setShowFinishedToast(false), 10000);
      }

      prevActiveCount.current = active.length;
    } catch {
      // keep polling quietly when server restarts
    }
  };

  useEffect(() => {
    if (pathname === '/login') {
      setActiveJobs([]);
      return;
    }
    fetchJobs();
    const intervalTime = activeJobs.length > 0 ? 2000 : 4000;
    const interval = setInterval(fetchJobs, intervalTime);
    return () => clearInterval(interval);
  }, [activeJobs.length, pathname]);

  if (pathname === '/login' || (activeJobs.length === 0 && !showFinishedToast)) {
    return null;
  }

  const runningJob = activeJobs.find((j) => j.state === 'running') || activeJobs[0];
  let parsedPayload: { comparisonId?: string; format?: string } = {};
  if (runningJob?.payload_json) {
    try {
      parsedPayload = JSON.parse(runningJob.payload_json) as { comparisonId?: string; format?: string };
    } catch {
      parsedPayload = {};
    }
  }

  const comparisonId = runningJob?.comparison_id || parsedPayload?.comparisonId || lastActiveComparisonId.current;
  const isCurrentlyOnThisComparison = Boolean(comparisonId && pathname === `/comparisons/${comparisonId}`);

  const getTaskLabel = (job?: Job) => {
    if (!job) return 'Processing pipeline';
    const pct = job.progress && job.progress > 0 ? ` (${Math.min(100, Math.round(job.progress))}%)` : '';
    switch (job.type) {
      case 'collect_specs':
        return `Collecting phone specifications${pct}`;
      case 'compute_verdict':
        return 'Computing specification verdict and rankings';
      case 'generate_copy':
        return 'Generating titles, hook, and description';
      case 'render_preview': {
        const fmt = parsedPayload?.format ? ` ${parsedPayload.format.toUpperCase()}` : '';
        return `Rendering${fmt} preview${pct}`;
      }
      case 'render_final': {
        const fmt = parsedPayload?.format ? ` ${parsedPayload.format.toUpperCase()}` : '';
        return `Rendering${fmt} final 1080p${pct}`;
      }
      case 'render_thumbnail':
        return 'Rendering 1280x720 thumbnail';
      case 'handoff':
        return 'Sending videos and metadata to ytagent';
      case 'track_candidates':
        return 'Scanning RSS feeds for phone releases';
      default:
        return `Running ${job.type}${pct}`;
    }
  };

  const getProgressPercentage = (job?: Job) => {
    if (!job) return 15;
    if (job.progress && job.progress > 0) {
      return Math.min(100, Math.max(8, Math.round(job.progress)));
    }
    if (job.type === 'collect_specs') return 20;
    if (job.type === 'compute_verdict') return 35;
    if (job.type === 'generate_copy') return 55;
    if (job.type === 'render_preview' || job.type === 'render_final') return 25;
    if (job.type === 'render_thumbnail') return 88;
    return 40;
  };

  return (
    <div role="status" aria-live="polite" className="sticky top-16 z-40 w-full">
      {showFinishedToast && activeJobs.length === 0 && (
        <div className="bg-[#e2f6d5] border-b border-[#054d28] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-black text-[#054d28]">
              Pipeline stage finished
            </span>
            <p className="text-xs text-[#054d28]">
              Background jobs completed. Open the comparison to review the output.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastFinishedJob?.comparisonId && !isCurrentlyOnThisComparison && (
              <Link
                href={`/comparisons/${lastFinishedJob.comparisonId}`}
                className="text-xs font-bold px-4 min-h-[44px] inline-flex items-center rounded-full bg-[#054d28] text-white hover:bg-[#0e0f0c]"
              >
                Open comparison
              </Link>
            )}
            <button
              type="button"
              onClick={() => setShowFinishedToast(false)}
              className="text-xs font-bold px-3 min-h-[44px] text-[#054d28] hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {activeJobs.length > 0 && (
        <div className="bg-[#0e0f0c] text-white border-b border-[#2c2e28]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[#9fe870] text-[#0e0f0c] uppercase">
                {runningJob?.state === 'running' ? 'Running' : 'Queued'}
              </span>
              <span className="text-xs font-bold text-white truncate">
                {getTaskLabel(runningJob)}
              </span>
              {comparisonId && (
                <span className="hidden sm:inline-block text-xs font-mono text-[#b8bcb4]">
                  {comparisonId.slice(0, 8)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden md:inline-block text-xs font-mono font-bold text-[#9fe870] bg-[#1a1c17] px-3 py-1 rounded-full border border-[#373932]">
                {activeJobs.length} active
              </span>

              {comparisonId && !isCurrentlyOnThisComparison && (
                <Link
                  href={`/comparisons/${comparisonId}`}
                  className="px-3.5 min-h-[36px] inline-flex items-center rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
                >
                  Open deck
                </Link>
              )}

              <Link
                href="/jobs"
                className="px-3.5 min-h-[36px] inline-flex items-center rounded-full bg-[#1a1c17] hover:bg-[#2c2e28] text-[#e8ebe6] font-bold text-xs border border-[#373932]"
              >
                Jobs
              </Link>
            </div>
          </div>

          <div className="w-full bg-[#1e201b] h-1.5 overflow-hidden">
            <div
              className="bg-[#9fe870] h-full transition-all duration-300 ease-out"
              style={{ width: `${getProgressPercentage(runningJob)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
