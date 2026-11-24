'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';

const TEMPLATE_OPTIONS = [
  {
    id: 'v3',
    title: 'Template V3',
    desc: 'Persistent stage, camera pans and zooms, overlapping transitions, parametric phone, and score reveal.',
    badge: 'Latest V3',
  },
  {
    id: 'v2',
    title: 'Template V2',
    desc: 'Persistent stage with camera moves, layered transitions, and count-up score recap.',
    badge: 'Modern V2',
  },
  {
    id: 'v1',
    title: 'Template V1',
    desc: 'Classic column card layout rendered per segment.',
    badge: 'Classic',
  },
];

export default function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic API payload
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ phoneId: string; categoryKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [themePreset, setThemePreset] = useState('v3');
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [imageActionLoading, setImageActionLoading] = useState<string | null>(null);

  const [uploadLicense, setUploadLicense] = useState('Official Press Kit');
  const [uploadSourceUrl, setUploadSourceUrl] = useState('');

  const [bmSource, setBmSource] = useState('AnTuTu');
  const [bmVersion, setBmVersion] = useState('v10');
  const [bmPeriod, setBmPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [bmCsvText, setBmCsvText] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);

  const [editHook, setEditHook] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTitles, setEditTitles] = useState<string[]>([]);
  const [copyDirty, setCopyDirty] = useState(false);

  const [selectedTitle, setSelectedTitle] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'unlisted' | 'public'>('private');

  const prevActiveJobCount = useRef<number>(0);

  const loadData = async () => {
    try {
      const res = await fetch(`/api/comparisons/${id}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json?.comparison?.theme_version && ['v1', 'v2', 'v3'].includes(json.comparison.theme_version)) {
          setThemePreset(json.comparison.theme_version);
        }
        if (json?.copy && !copyDirty) {
          setEditHook(json.copy.hook || '');
          setEditDescription(json.copy.description || '');
          setEditTitles(Array.isArray(json.copy.titles) ? json.copy.titles : []);
          if (!selectedTitle && json.copy.titles?.[0]) {
            setSelectedTitle(json.copy.titles[0]);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Job rows from API
  const jobs: any[] = data?.jobs || [];
  const activeJobs = jobs.filter((j) => j.state === 'running' || j.state === 'queued');
  const isRunningJobs = activeJobs.length > 0;
  const currentRunningJob = activeJobs.find((j) => j.state === 'running') || activeJobs[0];
  const queuedHoldJob = jobs.find((j) => j.type === 'handoff' && j.state === 'queued' && j.run_after);

  useEffect(() => {
    loadData();
    const pollInterval = isRunningJobs ? 1500 : 4000;
    const interval = setInterval(loadData, pollInterval);
    return () => clearInterval(interval);
  }, [id, isRunningJobs, copyDirty]);

  useEffect(() => {
    if (prevActiveJobCount.current > 0 && activeJobs.length === 0) {
      setBannerMsg({ type: 'ok', text: 'Pipeline jobs completed. Review the updated output below.' });
    }
    prevActiveJobCount.current = activeJobs.length;
  }, [activeJobs.length]);

  const sendPatch = async (payload: Record<string, unknown>, successMsg?: string) => {
    setActionLoading(true);
    setBannerMsg(null);
    try {
      const res = await fetch(`/api/comparisons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = typeof json.error === 'string' ? json.error : json.error?.message || 'Action failed';
        setBannerMsg({ type: 'err', text: msg });
        return false;
      }
      if (successMsg) setBannerMsg({ type: 'ok', text: successMsg });
      await loadData();
      return true;
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveSpec = async (phoneId: string, categoryKey: string) => {
    const ok = await sendPatch(
      { action: 'update_spec', specUpdates: { phoneId, categoryKey, rawValue: editValue } },
      'Specification updated.'
    );
    if (ok) setEditingCell(null);
  };

  const handleFileUpload = async (phoneId: string, file: File) => {
    if (!uploadLicense.trim() || !uploadSourceUrl.trim()) {
      setBannerMsg({
        type: 'err',
        text: 'License and Source URL are required before uploading a phone image.',
      });
      return;
    }
    setImageActionLoading(phoneId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('phoneId', phoneId);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadJson = await uploadRes.json();

      await sendPatch(
        {
          action: 'update_phone_image',
          imageUpdates: {
            phoneId,
            filePath: uploadJson.filePath,
            license: uploadLicense.trim(),
            sourceUrl: uploadSourceUrl.trim(),
          },
        },
        'Licensed phone image saved.'
      );
    } catch (err: unknown) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setImageActionLoading(null);
    }
  };

  const handleImportBenchmarkCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setBannerMsg(null);
    try {
      const res = await fetch('/api/benchmarks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: bmSource,
          version: bmVersion,
          period: bmPeriod,
          csvContent: bmCsvText,
          permissionNote: 'Manual CSV import via Gate A',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'CSV import failed');
      setBannerMsg({
        type: 'ok',
        text: `Imported ${json.snapshot.matchedCount}/${json.snapshot.rowCount} benchmark rows (${bmSource} ${bmVersion}).`,
      });
      setBmCsvText('');
      setShowCsvImport(false);
      await loadData();
    } catch (err: unknown) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'CSV import failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveCopy = async () => {
    const ok = await sendPatch(
      {
        action: 'update_copy',
        copyUpdates: {
          titles: editTitles,
          hook: editHook,
          description: editDescription,
        },
      },
      'Copy saved and passed validateNumbers().'
    );
    if (ok) setCopyDirty(false);
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-xs font-bold text-[#595c58] bg-[#ffffff] rounded-[24px] border border-[#d5dbd1]">
        Loading comparison details...
      </div>
    );
  }

  if (!data?.comparison) {
    return (
      <div className="p-12 text-center rounded-[24px] bg-[#ffffff] border border-[#d03238] text-[#d03238] text-xs font-bold">
        Comparison record [{id}] was not found.
      </div>
    );
  }

  const {
    comparison,
    phones,
    specs,
    copy,
    renders = [],
    publications = [],
    excludedCategories = [],
    numberValidation = { passed: true, offenders: [], copyRuleIssues: [] },
  } = data;

  const excludedSet = new Set<string>(excludedCategories);
  const categoryKeys = Array.from(new Set(specs.map((s: { category_key: string }) => s.category_key))) as string[];
  let renderedPhones: Array<{ name: string }> = [];
  if (comparison.final_json) {
    try {
      const parsedFinal = JSON.parse(String(comparison.final_json)) as { phones?: Array<{ name: string }> };
      if (Array.isArray(parsedFinal.phones)) {
        renderedPhones = parsedFinal.phones;
      }
    } catch {
      renderedPhones = [];
    }
  }
  const hasPhoneCountMismatch = renderedPhones.length > 0 && renderedPhones.length !== phones.length;

  const readyCategoryCount = categoryKeys.filter((catKey) => {
    if (excludedSet.has(catKey)) return false;
    return phones.every((p: { id: string }) => {
      const spec = specs.find(
        (s: { phone_id: string; category_key: string }) => s.phone_id === p.id && s.category_key === catKey
      );
      const conf = spec?.confidence ?? 0;
      return Boolean(spec?.raw_value && conf >= 0.4 && spec?.conflict !== 1);
    });
  }).length;

  const redCellCount = categoryKeys.reduce((acc, catKey) => {
    if (excludedSet.has(catKey)) return acc;
    for (const p of phones) {
      const spec = specs.find(
        (s: { phone_id: string; category_key: string }) => s.phone_id === p.id && s.category_key === catKey
      );
      const conf = spec?.confidence ?? 0;
      if (!spec?.raw_value || conf < 0.4 || spec?.conflict === 1) {
        acc++;
      }
    }
    return acc;
  }, 0);

  const pickLatestRender = (format: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Render rows
    const finalR = renders.find((r: any) => r.format === format && r.stage === 'final');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Render rows
    const prevR = renders.find((r: any) => r.format === format && r.stage === 'preview');
    if (finalR && prevR) {
      return new Date(prevR.created_at).getTime() > new Date(finalR.created_at).getTime() ? prevR : finalR;
    }
    return finalR || prevR;
  };

  const longRender = pickLatestRender('long');
  const shortRender = pickLatestRender('short');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Render rows
  const thumbRender = renders.find((r: any) => r.format === 'thumbnail');

  const isGateAReady = comparison.status === 'COLLECTED' || comparison.status === 'GATE_A';
  const isGateBReady = comparison.status === 'PREVIEW_RENDERED' || comparison.status === 'GATE_B';
  const isPublishReady = ['FINAL_RENDERED', 'METADATA_READY', 'HANDED_OFF', 'PUBLISHED'].includes(comparison.status);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Job row
  const getJobDescription = (job: any) => {
    if (!job) return '';
    const pct = job.progress ? Math.min(100, Math.round(job.progress)) : 0;
    switch (job.type) {
      case 'collect_specs':
        return `Collecting phone specifications${pct > 0 ? ` (${pct}%)` : ''}`;
      case 'compute_verdict':
        return 'Step 1 of 3: Computing rankings and verdict';
      case 'generate_copy':
        return 'Step 2 of 3: Generating titles, hook, and description';
      case 'render_preview':
        return `Step 3 of 3: Rendering preview video${pct > 0 ? ` (${pct}%)` : ''}`;
      case 'render_final':
        return `Rendering final 1080p video${pct > 0 ? ` (${pct}%)` : ''}`;
      case 'render_thumbnail':
        return 'Rendering 1280x720 thumbnail';
      case 'handoff':
        return 'Sending videos and metadata to ytagent';
      default:
        return `Running ${job.type}`;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-bold text-[#595c58] mb-2">
            <Link href="/" className="hover:text-[#0e0f0c] underline">Overview</Link>
            <span aria-hidden="true">/</span>
            <Link href="/comparisons" className="hover:text-[#0e0f0c] underline">Comparisons</Link>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-[#0e0f0c]">{comparison.id.slice(0, 10)}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black text-[#0e0f0c] tracking-tight">
              {comparison.title || 'Untitled Comparison'}
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                ['FAILED', 'FAILED_QA', 'SKIPPED_LOW_DATA', 'CANCELLED'].includes(comparison.status)
                  ? 'bg-[#320707] text-[#ffd11a]'
                  : comparison.status.includes('APPROVED') || comparison.status.includes('RENDERED') || comparison.status === 'HANDED_OFF' || comparison.status === 'PUBLISHED'
                  ? 'bg-[#e2f6d5] text-[#054d28]'
                  : 'bg-[#ffffff] border border-[#d5dbd1] text-[#0e0f0c]'
              }`}
            >
              {comparison.status}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isGateAReady && (
            <button
              type="button"
              onClick={() =>
                sendPatch(
                  { action: 'approve_gate_a', themePreset },
                  'Gate A approved. Computing verdict and rendering preview.'
                )
              }
              disabled={actionLoading || isRunningJobs || redCellCount > 0}
              className="px-6 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
            >
              {redCellCount > 0
                ? `Gate A blocked: ${redCellCount} unresolved cell(s)`
                : 'Approve Gate A & Render Preview'}
            </button>
          )}

          {isGateBReady && (
            <button
              type="button"
              onClick={() =>
                sendPatch(
                  { action: 'approve_gate_b' },
                  'Gate B approved. Final 1080p renders and thumbnail queued.'
                )
              }
              disabled={actionLoading || isRunningJobs || !numberValidation.passed}
              className="px-6 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
            >
              {!numberValidation.passed
                ? 'Gate B blocked: fix copy numbers'
                : 'Approve Gate B & Render Final 1080p'}
            </button>
          )}

          {queuedHoldJob && (
            <button
              type="button"
              onClick={() => sendPatch({ action: 'cancel_hold' }, 'Autopilot publish cancelled during hold window.')}
              disabled={actionLoading}
              className="px-5 min-h-[44px] rounded-full bg-[#320707] text-[#ffd11a] font-bold text-xs"
            >
              Cancel Scheduled Publish
            </button>
          )}
        </div>
      </div>

      {queuedHoldJob && (
        <div role="status" className="p-4 rounded-[16px] bg-[#fff8eb] border border-[#7a5901]/40 text-[#7a5901] text-xs font-bold">
          Autopilot hold window active: scheduled handoff to ytagent at {new Date(queuedHoldJob.run_after).toLocaleString()}.
        </div>
      )}

      {bannerMsg && (
        <div
          role={bannerMsg.type === 'err' ? 'alert' : 'status'}
          className={`rounded-[16px] p-4 flex items-center justify-between gap-3 text-xs font-bold ${
            bannerMsg.type === 'ok'
              ? 'bg-[#e2f6d5] border border-[#054d28] text-[#054d28]'
              : 'bg-[#320707] text-[#ffd11a]'
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setBannerMsg(null)}
            className="min-w-[36px] min-h-[36px] font-bold"
          >
            <span aria-hidden="true">X</span>
          </button>
        </div>
      )}

      {isRunningJobs && (
        <div className="bg-[#0e0f0c] text-white rounded-[24px] p-6 border border-[#2c2e28] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>Pipeline Running</span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#9fe870] text-[#0e0f0c] uppercase">
                  Active
                </span>
              </div>
              <p className="text-xs text-[#b8bcb4] mt-1 font-medium">
                {getJobDescription(currentRunningJob)}
              </p>
            </div>

            <div className="text-xs font-mono font-bold text-[#9fe870] bg-[#1a1c17] px-3.5 py-1.5 rounded-full border border-[#373932]">
              {activeJobs.length} job(s) in queue
            </div>
          </div>

          <div className="w-full bg-[#1e201b] rounded-full h-2.5 overflow-hidden border border-[#2c2e28]">
            <div
              className="bg-[#9fe870] h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${
                  currentRunningJob?.progress && currentRunningJob.progress > 0
                    ? Math.min(100, Math.max(10, Math.round(currentRunningJob.progress)))
                    : 25
                }%`,
              }}
            />
          </div>
        </div>
      )}

      <section aria-label="Video template" className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-4">
        <div className="border-b border-[#e8ebe6] pb-3">
          <h2 className="text-base font-black text-[#0e0f0c]">
            Remotion Video Template ({themePreset.toUpperCase()})
          </h2>
          <p className="text-xs text-[#595c58] mt-0.5">
            Motion preset rotates automatically between consecutive videos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TEMPLATE_OPTIONS.map((t) => {
            const isSelected = themePreset === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setThemePreset(t.id);
                  sendPatch({ action: 'update_theme', themePreset: t.id });
                }}
                className={`text-left p-5 rounded-[20px] border-2 flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#e2f6d5] border-[#054d28]'
                    : 'bg-[#f8f9f7] border-[#e8ebe6] hover:border-[#595c58]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-black text-[#0e0f0c]">{t.title}</span>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#054d28] text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#454745] leading-relaxed">{t.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Phone visuals and license gate" className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-5">
        <div className="border-b border-[#e8ebe6] pb-4">
          <h2 className="text-base font-black text-[#0e0f0c]">Gate A: Phone Visuals &amp; License Gate</h2>
          <p className="text-xs text-[#595c58] mt-0.5">
            Default is the deterministic Parametric Phone illustration. Any real photo requires verified license metadata and source URL.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] text-xs">
          <div>
            <label htmlFor="upload-license" className="block font-bold text-[#454745] mb-1">
              License for manual upload
            </label>
            <input
              id="upload-license"
              type="text"
              value={uploadLicense}
              onChange={(e) => setUploadLicense(e.target.value)}
              placeholder="Official Press Kit / CC BY 4.0"
              className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 text-xs font-semibold"
            />
          </div>
          <div>
            <label htmlFor="upload-source-url" className="block font-bold text-[#454745] mb-1">
              Source URL for manual upload
            </label>
            <input
              id="upload-source-url"
              type="url"
              value={uploadSourceUrl}
              onChange={(e) => setUploadSourceUrl(e.target.value)}
              placeholder="https://news.brand.com/press-kit/..."
              className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 text-xs font-semibold"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Phone rows */}
          {phones.map((phone: any) => {
            const hasImage = Boolean(phone.image_path);
            const isProcessing = imageActionLoading === phone.id;

            return (
              <div
                key={phone.id}
                className="p-5 rounded-[20px] bg-[#f8f9f7] border border-[#e8ebe6] flex flex-col justify-between space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-[#0e0f0c]">
                    {phone.brand} {phone.model}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      hasImage ? 'bg-[#e2f6d5] text-[#054d28]' : 'bg-[#e8ebe6] text-[#0e0f0c]'
                    }`}
                  >
                    {hasImage ? 'Licensed image' : 'Parametric phone'}
                  </span>
                </div>

                <div className="relative h-48 rounded-[16px] bg-[#0c0d12] flex items-center justify-center p-4 overflow-hidden">
                  {hasImage ? (
                    <img
                      width={180}
                      height={160}
                      src={`/api/phones/${(phone.image_path || '').replace(/^phones\//, '')}`}
                      alt={`${phone.brand} ${phone.model}`}
                      className="max-h-40 w-auto object-contain"
                    />
                  ) : (
                    <div className="text-center space-y-1">
                      <div className="text-xs font-bold text-[#e8ebe6]">Parametric Phone Illustration</div>
                      <div className="text-xs text-[#b8bcb4]">Rendered from published dimensions</div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {hasImage && (
                    <div className="text-xs bg-white p-2.5 rounded-[12px] border border-[#e8ebe6] space-y-1">
                      <div><strong>License:</strong> {phone.image_license}</div>
                      <div className="truncate"><strong>Source:</strong> {phone.image_source_url}</div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-4 min-h-[44px] inline-flex items-center rounded-full bg-[#ffffff] hover:bg-[#f0f2ee] text-[#0e0f0c] border border-[#0e0f0c] text-xs font-bold">
                      <span>{isProcessing ? 'Uploading...' : 'Upload Licensed Image'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={isProcessing}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(phone.id, file);
                        }}
                      />
                    </label>

                    {hasImage && (
                      <button
                        type="button"
                        onClick={() => sendPatch({ action: 'remove_phone_image', phoneId: phone.id }, 'Switched to Parametric Phone.')}
                        className="px-4 min-h-[44px] rounded-full text-xs font-bold text-[#d03238] hover:bg-[#fde8e8]"
                      >
                        Use Parametric Fallback
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Specifications matrix" className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e8ebe6] pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-[#0e0f0c]">Gate A: Specifications Matrix</h2>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  readyCategoryCount >= 6
                    ? 'bg-[#e2f6d5] text-[#054d28]'
                    : 'bg-[#320707] text-[#ffd11a]'
                }`}
              >
                {readyCategoryCount}/{categoryKeys.length} categories ready for video
              </span>
            </div>
            <p className="text-xs text-[#595c58] mt-0.5">
              Edit low-confidence (&lt;40%) or missing cells, or click Re-collect Specs. Minimum 6 valid categories required before render.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                sendPatch(
                  { action: 'recollect_specs' },
                  'Spec re-collection queued using grounded search.'
                )
              }
              disabled={actionLoading || isRunningJobs}
              className="px-4 min-h-[44px] rounded-full bg-[#ffffff] hover:bg-[#f0f2ee] text-[#0e0f0c] font-bold text-xs border border-[#0e0f0c]"
            >
              Re-collect Specs
            </button>

            <button
              type="button"
              onClick={() => sendPatch({ action: 'standardize_specs' }, 'Formatted spec units.')}
              disabled={actionLoading}
              className="px-4 min-h-[44px] rounded-full bg-[#f0f2ee] hover:bg-[#0e0f0c] text-[#0e0f0c] hover:text-[#ffffff] font-bold text-xs border border-[#d5dbd1]"
            >
              Format Units
            </button>

            <button
              type="button"
              onClick={() =>
                sendPatch(
                  { action: 'recompute_and_render', themePreset },
                  'Verdict recomputation and preview render queued.'
                )
              }
              disabled={actionLoading || isRunningJobs}
              className="px-5 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
            >
              {isRunningJobs ? 'Pipeline Running...' : 'Re-calculate & Render Preview'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f8f9f7] text-[#0e0f0c] font-bold uppercase text-[11px] border-b border-[#e8ebe6]">
              <tr>
                <th className="px-4 py-3">Category</th>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Phone headers */}
                {phones.map((p: any) => (
                  <th key={p.id} className="px-4 py-3">
                    {p.brand} {p.model}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8ebe6]">
              {categoryKeys.length === 0 ? (
                <tr>
                  <td colSpan={phones.length + 2} className="px-5 py-8 text-center text-[#595c58]">
                    Waiting for spec collector to finish.
                  </td>
                </tr>
              ) : (
                categoryKeys.map((catKey) => {
                  const isExcluded = excludedSet.has(catKey);
                  return (
                    <tr key={catKey} className={isExcluded ? 'opacity-55 bg-[#f8f9f7]' : 'hover:bg-[#f8f9f7]'}>
                      <td className="px-4 py-3 font-semibold text-[#0e0f0c] capitalize">
                        {catKey.replace(/_/g, ' ')}
                      </td>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Spec cell */}
                      {phones.map((p: any) => {
                        const spec = specs.find(
                          (s: { phone_id: string; category_key: string }) =>
                            s.phone_id === p.id && s.category_key === catKey
                        );
                        const isEditing = editingCell?.phoneId === p.id && editingCell?.categoryKey === catKey;
                        const conf = spec?.confidence ?? 0;

                        return (
                          <td key={p.id} className="px-4 py-3">
                            {isEditing ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  aria-label={`Edit ${catKey} for ${p.brand} ${p.model}`}
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="px-2.5 min-h-[36px] rounded-[8px] bg-white border-2 border-[#0e0f0c] text-xs font-bold"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveSpec(p.id, catKey)}
                                  className="text-xs font-bold text-[#054d28] bg-[#e2f6d5] px-3 min-h-[36px] rounded-full"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCell(null)}
                                  className="text-xs text-[#595c58] px-2 min-h-[36px] underline"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      aria-hidden="true"
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        spec?.raw_value && conf >= 0.8
                                          ? 'bg-[#054d28]'
                                          : spec?.raw_value && conf >= 0.4
                                          ? 'bg-[#7a5901]'
                                          : 'bg-[#d03238]'
                                      }`}
                                    />
                                    <span className="font-medium text-[#0e0f0c]">
                                      {spec?.raw_value || 'Missing'}
                                    </span>
                                    <span className="text-[11px] text-[#595c58]">
                                      ({Math.round(conf * 100)}%)
                                    </span>
                                  </div>
                                  {spec?.source_url && (
                                    <a
                                      href={spec.source_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] text-[#454745] underline pl-4 block truncate max-w-[180px]"
                                    >
                                      View source
                                    </a>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCell({ phoneId: p.id, categoryKey: catKey });
                                    setEditValue(spec?.raw_value || '');
                                  }}
                                  className="text-xs text-[#0e0f0c] font-bold underline min-h-[36px] px-2"
                                >
                                  Edit
                                </button>
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => sendPatch({ action: 'toggle_exclude_category', categoryKey: catKey })}
                          className={`px-3 min-h-[36px] rounded-full text-[11px] font-bold ${
                            isExcluded ? 'bg-[#e8ebe6] text-[#0e0f0c]' : 'bg-[#e2f6d5] text-[#054d28]'
                          }`}
                        >
                          {isExcluded ? 'Excluded' : 'Included'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Benchmark snapshots" className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e8ebe6] pb-4">
          <div>
            <h2 className="text-base font-black text-[#0e0f0c]">Gate A: Benchmark Snapshots (CSV)</h2>
            <p className="text-xs text-[#595c58] mt-0.5">
              Import verified CSV snapshots. Benchmark segments are skipped automatically if any phone lacks a score.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCsvImport(!showCsvImport)}
            className="px-5 min-h-[44px] rounded-full bg-[#0e0f0c] text-white text-xs font-bold self-start sm:self-auto"
          >
            {showCsvImport ? 'Close CSV Form' : '+ Import Benchmark CSV'}
          </button>
        </div>

        {showCsvImport && (
          <form onSubmit={handleImportBenchmarkCsv} className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="bm-source" className="block font-bold text-[#454745] mb-1">Source</label>
                <input
                  id="bm-source"
                  type="text"
                  value={bmSource}
                  onChange={(e) => setBmSource(e.target.value)}
                  required
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 font-semibold"
                />
              </div>
              <div>
                <label htmlFor="bm-version" className="block font-bold text-[#454745] mb-1">Version</label>
                <input
                  id="bm-version"
                  type="text"
                  value={bmVersion}
                  onChange={(e) => setBmVersion(e.target.value)}
                  required
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 font-semibold"
                />
              </div>
              <div>
                <label htmlFor="bm-period" className="block font-bold text-[#454745] mb-1">Period (YYYY-MM)</label>
                <input
                  id="bm-period"
                  type="text"
                  value={bmPeriod}
                  onChange={(e) => setBmPeriod(e.target.value)}
                  required
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 font-semibold"
                />
              </div>
            </div>
            <div>
              <label htmlFor="bm-csv" className="block font-bold text-[#454745] mb-1">CSV rows</label>
              <textarea
                id="bm-csv"
                rows={4}
                value={bmCsvText}
                onChange={(e) => setBmCsvText(e.target.value)}
                placeholder={'device,variant,main,cpu,gpu,mem,ux\nSamsung Galaxy S25,8/256,2150000,500000,850000,450000,350000'}
                required
                className="w-full p-3 rounded-[10px] bg-white border border-[#595c58]/60 font-mono text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 min-h-[44px] rounded-full bg-[#9fe870] text-[#0e0f0c] font-bold"
            >
              Import Snapshot
            </button>
          </form>
        )}

        {(data.benchmarks || []).length === 0 ? (
          <div className="p-4 text-center text-xs text-[#595c58] bg-[#f8f9f7] rounded-[16px]">
            No benchmark scores imported for these phones yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Benchmark rows */}
            {data.benchmarks.map((b: any) => (
              <div key={b.id} className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] flex justify-between items-center">
                <div>
                  <div className="font-black text-[#0e0f0c]">{b.brand} {b.model}</div>
                  <div className="text-xs text-[#595c58]">{b.source} {b.version} ({b.period})</div>
                </div>
                <div className="font-mono text-base font-black text-[#054d28]">
                  {Math.round(b.main).toLocaleString('en-US')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(longRender || shortRender || thumbRender) && (
        <section aria-label="Video previews and QA" className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#e8ebe6] pb-4 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-[#0e0f0c]">Gate B: Video Previews &amp; Quality Checks</h2>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                  longRender?.stage === 'final' ? 'bg-[#e2f6d5] text-[#054d28]' : 'bg-[#fff8eb] text-[#7a5901]'
                }`}
              >
                {longRender?.stage === 'final' ? '1080p Final' : 'Draft Preview'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`text-xs font-bold px-3.5 py-1.5 rounded-full ${
                  numberValidation.passed ? 'text-[#054d28] bg-[#e2f6d5]' : 'text-[#ffd11a] bg-[#320707]'
                }`}
              >
                {numberValidation.passed
                  ? 'validateNumbers(): PASS'
                  : `validateNumbers(): FAIL (${numberValidation.offenders.length + numberValidation.copyRuleIssues.length})`}
              </div>

              <button
                type="button"
                onClick={() => sendPatch({ action: 'approve_gate_b' }, 'Final 1080p renders and thumbnail queued.')}
                disabled={actionLoading || isRunningJobs || !numberValidation.passed}
                className="px-5 min-h-[44px] rounded-full bg-[#0e0f0c] hover:bg-[#2c2e28] text-white text-xs font-bold"
              >
                {longRender?.stage === 'final' ? 'Re-render 1080p Final' : 'Approve Gate B & Render Final 1080p'}
              </button>
            </div>
          </div>

          {hasPhoneCountMismatch && (
            <div role="alert" className="p-4 rounded-[16px] bg-[#fff8eb] border border-[#7a5901] text-[#7a5901] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-black">
                  Outdated preview detected: rendered video contains {renderedPhones.length} phones ({renderedPhones.map((p) => p.name).join(' vs ')}), while Gate A has {phones.length} phones.
                </div>
                <div className="mt-0.5">
                  Re-calculate and re-render the preview so the video matches the exact {phones.length} selected smartphones.
                </div>
              </div>
              <button
                type="button"
                onClick={() => sendPatch({ action: 'recompute_and_render', themePreset }, 'Re-calculating verdict and rendering updated preview...')}
                disabled={actionLoading || isRunningJobs}
                className="px-4 min-h-[44px] rounded-full bg-[#0e0f0c] text-white font-bold text-xs shrink-0"
              >
                Re-render with {phones.length} Phones
              </button>
            </div>
          )}

          {!numberValidation.passed && (
            <div role="alert" className="p-4 rounded-[16px] bg-[#320707] text-[#ffd11a] text-xs space-y-1">
              <div className="font-black">Fix these copy issues before final render:</div>
              {numberValidation.offenders.map((o: { token: string; context: string }, idx: number) => (
                <div key={idx}>Unverified number &quot;{o.token}&quot; in: {o.context}</div>
              ))}
              {numberValidation.copyRuleIssues.map((msg: string, idx: number) => (
                <div key={idx}>{msg}</div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {longRender && (
              <div className="p-4 rounded-[20px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[#0e0f0c]">
                  <span>16:9 Long Video ({longRender.stage})</span>
                  <a
                    href={`/api/renders/${String(longRender.file_path).split('/').pop()}`}
                    download={`${comparison.title || 'comparison'}-long.mp4`}
                    className="text-[#054d28] underline"
                  >
                    Download MP4
                  </a>
                </div>
                <video
                  controls
                  width={1280}
                  height={720}
                  className="w-full rounded-[16px] bg-black aspect-video"
                  src={`/api/renders/${String(longRender.file_path).split('/').pop()}`}
                />
              </div>
            )}

            {shortRender && (
              <div className="p-4 rounded-[20px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[#0e0f0c]">
                  <span>9:16 Short Video ({shortRender.stage})</span>
                  <a
                    href={`/api/renders/${String(shortRender.file_path).split('/').pop()}`}
                    download={`${comparison.title || 'comparison'}-short.mp4`}
                    className="text-[#054d28] underline"
                  >
                    Download MP4
                  </a>
                </div>
                <div className="flex justify-center bg-black/10 rounded-[16px] p-2">
                  <video
                    controls
                    width={432}
                    height={768}
                    className="max-h-[360px] rounded-[12px] bg-black aspect-[9/16]"
                    src={`/api/renders/${String(shortRender.file_path).split('/').pop()}`}
                  />
                </div>
              </div>
            )}

            {thumbRender && (
              <div className="lg:col-span-2 p-4 rounded-[20px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[#0e0f0c]">
                  <span>YouTube Thumbnail (1280x720)</span>
                  <a
                    href={`/api/renders/${String(thumbRender.file_path).split('/').pop()}`}
                    download={`${comparison.title || 'comparison'}-thumbnail.png`}
                    className="text-[#054d28] underline"
                  >
                    Download PNG
                  </a>
                </div>
                <div className="flex justify-center">
                  <img
                    width={640}
                    height={360}
                    alt={`YouTube thumbnail for ${comparison.title || 'comparison'}`}
                    className="max-h-[300px] w-auto rounded-[12px] object-contain"
                    src={`/api/renders/${String(thumbRender.file_path).split('/').pop()}`}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {copy && (
        <section aria-label="Copy editor" className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ebe6] pb-3">
            <div>
              <h2 className="text-base font-black text-[#0e0f0c]">Gate B: Copy &amp; Hook Editor</h2>
              <p className="text-xs text-[#595c58] mt-0.5">
                Every edit is checked by validateNumbers() against the approved comparison data.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSaveCopy}
              disabled={actionLoading || !copyDirty}
              className="px-5 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] text-xs font-bold"
            >
              Save &amp; Validate Copy
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#454745]">Candidate titles (60 chars max)</div>
              {editTitles.map((title, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <label htmlFor={`copy-title-${idx}`} className="sr-only">
                    Candidate title {idx + 1}
                  </label>
                  <input
                    id={`copy-title-${idx}`}
                    type="text"
                    maxLength={60}
                    value={title}
                    onChange={(e) => {
                      const next = [...editTitles];
                      next[idx] = e.target.value;
                      setEditTitles(next);
                      setCopyDirty(true);
                    }}
                    className="flex-1 px-3.5 min-h-[44px] rounded-[10px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs font-bold text-[#0e0f0c]"
                  />
                  <span className="text-xs text-[#595c58] w-14 text-right">{title.length}/60</span>
                </div>
              ))}
            </div>

            <div>
              <label htmlFor="copy-hook" className="block text-xs font-bold text-[#454745] mb-1.5">
                Short hook (40 chars max)
              </label>
              <input
                id="copy-hook"
                type="text"
                maxLength={40}
                value={editHook}
                onChange={(e) => {
                  setEditHook(e.target.value);
                  setCopyDirty(true);
                }}
                className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs font-bold text-[#0e0f0c]"
              />
            </div>

            <div>
              <label htmlFor="copy-description" className="block text-xs font-bold text-[#454745] mb-1.5">
                Description &amp; chapters
              </label>
              <textarea
                id="copy-description"
                rows={10}
                value={editDescription}
                onChange={(e) => {
                  setEditDescription(e.target.value);
                  setCopyDirty(true);
                }}
                className="w-full p-3.5 rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs text-[#0e0f0c] font-mono leading-relaxed"
              />
            </div>
          </div>
        </section>
      )}

      {(isPublishReady || longRender?.stage === 'final') && copy && (
        <section aria-label="Publish handoff" className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-5">
          <div className="border-b border-[#e8ebe6] pb-3">
            <h2 className="text-base font-black text-[#0e0f0c]">Publish &amp; ytagent Handoff</h2>
            <p className="text-xs text-[#595c58] mt-0.5">
              Select the Long title and visibility, then send both Long (16:9) and Short (9:16) to ytagent.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="pub-title" className="block font-bold text-[#454745]">
                Selected Long title
              </label>
              <select
                id="pub-title"
                value={selectedTitle}
                onChange={(e) => setSelectedTitle(e.target.value)}
                className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 font-bold text-[#0e0f0c]"
              >
                {editTitles.map((t, idx) => (
                  <option key={idx} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pub-visibility" className="block font-bold text-[#454745]">
                YouTube visibility
              </label>
              <select
                id="pub-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'private' | 'unlisted' | 'public')}
                className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 font-bold text-[#0e0f0c]"
              >
                <option value="private">Private (default)</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-[#595c58]">Publications recorded: {publications.length}</div>
            <button
              type="button"
              onClick={() =>
                sendPatch(
                  { action: 'publish', title: selectedTitle, visibility },
                  'Handoff queued for Long and Short videos.'
                )
              }
              disabled={actionLoading || isRunningJobs}
              className="px-6 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
            >
              Send to ytagent
            </button>
          </div>

          {publications.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#e8ebe6]">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Publication rows */}
              {publications.map((pub: any) => (
                <div key={pub.id} className="p-3 rounded-[12px] bg-[#f8f9f7] text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold uppercase">{pub.format} ({pub.handoff_mode})</span>
                  <span className="font-mono text-[#454745]">ref: {pub.handoff_ref}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#e2f6d5] text-[#054d28] font-bold uppercase text-[11px]">
                    {pub.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
