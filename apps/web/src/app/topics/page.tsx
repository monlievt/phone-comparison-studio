// apps/web/src/app/topics/page.tsx
'use client';

import { useEffect, useState } from 'react';

interface Topic {
  id: string;
  phoneNames: string[];
  score: number;
  reasons: string[];
  angle: string;
}

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadTopics = async () => {
    try {
      const res = await fetch('/api/topics');
      const data = await res.json();
      setTopics(data.topics || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopics();
  }, []);

  const handleAction = async (topicId: string, action: 'approve' | 'reject') => {
    setProcessingId(topicId);
    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId, action }),
      });
      if (res.ok) {
        setTopics((prev) => prev.filter((t) => t.id !== topicId));
      }
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Proposed Topics (Gate 0)</h1>
        <p className="text-sm text-slate-400 mt-1">
          Candidate phone pairs proposed by the Pair Finder algorithm based on price and performance closeness.
        </p>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading topics...</div>
      ) : topics.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#12151c] border border-[#1f2430] text-slate-400">
          No proposed topics waiting for review. The auto-discovery tracker will periodically add new candidates.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topics.map((t) => (
            <div key={t.id} className="p-6 rounded-2xl bg-[#12151c] border border-[#1f2430] space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-white">{t.phoneNames.join(' vs ')}</div>
                  <div className="text-xs text-blue-400 mt-1">{t.angle}</div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Score: {t.score}/100
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-400">Why this comparison:</div>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-0.5">
                  {t.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  disabled={processingId === t.id}
                  onClick={() => handleAction(t.id, 'approve')}
                  className="flex-1 py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white transition-colors disabled:opacity-50"
                >
                  {processingId === t.id ? 'Processing...' : 'Approve & Start Comparison'}
                </button>
                <button
                  disabled={processingId === t.id}
                  onClick={() => handleAction(t.id, 'reject')}
                  className="py-2 px-4 rounded-xl bg-[#1f2430] hover:bg-rose-500/20 hover:text-rose-400 font-semibold text-xs text-slate-400 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
