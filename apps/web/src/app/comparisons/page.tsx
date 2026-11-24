import Link from 'next/link';
import { getDb } from '@/lib/db';
import DeleteComparisonButton from '@/components/DeleteComparisonButton';

export const dynamic = 'force-dynamic';

export default async function ComparisonsListPage() {
  const db = getDb();

  const comparisons = db
    .prepare('SELECT id, title, status, phone_ids_json, created_at, updated_at FROM comparisons ORDER BY updated_at DESC')
    .all() as Array<{
    id: string;
    title: string | null;
    status: string;
    phone_ids_json: string;
    created_at: string;
    updated_at: string;
  }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0e0f0c] tracking-tight">
            Comparison Videos
          </h1>
          <p className="text-[#454745] text-sm sm:text-base max-w-xl mt-1">
            All comparison runs. Open any row to review Gate A specs, watch Gate B previews, or dispatch final renders.
          </p>
        </div>

        <Link
          href="/comparisons/new"
          className="px-6 min-h-[44px] inline-flex items-center rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-sm self-start sm:self-auto"
        >
          + New Video
        </Link>
      </div>

      <div className="bg-[#ffffff] rounded-[24px] border border-[#d5dbd1] overflow-hidden">
        {comparisons.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#454745] space-y-3">
            <p className="font-bold text-[#0e0f0c]">No comparison runs yet.</p>
            <p className="text-xs text-[#595c58]">Create a manual comparison or approve a proposed pair in Topics.</p>
            <Link
              href="/comparisons/new"
              className="inline-flex items-center px-5 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
            >
              Create first comparison
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile card layout to avoid horizontal clipping on narrow screens */}
            <div className="md:hidden divide-y divide-[#e8ebe6]">
              {comparisons.map((c) => {
                const isError = ['FAILED', 'FAILED_QA', 'SKIPPED_LOW_DATA', 'CANCELLED'].includes(c.status);
                const isComplete = ['FINAL_RENDERED', 'METADATA_READY', 'HANDED_OFF', 'PUBLISHED'].includes(c.status);
                const needsReview = ['COLLECTED', 'GATE_A', 'PREVIEW_RENDERED', 'GATE_B'].includes(c.status);

                return (
                  <div key={c.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/comparisons/${c.id}`} className="group min-w-0 flex-1">
                        <div className="text-sm font-black text-[#0e0f0c] group-hover:underline break-words">
                          {c.title || 'Untitled Comparison'}
                        </div>
                        <div className="text-[11px] text-[#595c58] mt-0.5 font-mono truncate">
                          {c.id}
                        </div>
                      </Link>
                      <span
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          isError
                            ? 'bg-[#320707] text-[#ffd11a]'
                            : isComplete
                            ? 'bg-[#e2f6d5] text-[#054d28]'
                            : needsReview
                            ? 'bg-[#9fe870] text-[#0e0f0c]'
                            : 'bg-[#fff8eb] text-[#7a5901]'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-[#595c58]">
                      <span>Updated {new Date(c.updated_at).toLocaleTimeString()}</span>
                      <div className="flex items-center gap-2">
                        <DeleteComparisonButton id={c.id} title={c.title || c.id} />
                        <Link
                          href={`/comparisons/${c.id}`}
                          className="px-4 min-h-[44px] inline-flex items-center rounded-full bg-[#f0f2ee] hover:bg-[#0e0f0c] text-[#0e0f0c] hover:text-[#ffffff] font-bold text-xs border border-[#d5dbd1]"
                        >
                          Open Deck
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8f9f7] text-[#0e0f0c] font-bold uppercase text-[11px] border-b border-[#e8ebe6]">
                  <tr>
                    <th className="px-5 py-3.5">Comparison</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Created</th>
                    <th className="px-5 py-3.5">Updated</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8ebe6]">
                  {comparisons.map((c) => {
                    const isError = ['FAILED', 'FAILED_QA', 'SKIPPED_LOW_DATA', 'CANCELLED'].includes(c.status);
                    const isComplete = ['FINAL_RENDERED', 'METADATA_READY', 'HANDED_OFF', 'PUBLISHED'].includes(c.status);
                    const needsReview = ['COLLECTED', 'GATE_A', 'PREVIEW_RENDERED', 'GATE_B'].includes(c.status);

                    return (
                      <tr key={c.id} className="hover:bg-[#f8f9f7] transition-colors">
                        <td className="px-5 py-4 align-middle">
                          <Link href={`/comparisons/${c.id}`} className="group block">
                            <div className="text-sm font-black text-[#0e0f0c] group-hover:underline">
                              {c.title || 'Untitled Comparison'}
                            </div>
                            <div className="text-xs text-[#595c58] mt-0.5 font-mono">
                              {c.id}
                            </div>
                          </Link>
                        </td>
                        <td className="px-5 py-4 align-middle">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold ${
                              isError
                                ? 'bg-[#320707] text-[#ffd11a]'
                                : isComplete
                                ? 'bg-[#e2f6d5] text-[#054d28]'
                                : needsReview
                                ? 'bg-[#9fe870] text-[#0e0f0c]'
                                : 'bg-[#fff8eb] text-[#7a5901]'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-middle text-[#595c58]">
                          {new Date(c.created_at).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 align-middle text-[#595c58]">
                          {new Date(c.updated_at).toLocaleTimeString()}
                        </td>
                        <td className="px-5 py-4 align-middle text-right">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <DeleteComparisonButton id={c.id} title={c.title || c.id} />
                            <Link
                              href={`/comparisons/${c.id}`}
                              className="px-4 min-h-[44px] inline-flex items-center rounded-full bg-[#f0f2ee] hover:bg-[#0e0f0c] text-[#0e0f0c] hover:text-[#ffffff] font-bold text-xs border border-[#d5dbd1]"
                            >
                              Open Deck
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
