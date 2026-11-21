// apps/web/src/app/comparisons/[id]/page.tsx
'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';

export default function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ phoneId: string; categoryKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    try {
      const res = await fetch(`/api/comparisons/${id}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSaveSpec = async (phoneId: string, categoryKey: string) => {
    await fetch(`/api/comparisons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_spec',
        specUpdates: { phoneId, categoryKey, rawValue: editValue },
      }),
    });
    setEditingCell(null);
    loadData();
  };

  const handleApproveGateA = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/comparisons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_gate_a' }),
      });
      loadData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveGateB = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/comparisons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_gate_b' }),
      });
      loadData();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="text-slate-400 text-sm">Loading comparison details...</div>;
  }

  if (!data?.comparison) {
    return <div className="text-rose-400 text-sm">Comparison not found</div>;
  }

  const { comparison, phones, specs, copy } = data;
  const isGateA = ['CREATED', 'COLLECTED', 'DATA_APPROVED'].includes(comparison.status);
  const isGateB = ['COPY_READY', 'VIDEO_APPROVED', 'HANDED_OFF'].includes(comparison.status);

  // Group specs by category key
  const categoryKeys = Array.from(new Set(specs.map((s: any) => s.category_key))) as string[];

  return (
    <div className="space-y-8">
      {/* Header bar */}
      <div className="flex items-start justify-between border-b border-[#1f2430] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-white">{comparison.title}</h1>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
              {comparison.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono">ID: {comparison.id}</div>
        </div>

        {/* Action Button */}
        {comparison.status === 'COLLECTED' && (
          <button
            onClick={handleApproveGateA}
            disabled={actionLoading}
            className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
          >
            {actionLoading ? 'Processing...' : 'Approve Gate A (Data & Verdict)'}
          </button>
        )}

        {comparison.status === 'COPY_READY' && (
          <button
            onClick={handleApproveGateB}
            disabled={actionLoading}
            className="py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors"
          >
            {actionLoading ? 'Processing...' : 'Approve Gate B & Publish to ytagent'}
          </button>
        )}
      </div>

      {/* GATE A: SPECIFICATIONS MATRIX */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Gate A: Specifications Review & Confidence Matrix</span>
            <span className="text-xs font-normal text-slate-400">
              (Green = Official Verified, Yellow = Secondary, Red = Unverified/Conflict)
            </span>
          </h2>
        </div>

        <div className="rounded-2xl bg-[#12151c] border border-[#1f2430] overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-[#181d26] text-xs font-semibold uppercase text-slate-400 border-b border-[#1f2430]">
              <tr>
                <th className="px-6 py-4 w-1/4">Specification Category</th>
                {phones.map((p: any) => (
                  <th key={p.id} className="px-6 py-4">
                    <div className="text-white font-bold">{p.brand} {p.model}</div>
                    <div className="text-[11px] text-slate-400 font-normal">
                      {p.image_status === 'ok' ? '📷 Official Photo' : '🎨 Parametric Mockup'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2430]">
              {categoryKeys.length === 0 ? (
                <tr>
                  <td colSpan={phones.length + 1} className="px-6 py-8 text-center text-slate-500">
                    Specs are currently being collected by the worker. Please wait a few seconds...
                  </td>
                </tr>
              ) : (
                categoryKeys.map((catKey) => (
                  <tr key={catKey} className="hover:bg-[#181d26]/40">
                    <td className="px-6 py-3 font-medium text-slate-300 capitalize text-xs">
                      {catKey.replace(/_/g, ' ')}
                    </td>
                    {phones.map((p: any) => {
                      const spec = specs.find((s: any) => s.phone_id === p.id && s.category_key === catKey);
                      const isEditing = editingCell?.phoneId === p.id && editingCell?.categoryKey === catKey;
                      const conf = spec?.confidence ?? 0;

                      return (
                        <td key={p.id} className="px-6 py-3">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="px-2 py-1 rounded bg-[#181d26] border border-blue-500 text-xs text-white"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveSpec(p.id, catKey)}
                                className="text-xs text-emerald-400 hover:underline"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingCell(null)}
                                className="text-xs text-slate-500 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between group">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    conf >= 0.8
                                      ? 'bg-emerald-500'
                                      : conf >= 0.4
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                  title={`Confidence: ${Math.round(conf * 100)}%`}
                                />
                                <span className="text-xs text-white">{spec?.raw_value || 'N/A'}</span>
                              </div>
                              <button
                                onClick={() => {
                                  setEditingCell({ phoneId: p.id, categoryKey: catKey });
                                  setEditValue(spec?.raw_value || '');
                                }}
                                className="opacity-0 group-hover:opacity-100 text-[11px] text-blue-400 hover:underline"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* GATE B: COPY & YOUTUBE ASSETS */}
      {copy && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Gate B: YouTube Copy & Hook Editor</h2>
          <div className="p-6 rounded-2xl bg-[#12151c] border border-[#1f2430] space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">
                Generated Titles (Selected First)
              </label>
              <div className="mt-2 space-y-2">
                {copy.titles.map((title: string, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#181d26] border border-[#1f2430] text-sm text-white flex items-center justify-between"
                  >
                    <span>{title}</span>
                    <span className="text-xs text-slate-500 font-mono">{title.length}/60 chars</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">
                Short Hook (&le; 40 characters)
              </label>
              <input
                type="text"
                value={copy.hook}
                readOnly
                className="mt-1 w-full px-3 py-2 rounded-xl bg-[#181d26] border border-[#1f2430] text-sm text-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">
                Video Description
              </label>
              <textarea
                rows={4}
                value={copy.description}
                readOnly
                className="mt-1 w-full p-3 rounded-xl bg-[#181d26] border border-[#1f2430] text-xs text-slate-300 font-mono"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
