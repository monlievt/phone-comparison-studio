'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function splitPhoneName(fullName: string): { brand: string; model: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { brand: '', model: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { brand: parts[0], model: '' };
  return { brand: parts[0], model: parts.slice(1).join(' ') };
}

function NewComparisonForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phoneCount, setPhoneCount] = useState<2 | 3>(2);
  const [phones, setPhones] = useState([
    { brand: '', model: '', variant: '' },
    { brand: '', model: '', variant: '' },
    { brand: '', model: '', variant: '' },
  ]);

  const [formats, setFormats] = useState({ long: true, short: true });
  const [themePreset, setThemePreset] = useState('v3');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p1 = searchParams.get('phone1');
    const p2 = searchParams.get('phone2');
    const p3 = searchParams.get('phone3');

    if (p1 || p2 || p3) {
      if (p3 && p3.trim()) {
        setPhoneCount(3);
      }
      setPhones([
        { ...splitPhoneName(p1 || ''), variant: '' },
        { ...splitPhoneName(p2 || ''), variant: '' },
        { ...splitPhoneName(p3 || ''), variant: '' },
      ]);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.settings?.autopilot?.defaultTemplate) {
          setThemePreset(data.settings.autopilot.defaultTemplate);
        }
      })
      .catch(() => {});
  }, []);

  const updatePhone = (index: number, field: 'brand' | 'model' | 'variant', value: string) => {
    setPhones((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const validPhones = phones
      .slice(0, phoneCount)
      .filter((p) => p.brand.trim() && p.model.trim())
      .map((p) => ({
        brand: p.brand.trim(),
        model: p.model.trim(),
        ...(p.variant.trim() ? { variant: p.variant.trim() } : {}),
      }));

    if (validPhones.length < phoneCount) {
      setError(`Enter brand and model for all ${phoneCount} smartphones to start a ${phoneCount}-phone comparison.`);
      setLoading(false);
      return;
    }

    const selectedFormats = Object.entries(formats)
      .filter(([, enabled]) => enabled)
      .map(([f]) => f);

    if (selectedFormats.length === 0) {
      setError('Select at least one output format (Long or Short).');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones: validPhones,
          formats: selectedFormats,
          themePreset,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to create comparison';
        throw new Error(msg);
      }

      router.push(`/comparisons/${data.comparisonId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-bold text-[#595c58]">
        <Link href="/" className="hover:text-[#0e0f0c] underline">
          Overview
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[#0e0f0c]">New Comparison</span>
      </nav>

      <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-10 border border-[#d5dbd1] space-y-8">
        <div>
          <h1 className="text-3xl font-black text-[#0e0f0c] tracking-tight">
            Create Comparison Video
          </h1>
          <p className="text-sm text-[#454745] mt-2 leading-relaxed">
            Enter 2 or 3 smartphones. The worker collects specifications, stops at Gate A (Manual mode) or runs Data Judge (Autopilot mode), computes rankings, and renders videos.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-[16px] bg-[#320707] text-[#ffd11a] text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <fieldset className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <legend className="text-xs font-bold text-[#595c58] uppercase tracking-wider">
                Comparison Mode &amp; Devices
              </legend>

              <div
                role="group"
                aria-label="Number of smartphones to compare"
                className="inline-flex items-center gap-1 p-1 rounded-full bg-[#f0f2ee] border border-[#d5dbd1] self-start"
              >
                {([2, 3] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={phoneCount === count}
                    onClick={() => setPhoneCount(count)}
                    className={`px-4 min-h-[38px] rounded-full text-xs font-bold transition-colors ${
                      phoneCount === count
                        ? 'bg-[#0e0f0c] text-[#ffffff]'
                        : 'text-[#454745] hover:text-[#0e0f0c]'
                    }`}
                  >
                    {count === 2 ? '2 Phones (1v1)' : '3 Phones (3-Way)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {phones.slice(0, phoneCount).map((phone, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-2.5"
                >
                  <div className="text-xs font-bold text-[#0e0f0c]">
                    Device #{idx + 1}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor={`brand-${idx}`} className="block text-[11px] font-bold text-[#595c58] mb-1">
                        Brand
                      </label>
                      <input
                        id={`brand-${idx}`}
                        type="text"
                        placeholder="Samsung"
                        value={phone.brand}
                        onChange={(e) => updatePhone(idx, 'brand', e.target.value)}
                        className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#ffffff] border border-[#595c58]/60 text-xs font-semibold text-[#0e0f0c]"
                      />
                    </div>
                    <div>
                      <label htmlFor={`model-${idx}`} className="block text-[11px] font-bold text-[#595c58] mb-1">
                        Model
                      </label>
                      <input
                        id={`model-${idx}`}
                        type="text"
                        placeholder="Galaxy S25"
                        value={phone.model}
                        onChange={(e) => updatePhone(idx, 'model', e.target.value)}
                        className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#ffffff] border border-[#595c58]/60 text-xs font-semibold text-[#0e0f0c]"
                      />
                    </div>
                    <div>
                      <label htmlFor={`variant-${idx}`} className="block text-[11px] font-bold text-[#595c58] mb-1">
                        Variant (optional)
                      </label>
                      <input
                        id={`variant-${idx}`}
                        type="text"
                        placeholder="8/256"
                        value={phone.variant}
                        onChange={(e) => updatePhone(idx, 'variant', e.target.value)}
                        className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#ffffff] border border-[#595c58]/60 text-xs font-semibold text-[#0e0f0c]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3 pt-4 border-t border-[#e8ebe6]">
            <legend className="text-xs font-bold text-[#595c58] uppercase tracking-wider">
              Output Formats
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                htmlFor="format-long"
                className={`p-4 min-h-[44px] rounded-[16px] border flex items-center justify-between gap-3 ${
                  formats.long ? 'bg-[#e2f6d5] border-[#054d28]' : 'bg-[#f8f9f7] border-[#d5dbd1]'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-[#0e0f0c]">16:9 Long Video</div>
                  <div className="text-xs text-[#454745] mt-0.5">Full category and benchmark breakdown</div>
                </div>
                <input
                  id="format-long"
                  type="checkbox"
                  checked={formats.long}
                  onChange={(e) => setFormats({ ...formats, long: e.target.checked })}
                  className="w-5 h-5"
                />
              </label>

              <label
                htmlFor="format-short"
                className={`p-4 min-h-[44px] rounded-[16px] border flex items-center justify-between gap-3 ${
                  formats.short ? 'bg-[#e2f6d5] border-[#054d28]' : 'bg-[#f8f9f7] border-[#d5dbd1]'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-[#0e0f0c]">9:16 Short Video</div>
                  <div className="text-xs text-[#454745] mt-0.5">YouTube Shorts cut (50 seconds max)</div>
                </div>
                <input
                  id="format-short"
                  type="checkbox"
                  checked={formats.short}
                  onChange={(e) => setFormats({ ...formats, short: e.target.checked })}
                  className="w-5 h-5"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-bold text-[#595c58] uppercase tracking-wider">
              Remotion Video Template
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'v3',
                  title: 'Template V3',
                  desc: 'Persistent stage, dynamic camera moves, overlapping transitions, parametric phone.',
                  badge: 'Latest',
                },
                {
                  id: 'v2',
                  title: 'Template V2',
                  desc: 'Persistent stage with camera moves and count-up score recap.',
                  badge: 'Standard',
                },
                {
                  id: 'v1',
                  title: 'Template V1',
                  desc: 'Classic column cards per segment with static stage.',
                  badge: 'Classic',
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={themePreset === t.id}
                  onClick={() => setThemePreset(t.id)}
                  className={`text-left p-4 rounded-[16px] border-2 flex flex-col justify-between ${
                    themePreset === t.id
                      ? 'bg-[#e2f6d5] border-[#054d28]'
                      : 'bg-[#f8f9f7] border-[#e8ebe6] hover:border-[#595c58]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 w-full">
                    <span className="text-xs font-bold text-[#0e0f0c]">{t.title}</span>
                    <span className="text-[11px] font-mono text-[#595c58]">{t.badge}</span>
                  </div>
                  <div className="text-xs text-[#454745] leading-relaxed">{t.desc}</div>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#e8ebe6]">
            <Link href="/" className="min-h-[44px] inline-flex items-center px-3 text-xs font-bold text-[#595c58] hover:text-[#0e0f0c] underline">
              Cancel
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="px-7 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] text-sm font-bold"
            >
              {loading ? 'Starting Pipeline...' : 'Start Comparison Pipeline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewComparisonPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto p-12 text-center text-xs font-bold text-[#595c58] bg-[#ffffff] rounded-[24px] border border-[#d5dbd1]">
          Loading comparison form...
        </div>
      }
    >
      <NewComparisonForm />
    </Suspense>
  );
}
