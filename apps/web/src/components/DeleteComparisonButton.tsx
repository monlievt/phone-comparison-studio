'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteComparisonButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/comparisons/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Confirm delete ${title}`}
          className="px-3.5 min-h-[44px] inline-flex items-center rounded-full bg-[#320707] hover:bg-[#4d0b0b] text-[#ffd11a] font-bold text-xs"
        >
          {deleting ? 'Deleting...' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="px-3 min-h-[44px] inline-flex items-center rounded-full bg-[#f0f2ee] text-[#0e0f0c] font-bold text-xs border border-[#d5dbd1]"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete comparison ${title}`}
        className="px-3.5 min-h-[44px] inline-flex items-center rounded-full bg-[#ffffff] hover:bg-[#fde8e8] text-[#d03238] font-bold text-xs border border-[#d5dbd1]"
      >
        Delete
      </button>
      {error && (
        <span role="alert" className="text-[11px] font-bold text-[#d03238]">
          {error}
        </span>
      )}
    </div>
  );
}
