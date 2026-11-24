'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Topic {
  id: string;
  phoneNames: string[];
  score: number;
  reasons: string[];
  angle: string;
}

interface Candidate {
  id: string;
  brand: string;
  model: string;
  source: string;
  source_url: string;
  status: string;
  announced_date?: string;
}

interface ResearchItem {
  query: string;
  opponent: string;
  demandScore: number;
  intent: 'generational' | 'rivalry' | 'budget_variant' | 'general';
}

type ActiveSection = 'pairs' | 'radar' | 'filters' | 'catalog';

export default function TopicsPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [discoveringAi, setDiscoveringAi] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveSection>('pairs');

  const [researchPhone, setResearchPhone] = useState('');
  const [researchResults, setResearchResults] = useState<ResearchItem[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [addingResearchId, setAddingResearchId] = useState<string | null>(null);

  const [priceBand, setPriceBand] = useState<'all' | 'budget' | 'midrange' | 'flagship'>('all');
  const [maxPriceGap, setMaxPriceGap] = useState<number>(150);
  const [maxTierGap, setMaxTierGap] = useState<number>(10);
  const [minScore, setMinScore] = useState<number>(60);
  const [limit, setLimit] = useState<number>(10);

  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

  const loadTopics = async () => {
    try {
      const res = await fetch('/api/topics');
      const data = await res.json();
      setTopics(data.topics || []);
    } finally {
      setLoading(false);
    }
  };

  const loadCandidates = async () => {
    try {
      const res = await fetch('/api/topics/candidates');
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    loadTopics();
    loadCandidates();
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
        const data = await res.json();
        setTopics((prev) => prev.filter((t) => t.id !== topicId));
        if (action === 'approve' && data.comparisonId) {
          router.push(`/comparisons/${data.comparisonId}`);
          return;
        }
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleScanReleases = async (mode: 'rss' | 'gemini' = 'rss') => {
    if (mode === 'gemini') setDiscoveringAi(true);
    else setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/topics/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (res.ok) {
        const s = data.summary || {};
        if (mode === 'gemini') {
          if (s.geminiError) {
            setScanResult(`Gemini discovery failed: ${s.geminiError}`);
          } else {
            const cacheNote = s.geminiFromCache ? ' (cached)' : '';
            setScanResult(
              `Gemini Search found ${s.geminiFound || 0} recent phones${cacheNote} (${s.inserted || 0} new, ${s.updated || 0} updated). Total catalog: ${data.totalCandidates} models.`
            );
          }
        } else {
          const feeds: Array<{ label: string; found: number; error?: string }> = s.feeds || [];
          const okCount = feeds.filter((f) => !f.error).length;
          const failedFeeds = feeds.filter((f) => f.error);
          if (failedFeeds.length === feeds.length && feeds.length > 0) {
            const sampleErr = failedFeeds[0]?.error || 'network unreachable';
            setScanResult(
              `All ${feeds.length} RSS/Atom feeds failed (${sampleErr}). Verify outbound internet access or try Discover via Gemini. Catalog: ${data.totalCandidates} models.`
            );
          } else {
            const sourceBreakdown = feeds
              .filter((f) => f.found > 0)
              .map((f) => `${f.label}: ${f.found}`)
              .join(', ');
            const errNote = failedFeeds.length > 0 ? ` (${failedFeeds.length} feed(s) unavailable)` : '';
            setScanResult(
              `Scanned ${okCount}/${feeds.length} RSS/Atom feeds${errNote}: found ${s.totalFound || 0} phones (${s.inserted || 0} new, ${s.updated || 0} updated)${sourceBreakdown ? ` [${sourceBreakdown}]` : ''}. Total catalog: ${data.totalCandidates} models.`
            );
          }
        }
        await loadCandidates();
      } else {
        setScanResult(`Scan failed: ${data.error}`);
      }
    } catch (err: unknown) {
      setScanResult(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
      setDiscoveringAi(false);
    }
  };

  const handleGeneratePairs = async () => {
    setGenerating(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/topics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceBand, maxPriceGap, maxTierGap, minScore, limit }),
      });
      const data = await res.json();
      if (res.ok) {
        setScanResult(`Generated ${data.generated} pairs (${data.newlyInserted} added to Gate 0).`);
        await loadTopics();
        setActiveTab('pairs');
      } else {
        const msg = typeof data.error === 'string' ? data.error : data.error?.message || 'Check filters';
        setScanResult(msg);
      }
    } catch (err: unknown) {
      setScanResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleResearchTrends = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!researchPhone.trim()) return;
    setResearchLoading(true);
    try {
      const res = await fetch(`/api/topics/research?phone=${encodeURIComponent(researchPhone.trim())}`);
      const data = await res.json();
      setResearchResults(data.suggestions || []);
    } catch (err: unknown) {
      setScanResult(`Search demand lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResearchLoading(false);
    }
  };

  const handleAddResearchedPair = async (item: ResearchItem) => {
    setAddingResearchId(item.query);
    try {
      const res = await fetch('/api/topics/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneA: researchPhone.trim(),
          phoneB: item.opponent,
          demandScore: item.demandScore,
          intent: item.intent,
        }),
      });
      if (res.ok) {
        setScanResult(`Added "${researchPhone} vs ${item.opponent}" to Gate 0.`);
        await loadTopics();
      }
    } finally {
      setAddingResearchId(null);
    }
  };

  const toggleCandidateSelection = (name: string) => {
    if (selectedCandidates.includes(name)) {
      setSelectedCandidates(selectedCandidates.filter((n) => n !== name));
    } else if (selectedCandidates.length >= 3) {
      setSelectedCandidates([...selectedCandidates.slice(1), name]);
    } else {
      setSelectedCandidates([...selectedCandidates, name]);
    }
  };

  const filteredCandidates = candidates.filter((c) =>
    `${c.brand} ${c.model}`.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0e0f0c] tracking-tight">
            Topics &amp; Gate 0
          </h1>
          <p className="text-[#454745] text-sm sm:text-base max-w-2xl mt-1">
            Approve proposed phone pairs, check YouTube search autocomplete demand, or pick 2 models from the tracked catalog.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleScanReleases('rss')}
            disabled={scanning || discoveringAi}
            className="px-4 min-h-[44px] rounded-full bg-[#ffffff] border border-[#0e0f0c] hover:bg-[#f6f7f5] text-xs font-bold text-[#0e0f0c]"
          >
            {scanning ? 'Scanning 7 Feeds...' : 'Scan RSS Feeds'}
          </button>

          <button
            type="button"
            onClick={() => handleScanReleases('gemini')}
            disabled={discoveringAi || scanning}
            className="px-4 min-h-[44px] rounded-full bg-[#e8ebe6] border border-[#d5dbd1] hover:bg-[#dce0da] text-xs font-bold text-[#0e0f0c]"
          >
            {discoveringAi ? 'Searching Gemini...' : 'Discover via Gemini'}
          </button>

          <Link
            href="/comparisons/new"
            className="px-5 min-h-[44px] inline-flex items-center rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
          >
            + Manual Entry
          </Link>
        </div>
      </div>

      {scanResult && (
        <div role="status" className="p-4 rounded-[16px] bg-[#ffffff] border border-[#d5dbd1] text-xs text-[#0e0f0c] flex items-center justify-between gap-3">
          <span className="font-semibold">{scanResult}</span>
          <button
            type="button"
            aria-label="Dismiss status message"
            onClick={() => setScanResult(null)}
            className="min-w-[36px] min-h-[36px] text-[#595c58] hover:text-[#0e0f0c] font-bold"
          >
            <span aria-hidden="true">X</span>
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Topics views" className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#ffffff] rounded-[24px] sm:rounded-full border border-[#d5dbd1] max-w-fit">
        {(
          [
            { id: 'pairs', label: `Proposed Pairs (${topics.length})` },
            { id: 'radar', label: 'YouTube Demand Radar' },
            { id: 'filters', label: 'Pair Criteria' },
            { id: 'catalog', label: `Catalog (${candidates.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 min-h-[44px] rounded-full text-xs font-bold transition-colors ${
              activeTab === tab.id
                ? 'bg-[#0e0f0c] text-white'
                : 'text-[#454745] hover:text-[#0e0f0c]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pairs' && (
        <div className="space-y-5">
          <div className="bg-[#ffffff] rounded-[24px] p-4 sm:p-5 border border-[#d5dbd1] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[#595c58] mr-1">Price band:</span>
              {(['all', 'budget', 'midrange', 'flagship'] as const).map((seg) => (
                <button
                  key={seg}
                  type="button"
                  aria-pressed={priceBand === seg}
                  onClick={() => setPriceBand(seg)}
                  className={`px-3.5 min-h-[44px] rounded-full text-xs font-bold ${
                    priceBand === seg
                      ? 'bg-[#0e0f0c] text-white'
                      : 'bg-[#f8f9f7] text-[#454745] hover:bg-[#e8ebe6]'
                  }`}
                >
                  {seg === 'all'
                    ? 'All'
                    : seg === 'budget'
                    ? 'Budget (<= $350)'
                    : seg === 'midrange'
                    ? 'Mid-range ($350 to $750)'
                    : 'Flagship (> $750)'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleGeneratePairs}
              disabled={generating}
              className="px-5 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] text-xs font-bold whitespace-nowrap"
            >
              {generating ? 'Calculating...' : 'Generate Pairs'}
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-[#595c58] bg-[#ffffff] rounded-[24px] border border-[#d5dbd1]">
              Loading proposed pairs...
            </div>
          ) : topics.length === 0 ? (
            <div className="p-12 text-center rounded-[24px] bg-[#ffffff] border border-[#d5dbd1] space-y-4">
              <h2 className="text-lg font-black text-[#0e0f0c]">No Pending Pairs in Gate 0</h2>
              <p className="text-xs text-[#454745] max-w-md mx-auto">
                Pairing requires phones with verified or estimated USD prices. RSS headlines rarely list USD prices, so click Discover via Gemini first (Autopilot runs this automatically when Gate 0 is empty), then click Generate Pairs.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleScanReleases('gemini')}
                  disabled={discoveringAi || scanning || generating}
                  className="px-6 min-h-[44px] rounded-full bg-[#0e0f0c] hover:bg-[#232620] text-[#9fe870] text-xs font-bold"
                >
                  {discoveringAi ? 'Searching Gemini...' : 'Discover Priced Phones (Gemini)'}
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePairs}
                  disabled={generating || discoveringAi}
                  className="px-6 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] text-xs font-bold"
                >
                  {generating ? 'Calculating...' : 'Generate Pairs Now'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {topics.map((t) => (
                <div
                  key={t.id}
                  className="bg-[#ffffff] rounded-[24px] p-6 border border-[#d5dbd1] flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-black text-[#0e0f0c] text-lg tracking-tight">
                          {t.phoneNames.join(' vs ')}
                        </h2>
                        <div className="text-xs text-[#454745] font-semibold mt-0.5">{t.angle}</div>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-black bg-[#e2f6d5] text-[#054d28] whitespace-nowrap">
                        {t.score}/100
                      </span>
                    </div>

                    <ul className="space-y-1.5 pt-3 border-t border-[#e8ebe6] text-xs text-[#454745]">
                      {t.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#054d28] mt-1.5 shrink-0" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center gap-2.5 pt-4 border-t border-[#e8ebe6]">
                    <button
                      type="button"
                      onClick={() => handleAction(t.id, 'approve')}
                      disabled={processingId === t.id}
                      className="flex-1 min-h-[44px] px-5 rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] text-xs font-bold"
                    >
                      {processingId === t.id ? 'Starting Pipeline...' : 'Approve & Start Pipeline'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(t.id, 'reject')}
                      disabled={processingId === t.id}
                      className="min-h-[44px] px-4 rounded-full bg-[#ffffff] border border-[#595c58]/60 hover:border-[#0e0f0c] text-[#454745] hover:text-[#0e0f0c] text-xs font-bold"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'radar' && (
        <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-6">
          <div className="border-b border-[#e8ebe6] pb-4">
            <h2 className="text-lg font-black text-[#0e0f0c]">YouTube Search Demand Radar</h2>
            <p className="text-xs text-[#595c58] mt-1">
              Queries YouTube autocomplete for &quot;&lt;phone&gt; vs ...&quot; so you can check what viewers actively search before starting a render.
            </p>
          </div>

          <form onSubmit={handleResearchTrends} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <label htmlFor="radar-phone" className="sr-only">
              Smartphone model to query
            </label>
            <input
              id="radar-phone"
              type="text"
              value={researchPhone}
              onChange={(e) => setResearchPhone(e.target.value)}
              placeholder="Enter phone model (e.g. Galaxy S25, POCO F6, Pixel 9)"
              className="flex-1 px-4 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-sm text-[#0e0f0c] font-semibold"
            />
            <button
              type="submit"
              disabled={researchLoading || !researchPhone.trim()}
              className="px-6 min-h-[44px] rounded-full bg-[#0e0f0c] hover:bg-[#2c2e28] text-white text-xs font-bold whitespace-nowrap"
            >
              {researchLoading ? 'Checking YouTube...' : 'Check Search Demand'}
            </button>
          </form>

          <div className="space-y-3">
            {researchLoading ? (
              <div className="p-10 text-center text-xs font-semibold text-[#595c58]">
                Fetching YouTube autocomplete suggestions...
              </div>
            ) : researchResults.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#595c58] bg-[#f8f9f7] rounded-[16px] border border-[#e8ebe6]">
                Enter a smartphone model above and click Check Search Demand to list YouTube comparison queries.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {researchResults.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="text-[#0e0f0c] font-bold text-sm">{item.query}</div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-[#054d28] bg-[#e2f6d5] px-2 py-0.5 rounded-full">
                          YouTube Suggest #{idx + 1}
                        </span>
                        <span className="text-[#595c58] capitalize">{item.intent.replace(/_/g, ' ')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddResearchedPair(item)}
                      disabled={addingResearchId === item.query}
                      className="px-4 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] text-xs font-bold whitespace-nowrap"
                    >
                      {addingResearchId === item.query ? 'Adding...' : '+ Add to Gate 0'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'filters' && (
        <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-6">
          <div className="border-b border-[#e8ebe6] pb-4">
            <h2 className="text-lg font-black text-[#0e0f0c]">Pair Matching Filters</h2>
            <p className="text-xs text-[#595c58] mt-1">
              Score weights: price closeness 30%, SoC similarity 30%, recency 15%, data coverage 15%, brand rivalry 10%.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="filter-band" className="block text-xs font-bold text-[#454745]">
                Price segment
              </label>
              <select
                id="filter-band"
                value={priceBand}
                onChange={(e) => setPriceBand(e.target.value as 'all' | 'budget' | 'midrange' | 'flagship')}
                className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs text-[#0e0f0c] font-semibold"
              >
                <option value="all">All segments</option>
                <option value="budget">Budget (&lt;= $350)</option>
                <option value="midrange">Mid-range ($350 to $750)</option>
                <option value="flagship">Flagship (&gt; $750)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="filter-price-gap" className="block text-xs font-bold text-[#454745]">
                Max price gap
              </label>
              <select
                id="filter-price-gap"
                value={maxPriceGap}
                onChange={(e) => setMaxPriceGap(Number(e.target.value))}
                className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs text-[#0e0f0c] font-semibold"
              >
                <option value={50}>Within $50</option>
                <option value={100}>Within $100</option>
                <option value={150}>Within $150</option>
                <option value={250}>Within $250</option>
                <option value={500}>Within $500</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="filter-tier-gap" className="block text-xs font-bold text-[#454745]">
                Max SoC tier gap (0 to 100 scale)
              </label>
              <select
                id="filter-tier-gap"
                value={maxTierGap}
                onChange={(e) => setMaxTierGap(Number(e.target.value))}
                className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs text-[#0e0f0c] font-semibold"
              >
                <option value={5}>Tight (within 5 points)</option>
                <option value={10}>Standard (within 10 points)</option>
                <option value={20}>Broad (within 20 points)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="filter-min-score" className="block text-xs font-bold text-[#454745]">
                Min match score
              </label>
              <select
                id="filter-min-score"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs text-[#0e0f0c] font-semibold"
              >
                <option value={50}>50/100</option>
                <option value={60}>60/100 (default)</option>
                <option value={70}>70/100</option>
                <option value={80}>80/100</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="filter-limit" className="block text-xs font-bold text-[#454745]">
                Pairs to generate
              </label>
              <select
                id="filter-limit"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full px-3.5 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs text-[#0e0f0c] font-semibold"
              >
                <option value={5}>5 pairs</option>
                <option value={10}>10 pairs</option>
                <option value={20}>20 pairs</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-[#e8ebe6]">
            <button
              type="button"
              onClick={handleGeneratePairs}
              disabled={generating}
              className="px-7 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] text-xs font-bold"
            >
              {generating ? 'Calculating...' : 'Run Pair Finder'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'catalog' && (
        <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e8ebe6] pb-4">
            <div>
              <h2 className="text-lg font-black text-[#0e0f0c]">
                Tracked Phone Catalog ({candidates.length})
              </h2>
              <p className="text-xs text-[#595c58] mt-0.5">
                Select 2 or 3 devices ({selectedCandidates.length}/3 selected) to open the New Comparison form pre-filled.
              </p>
            </div>

            {selectedCandidates.length >= 2 && (
              <Link
                href={`/comparisons/new?phone1=${encodeURIComponent(selectedCandidates[0])}&phone2=${encodeURIComponent(selectedCandidates[1])}${selectedCandidates[2] ? `&phone3=${encodeURIComponent(selectedCandidates[2])}` : ''}`}
                className="px-5 min-h-[44px] inline-flex items-center rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] text-xs font-bold"
              >
                Compare {selectedCandidates.length} Phones ({selectedCandidates.join(' vs ')})
              </Link>
            )}
          </div>

          <div>
            <label htmlFor="catalog-search" className="sr-only">
              Search catalog by brand or model
            </label>
            <input
              id="catalog-search"
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search by brand or model name..."
              className="w-full px-4 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs font-semibold text-[#0e0f0c]"
            />
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-[#e8ebe6] border border-[#e8ebe6] rounded-[16px]">
            {filteredCandidates.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#595c58]">
                No models match your search.
              </div>
            ) : (
              filteredCandidates.map((c) => {
                const fullName = `${c.brand} ${c.model}`;
                const isSelected = selectedCandidates.includes(fullName);
                return (
                  <label
                    key={c.id}
                    className={`px-4 py-3 min-h-[44px] flex items-center justify-between gap-3 text-xs ${
                      isSelected ? 'bg-[#e2f6d5]' : 'hover:bg-[#f8f9f7]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCandidateSelection(fullName)}
                        className="w-4 h-4"
                      />
                      <span className="text-[#0e0f0c] font-bold text-sm">{fullName}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#e8ebe6] text-[#454745] font-semibold uppercase">
                        {c.source}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[#595c58]">
                      <span className="capitalize">{c.status}</span>
                      {c.source_url && (
                        <a
                          href={c.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#0e0f0c] underline font-semibold"
                        >
                          Source
                        </a>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
