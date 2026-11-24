'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AutopilotQuickControlsProps {
  initialMode: 'autopilot' | 'manual';
  initialEnabled: boolean;
  initialPaused: boolean;
  initialPauseReason: string | null;
  videosPerWeek: number;
}

export function AutopilotQuickControls({
  initialMode,
  initialEnabled,
  initialPaused,
  initialPauseReason,
  videosPerWeek,
}: AutopilotQuickControlsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'autopilot' | 'manual'>(initialMode);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [paused, setPaused] = useState(initialPaused);
  const [pauseReason, setPauseReason] = useState<string | null>(initialPauseReason);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isActive = mode === 'autopilot' && enabled && !paused;

  const handleStartOrRun = async (enableAndResume: boolean) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enableAndResume ? { enable: true, resume: true } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to run Autopilot';
        throw new Error(msg);
      }
      setMode('autopilot');
      setEnabled(true);
      setPaused(false);
      setPauseReason(null);
      setFeedback({
        kind: 'ok',
        text: data.alreadyQueued
          ? 'Autopilot cycle is already queued. Worker will execute shortly.'
          : enableAndResume
          ? 'Full Automation enabled and cycle queued. Worker will pick it up in ~2s.'
          : 'Autopilot cycle queued. Worker will pick it up in ~2s.',
      });
      router.refresh();
    } catch (err: unknown) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to start Autopilot',
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePause = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pauseFile: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to pause Autopilot');
      }
      setPaused(true);
      setPauseReason(data.settings?.autopilotPauseReason ?? 'Manually paused by owner');
      setFeedback({ kind: 'ok', text: 'Autopilot paused (data/PAUSE created).' });
      router.refresh();
    } catch (err: unknown) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to pause Autopilot',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {paused ? (
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#320707] text-[#ffd11a] text-xs font-bold"
          >
            <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[#ffd11a]" />
            <span>Autopilot paused{pauseReason ? `: ${pauseReason}` : ''}</span>
          </Link>
        ) : isActive ? (
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e2f6d5] text-[#054d28] text-xs font-bold"
          >
            <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[#054d28]" />
            <span>Autopilot active ({videosPerWeek}/week)</span>
          </Link>
        ) : (
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ffffff] border border-[#d5dbd1] text-xs font-bold text-[#0e0f0c]"
          >
            <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[#7a5901]" />
            <span>Manual gate mode</span>
          </Link>
        )}

        {!isActive ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleStartOrRun(true)}
            className="px-4 min-h-[44px] rounded-full bg-[#0e0f0c] hover:bg-[#232620] text-[#9fe870] text-xs font-bold disabled:opacity-60"
          >
            {busy ? 'Starting...' : paused ? 'Resume & Run Automation' : 'Start Full Automation'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleStartOrRun(false)}
              className="px-4 min-h-[44px] rounded-full bg-[#ffffff] border border-[#0e0f0c] hover:bg-[#f6f7f5] text-[#0e0f0c] text-xs font-bold disabled:opacity-60"
            >
              {busy ? 'Queueing...' : 'Run Cycle Now'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handlePause}
              className="px-4 min-h-[44px] rounded-full bg-[#320707] hover:bg-[#4d0b0b] text-[#ffd11a] text-xs font-bold disabled:opacity-60"
            >
              Pause
            </button>
          </>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`inline-flex flex-wrap items-center gap-2 px-3.5 py-2 rounded-[14px] text-xs font-semibold border ${
            feedback.kind === 'ok'
              ? 'bg-[#e2f6d5] text-[#054d28] border-[#054d28]/30'
              : 'bg-[#fff5f5] text-[#320707] border-[#d03238]/40'
          }`}
        >
          <span>{feedback.text}</span>
          {feedback.kind === 'ok' && (
            <Link href="/jobs" className="underline font-bold">
              View Jobs
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
