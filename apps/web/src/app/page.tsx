import Link from 'next/link';
import { existsSync } from 'fs';
import { join } from 'path';
import { getFreeDiskGB, getStudioSettings } from '@phone-studio/core';
import { getDb } from '@/lib/db';
import { AutopilotQuickControls } from '@/components/AutopilotQuickControls';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const rootDir = process.cwd().includes('apps/web')
    ? join(process.cwd(), '../..')
    : process.cwd();
  const dataDir = join(rootDir, (process.env.DATA_DIR || './data').replace(/^\.\//, ''));

  const settings = getStudioSettings(db);
  const pauseFileExists = existsSync(join(dataDir, 'PAUSE'));
  const isPaused = pauseFileExists || settings.autopilotPaused;
  const diskFreeGB = getFreeDiskGB(dataDir);

  const llmRows = db
    .prepare('SELECT provider, count FROM llm_usage WHERE day = ?')
    .all(today) as Array<{ provider: string; count: number }>;

  const geminiUsed = llmRows
    .filter((r) => r.provider.includes('gemini'))
    .reduce((sum, r) => sum + r.count, 0);
  const groqUsed = llmRows
    .filter((r) => r.provider.includes('groq'))
    .reduce((sum, r) => sum + r.count, 0);
  const geminiLimit = Number(process.env.GEMINI_DAILY_LIMIT) || 1500;
  const groqLimit = Number(process.env.GROQ_DAILY_LIMIT) || 1000;

  const activeJobs = db
    .prepare("SELECT count(*) as count FROM jobs WHERE state IN ('running', 'queued')")
    .get() as { count: number };

  const failedJobsCount = (
    db.prepare("SELECT count(*) as count FROM jobs WHERE state IN ('failed', 'blocked')").get() as { count: number }
  )?.count ?? 0;

  const pendingTopics = db
    .prepare("SELECT * FROM topics WHERE status = 'proposed' ORDER BY score DESC, created_at DESC LIMIT 5")
    .all() as Array<{ id: string; phone_ids_json: string; score: number; angle: string }>;

  const allComparisons = db
    .prepare('SELECT id, title, status, phone_ids_json, created_at, updated_at FROM comparisons ORDER BY updated_at DESC LIMIT 30')
    .all() as Array<{ id: string; title: string; status: string; phone_ids_json: string; created_at: string; updated_at: string }>;

  const queuedComparisons = allComparisons.filter((c) => c.status === 'CREATED' || c.status === 'DRAFT');
  const inProgressComparisons = allComparisons.filter((c) =>
    ['COLLECTED', 'GATE_A', 'DATA_APPROVED', 'COPY_READY', 'PREVIEW_RENDERED', 'GATE_B', 'VIDEO_APPROVED'].includes(c.status)
  );
  const completedComparisons = allComparisons.filter((c) =>
    ['FINAL_RENDERED', 'METADATA_READY', 'HANDED_OFF', 'PUBLISHED'].includes(c.status)
  );
  const attentionComparisons = allComparisons.filter((c) =>
    ['FAILED', 'FAILED_QA', 'SKIPPED_LOW_DATA', 'CANCELLED'].includes(c.status)
  );

  const awaitingGatesCount = allComparisons.filter((c) =>
    ['COLLECTED', 'GATE_A', 'PREVIEW_RENDERED', 'GATE_B'].includes(c.status)
  ).length;

  const proposedTopicsCount = (
    db.prepare("SELECT count(*) as count FROM topics WHERE status = 'proposed'").get() as { count: number }
  )?.count ?? 0;

  const candidatesCount = (
    db.prepare('SELECT count(*) as count FROM phone_candidates').get() as { count: number }
  )?.count ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
        <div className="space-y-2">
          <AutopilotQuickControls
            initialMode={settings.autopilot.mode}
            initialEnabled={settings.autopilot.enabled}
            initialPaused={isPaused}
            initialPauseReason={settings.autopilotPauseReason ?? null}
            videosPerWeek={settings.autopilot.videosPerWeek}
          />

          <h1 className="text-3xl sm:text-4xl font-black text-[#0e0f0c] tracking-tight leading-tight">
            Video Production Pipeline
          </h1>
          <p className="text-[#454745] text-sm sm:text-base max-w-2xl">
            Track pending phone matchups, review Gate A specs and Gate B previews, and monitor final renders sent to ytagent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/topics"
            className="px-5 min-h-[44px] inline-flex items-center rounded-full bg-[#ffffff] border border-[#0e0f0c] hover:bg-[#f6f7f5] text-[#0e0f0c] font-bold text-sm"
          >
            Review Topics ({proposedTopicsCount})
          </Link>
          <Link
            href="/comparisons/new"
            className="px-6 min-h-[44px] inline-flex items-center rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-sm"
          >
            + Create Comparison
          </Link>
        </div>
      </div>

      {attentionComparisons.length > 0 && (
        <section aria-label="Runs needing attention" className="bg-[#fff8eb] border border-[#7a5901]/40 rounded-[24px] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#7a5901]">
              Needs Attention ({attentionComparisons.length})
            </h2>
            <Link href="/jobs" className="text-xs font-bold text-[#0e0f0c] underline">
              Inspect job logs
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {attentionComparisons.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                href={`/comparisons/${c.id}`}
                className="px-4 py-2 min-h-[44px] rounded-full bg-white border border-[#7a5901]/40 hover:border-[#0e0f0c] text-xs font-bold text-[#0e0f0c] inline-flex items-center gap-2"
              >
                <span>{c.title}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#320707] text-[#ffd11a]">
                  {c.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Primary Focus: 3-Stage Production Board */}
      <section aria-label="Production stages" className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="bg-[#ffffff] rounded-[24px] p-6 border border-[#d5dbd1] space-y-4">
          <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
            <h2 className="text-base font-black text-[#0e0f0c]">1. Mau Digenerate</h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#e8ebe6] text-[#0e0f0c]">
              {proposedTopicsCount + queuedComparisons.length}
            </span>
          </div>

          <div className="space-y-3">
            {pendingTopics.length === 0 && queuedComparisons.length === 0 ? (
              <div className="p-5 text-xs text-[#454745] bg-[#f8f9f7] rounded-[16px] space-y-2">
                <p>No pending pairs in Gate 0.</p>
                <Link href="/topics" className="font-bold text-[#0e0f0c] underline inline-block">
                  Open Topics to scan releases or generate pairs
                </Link>
              </div>
            ) : (
              <>
                {pendingTopics.map((t) => {
                  const names: string[] = JSON.parse(t.phone_ids_json);
                  return (
                    <div
                      key={t.id}
                      className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#0e0f0c]">
                          {names.join(' vs ')}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#e2f6d5] text-[#054d28]">
                          {t.score}/100
                        </span>
                      </div>
                      <p className="text-xs text-[#595c58] line-clamp-1">{t.angle}</p>
                      <Link
                        href="/topics"
                        className="inline-block text-xs font-bold text-[#0e0f0c] underline"
                      >
                        Review in Gate 0
                      </Link>
                    </div>
                  );
                })}

                {queuedComparisons.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-1.5"
                  >
                    <div className="text-xs font-bold text-[#0e0f0c]">{c.title}</div>
                    <div className="text-xs text-[#595c58]">Queued for spec collection</div>
                    <Link
                      href={`/comparisons/${c.id}`}
                      className="inline-block text-xs font-bold text-[#0e0f0c] underline"
                    >
                      Open comparison
                    </Link>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="bg-[#ffffff] rounded-[24px] p-6 border border-[#d5dbd1] space-y-4">
          <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
            <h2 className="text-base font-black text-[#0e0f0c]">2. Proses &amp; Review Gate</h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#e8ebe6] text-[#0e0f0c]">
              {inProgressComparisons.length}
            </span>
          </div>

          <div className="space-y-3">
            {inProgressComparisons.length === 0 ? (
              <div className="p-5 text-xs text-[#454745] bg-[#f8f9f7] rounded-[16px]">
                No comparisons currently running or waiting for Gate A/B review.
              </div>
            ) : (
              inProgressComparisons.map((c) => {
                const needsGateA = c.status === 'COLLECTED' || c.status === 'GATE_A';
                const needsGateB = c.status === 'PREVIEW_RENDERED' || c.status === 'GATE_B';
                return (
                  <div
                    key={c.id}
                    className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0e0f0c]">{c.title}</span>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                          needsGateA || needsGateB
                            ? 'bg-[#9fe870] text-[#0e0f0c]'
                            : 'bg-[#fff8eb] text-[#7a5901]'
                        }`}
                      >
                        {needsGateA ? 'Gate A' : needsGateB ? 'Gate B' : c.status}
                      </span>
                    </div>
                    <Link
                      href={`/comparisons/${c.id}`}
                      className="inline-block text-xs font-bold text-[#0e0f0c] underline"
                    >
                      {needsGateA
                        ? 'Review specs in Gate A'
                        : needsGateB
                        ? 'Watch preview in Gate B'
                        : 'Open status'}
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-[#ffffff] rounded-[24px] p-6 border border-[#d5dbd1] space-y-4">
          <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
            <h2 className="text-base font-black text-[#0e0f0c]">3. Final &amp; Diposting</h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#e8ebe6] text-[#0e0f0c]">
              {completedComparisons.length}
            </span>
          </div>

          <div className="space-y-3">
            {completedComparisons.length === 0 ? (
              <div className="p-5 text-xs text-[#454745] bg-[#f8f9f7] rounded-[16px]">
                No final renders or published videos yet. Approve Gate B on a comparison to generate 1080p finals.
              </div>
            ) : (
              completedComparisons.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0e0f0c]">{c.title}</span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#e2f6d5] text-[#054d28]">
                      {c.status}
                    </span>
                  </div>
                  <Link
                    href={`/comparisons/${c.id}`}
                    className="inline-block text-xs font-bold text-[#0e0f0c] underline"
                  >
                    Open video and publish controls
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Secondary System Strip: Queue, Gates, Disk, LLM Quotas */}
      <section aria-label="System telemetry" className="bg-[#ffffff] rounded-[24px] p-6 border border-[#d5dbd1] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="space-y-1">
          <div className="text-xs font-bold text-[#595c58] uppercase">Worker Queue</div>
          <div className="text-2xl font-black text-[#0e0f0c]">
            {activeJobs.count} active
            {failedJobsCount > 0 && (
              <span className="text-sm font-bold text-[#d03238] ml-2">({failedJobsCount} failed)</span>
            )}
          </div>
          <Link href="/jobs" className="text-xs font-bold text-[#0e0f0c] underline">
            Open jobs
          </Link>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-bold text-[#595c58] uppercase">Awaiting Review</div>
          <div className="text-2xl font-black text-[#0e0f0c]">{awaitingGatesCount} gates</div>
          <div className="text-xs text-[#595c58]">{candidatesCount} catalog models tracked</div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-bold text-[#595c58] uppercase">Local Disk Free</div>
          <div
            className={`text-2xl font-black ${
              diskFreeGB !== null && diskFreeGB < 5 ? 'text-[#d03238]' : 'text-[#0e0f0c]'
            }`}
          >
            {diskFreeGB !== null ? `${diskFreeGB} GB` : 'Unavailable'}
          </div>
          <div className="text-xs text-[#595c58]">Minimum 5 GB required to render</div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-[#595c58] uppercase">Today LLM Usage</div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between font-bold text-[#0e0f0c]">
              <span>Gemini</span>
              <span>{geminiUsed} / {geminiLimit}</span>
            </div>
            <div className="w-full h-1.5 bg-[#e8ebe6] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#054d28]"
                style={{ width: `${Math.min(100, Math.round((geminiUsed / geminiLimit) * 100))}%` }}
              />
            </div>
            <div className="flex justify-between font-bold text-[#0e0f0c]">
              <span>Groq</span>
              <span>{groqUsed} / {groqLimit}</span>
            </div>
            <div className="w-full h-1.5 bg-[#e8ebe6] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0e0f0c]"
                style={{ width: `${Math.min(100, Math.round((groqUsed / groqLimit) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
