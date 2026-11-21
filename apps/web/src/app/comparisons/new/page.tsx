// apps/web/src/app/comparisons/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewComparisonPage() {
  const router = useRouter();

  const [phones, setPhones] = useState([
    { brand: 'Samsung', model: 'Galaxy S25' },
    { brand: 'Xiaomi', model: '15' },
    { brand: '', model: '' },
  ]);

  const [formats, setFormats] = useState({
    long: true,
    short: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePhone = (index: number, field: 'brand' | 'model', value: string) => {
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

    // Filter valid phones (must have brand and model)
    const validPhones = phones.filter((p) => p.brand.trim() && p.model.trim());

    if (validPhones.length < 2) {
      setError('Please provide at least 2 valid smartphones to compare.');
      setLoading(false);
      return;
    }

    const selectedFormats = Object.entries(formats)
      .filter(([_, enabled]) => enabled)
      .map(([f]) => f);

    try {
      const res = await fetch('/api/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones: validPhones,
          formats: selectedFormats,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create comparison');
      }

      // Redirect to comparison review page
      router.push(`/comparisons/${data.comparisonId}`);
    } catch (err: any) {
      setError(err?.message ?? 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Create New Video Comparison</h1>
        <p className="text-sm text-slate-400 mt-1">
          Enter 2 or 3 smartphones. The studio will automatically collect manufacturer specifications, calculate rankings, and generate video scripts.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* Phones inputs */}
        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">
            Smartphones to Compare (2 or 3)
          </label>

          {phones.map((phone, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-[#12151c] border border-[#1f2430] flex items-center gap-4"
            >
              <div className="w-8 h-8 rounded-full bg-[#181d26] border border-[#1f2430] flex items-center justify-center font-bold text-xs text-slate-300">
                #{idx + 1}
              </div>

              <div className="flex-1 grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Brand (e.g. Samsung)"
                  value={phone.brand}
                  onChange={(e) => updatePhone(idx, 'brand', e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#181d26] border border-[#1f2430] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder={idx === 2 ? 'Model (Optional)' : 'Model (e.g. S25 Ultra)'}
                  value={phone.model}
                  onChange={(e) => updatePhone(idx, 'model', e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#181d26] border border-[#1f2430] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Video format checkboxes */}
        <div className="p-5 rounded-2xl bg-[#12151c] border border-[#1f2430] space-y-3">
          <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">
            Target Video Formats
          </label>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={formats.long}
                onChange={(e) => setFormats({ ...formats, long: e.target.checked })}
                className="w-4 h-4 rounded border-[#1f2430] text-blue-600 focus:ring-0 bg-[#181d26]"
              />
              <span>Long Video (16:9 Landscape - YouTube)</span>
            </label>

            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={formats.short}
                onChange={(e) => setFormats({ ...formats, short: e.target.checked })}
                className="w-4 h-4 rounded border-[#1f2430] text-blue-600 focus:ring-0 bg-[#181d26]"
              />
              <span>Short Video (9:16 Vertical - YouTube Shorts)</span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-sm text-white transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating Comparison & Queuing Collector...' : 'Start Automatic Comparison'}
        </button>
      </form>
    </div>
  );
}
