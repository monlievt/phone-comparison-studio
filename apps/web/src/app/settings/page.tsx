'use client';

import { useState, useEffect } from 'react';

interface TestResult {
  testing: boolean;
  success?: boolean;
  latencyMs?: number;
  message?: string;
}

interface BrandPolicyRow {
  brand: string;
  termsUrl: string;
  allowed: boolean | null;
  allowsModification: boolean;
  logoAllowed: boolean;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'autopilot' | 'brands'>('keys');

  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [hasGemini, setHasGemini] = useState(false);
  const [hasGroq, setHasGroq] = useState(false);
  const [ytagentUrl, setYtagentUrl] = useState('http://127.0.0.1:8000');
  const [ytagentChannel, setYtagentChannel] = useState('');
  const [showKeys, setShowKeys] = useState(false);

  const [savingKeys, setSavingKeys] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [geminiTest, setGeminiTest] = useState<TestResult>({ testing: false });
  const [groqTest, setGroqTest] = useState<TestResult>({ testing: false });
  const [ytagentTest, setYtagentTest] = useState<TestResult>({ testing: false });

  const [pipelineMode, setPipelineMode] = useState<'autopilot' | 'manual'>('manual');
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [videosPerWeek, setVideosPerWeek] = useState(4);
  const [topicScoreMin, setTopicScoreMin] = useState(60);
  const [minCategories, setMinCategories] = useState(8);
  const [minConfidence, setMinConfidence] = useState(0.8);
  const [holdHours, setHoldHours] = useState(24);
  const [maxConsecutiveFailures, setMaxConsecutiveFailures] = useState(2);
  const [defaultTemplate, setDefaultTemplate] = useState<'v1' | 'v2' | 'v3'>('v3');
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [runningAutopilot, setRunningAutopilot] = useState(false);

  const [brands, setBrands] = useState<BrandPolicyRow[]>([]);
  const [savingBrands, setSavingBrands] = useState(false);

  useEffect(() => {
    fetch('/api/settings/keys')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setHasGemini(Boolean(data.hasGemini));
        setHasGroq(Boolean(data.hasGroq));
        if (data.geminiApiKeyMasked) setGeminiKey(data.geminiApiKeyMasked);
        if (data.groqApiKeyMasked) setGroqKey(data.groqApiKeyMasked);
        if (data.ytagentBaseUrl) setYtagentUrl(data.ytagentBaseUrl);
        if (data.ytagentChannelName) setYtagentChannel(data.ytagentChannelName);
      })
      .catch(() => {});

    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const ap = data.settings?.autopilot;
        if (ap) {
          setPipelineMode(ap.mode ?? 'manual');
          setAutopilotEnabled(Boolean(ap.enabled));
          setVideosPerWeek(ap.videosPerWeek ?? 4);
          setTopicScoreMin(ap.topicScoreMin ?? 60);
          setMinCategories(ap.minCategories ?? 8);
          setMinConfidence(ap.minConfidence ?? 0.8);
          setHoldHours(ap.holdHours ?? 24);
          setMaxConsecutiveFailures(ap.maxConsecutiveFailures ?? 2);
          setDefaultTemplate(ap.defaultTemplate ?? 'v3');
        }
        setIsPaused(Boolean(data.isEffectivelyPaused));
        setPauseReason(data.settings?.autopilotPauseReason ?? null);
        if (Array.isArray(data.brands)) {
          setBrands(data.brands);
        }
      })
      .catch(() => {});
  }, []);

  const showToast = (msg: string) => {
    setSaveError(null);
    setSaveSuccess(msg);
    setTimeout(() => setSaveSuccess(null), 4000);
  };

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKeys(true);
    setSaveError(null);

    try {
      const payload: Record<string, string> = {
        ytagentBaseUrl: ytagentUrl,
        ytagentChannelName: ytagentChannel,
      };
      // Only send a key when user replaced the masked value
      if (geminiKey && !geminiKey.includes('••••')) payload.geminiApiKey = geminiKey;
      if (groqKey && !groqKey.includes('••••')) payload.groqApiKey = groqKey;

      const res = await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to save keys';
        throw new Error(msg);
      }

      if (payload.geminiApiKey) setHasGemini(true);
      if (payload.groqApiKey) setHasGroq(true);
      showToast('API credentials saved to .env');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save keys');
    } finally {
      setSavingKeys(false);
    }
  };

  const handleSaveAutopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autopilot: {
            mode: pipelineMode,
            enabled: autopilotEnabled,
            videosPerWeek,
            topicScoreMin,
            minCategories,
            minConfidence,
            holdHours,
            maxConsecutiveFailures,
            defaultTemplate,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to save autopilot settings');
      showToast('Autopilot and pipeline settings saved to SQLite');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save autopilot settings');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleRunAutopilotNow = async (enableAndResume: boolean) => {
    setRunningAutopilot(true);
    setSaveError(null);
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
      setPipelineMode('autopilot');
      setAutopilotEnabled(true);
      setIsPaused(false);
      setPauseReason(null);
      showToast(
        data.alreadyQueued
          ? 'Autopilot cycle is already queued for the worker'
          : 'Autopilot cycle queued (worker will pick it up in ~2s)'
      );
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to trigger Autopilot');
    } finally {
      setRunningAutopilot(false);
    }
  };

  const handleTogglePause = async () => {
    setSavingPolicy(true);
    setSaveError(null);
    try {
      const nextPause = !isPaused;
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pauseFile: nextPause, resetFailures: !nextPause }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to toggle pause');
      setIsPaused(Boolean(data.isEffectivelyPaused));
      setPauseReason(data.settings?.autopilotPauseReason ?? null);
      showToast(nextPause ? 'Autopilot paused (data/PAUSE created)' : 'Autopilot resumed and failure count reset');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to toggle pause');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleSaveBrands = async () => {
    setSavingBrands(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to save brand terms');
      showToast('Brand image licensing policy saved');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save brand terms');
    } finally {
      setSavingBrands(false);
    }
  };

  const updateBrandAllowed = (idx: number, val: string) => {
    setBrands((prev) => {
      const next = [...prev];
      const allowed = val === 'true' ? true : val === 'false' ? false : null;
      next[idx] = { ...next[idx], allowed };
      return next;
    });
  };

  const handleTestConnection = async (target: 'gemini' | 'groq' | 'ytagent') => {
    const setter = target === 'gemini' ? setGeminiTest : target === 'groq' ? setGroqTest : setYtagentTest;
    setter({ testing: true });
    try {
      const payload: Record<string, string> = { provider: target, target };
      if (target === 'gemini' && geminiKey && !geminiKey.includes('••••')) payload.apiKey = geminiKey;
      if (target === 'groq' && groqKey && !groqKey.includes('••••')) payload.apiKey = groqKey;
      if (target === 'ytagent') {
        payload.baseUrl = ytagentUrl;
        payload.url = ytagentUrl;
      }

      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setter({ testing: false, success: data.success, latencyMs: data.latencyMs, message: data.message });
    } catch (err: unknown) {
      setter({ testing: false, success: false, message: err instanceof Error ? err.message : 'Network test failed' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0e0f0c] tracking-tight">
            Studio Settings
          </h1>
          <p className="text-sm text-[#454745] mt-1">
            Configure LLM keys, ytagent publisher connection, Autopilot vs Manual mode, and per-brand image terms.
          </p>
        </div>

        <div role="tablist" aria-label="Settings sections" className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#ffffff] border border-[#d5dbd1] rounded-[24px] sm:rounded-full">
          {(['keys', 'autopilot', 'brands'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 min-h-[44px] rounded-full text-xs font-bold transition-colors ${
                activeTab === tab
                  ? 'bg-[#0e0f0c] text-white'
                  : 'text-[#454745] hover:text-[#0e0f0c]'
              }`}
            >
              {tab === 'keys' ? 'API Credentials' : tab === 'autopilot' ? 'Autopilot Policy' : 'Brand Image Terms'}
            </button>
          ))}
        </div>
      </div>

      {saveSuccess && (
        <div role="status" className="p-4 rounded-[16px] bg-[#e2f6d5] border border-[#054d28] text-[#054d28] text-xs font-bold">
          {saveSuccess}
        </div>
      )}
      {saveError && (
        <div role="alert" className="p-4 rounded-[16px] bg-[#320707] text-[#ffd11a] text-xs font-bold">
          {saveError}
        </div>
      )}

      {activeTab === 'keys' && (
        <form onSubmit={handleSaveKeys} className="space-y-6">
          <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#e8ebe6] pb-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-[#0e0f0c]">
                  <span>Google Gemini API</span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#e2f6d5] text-[#054d28] font-bold">
                    {hasGemini ? 'Configured' : 'Primary'}
                  </span>
                </div>
                <div className="text-xs text-[#595c58] mt-0.5">
                  Used for spec extraction and copy generation via Google AI Studio free tier.
                </div>
              </div>
              <a
                href="https://aistudio.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#0e0f0c] underline"
              >
                Open Google AI Studio
              </a>
            </div>

            <div className="space-y-2">
              <label htmlFor="gemini-key" className="block text-xs font-bold text-[#454745]">
                GEMINI_API_KEY
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  id="gemini-key"
                  type={showKeys ? 'text' : 'password'}
                  placeholder={hasGemini ? 'Configured (enter a new key to replace)' : 'AIzaSy...'}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="flex-1 px-4 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs font-semibold text-[#0e0f0c]"
                />
                <button
                  type="button"
                  disabled={geminiTest.testing || (!geminiKey.trim() && !hasGemini)}
                  onClick={() => handleTestConnection('gemini')}
                  className="px-5 min-h-[44px] rounded-full bg-[#e8ebe6] hover:bg-[#dbe0d8] text-xs font-bold text-[#0e0f0c] whitespace-nowrap"
                >
                  {geminiTest.testing ? 'Testing...' : 'Test Gemini'}
                </button>
              </div>
              {geminiTest.message && (
                <div
                  className={`p-3 rounded-[12px] text-xs font-medium ${
                    geminiTest.success ? 'bg-[#e2f6d5] text-[#054d28]' : 'bg-[#320707] text-[#ffd11a]'
                  }`}
                >
                  {geminiTest.message}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#e8ebe6] pb-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-[#0e0f0c]">
                  <span>Groq Cloud API</span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#e8ebe6] text-[#0e0f0c] font-bold">
                    {hasGroq ? 'Configured' : 'Fallback'}
                  </span>
                </div>
                <div className="text-xs text-[#595c58] mt-0.5">
                  Free tier fallback when Gemini hits quota or returns an error.
                </div>
              </div>
              <a
                href="https://console.groq.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#0e0f0c] underline"
              >
                Open Groq Console
              </a>
            </div>

            <div className="space-y-2">
              <label htmlFor="groq-key" className="block text-xs font-bold text-[#454745]">
                GROQ_API_KEY
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  id="groq-key"
                  type={showKeys ? 'text' : 'password'}
                  placeholder={hasGroq ? 'Configured (enter a new key to replace)' : 'gsk_...'}
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  className="flex-1 px-4 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs font-semibold text-[#0e0f0c]"
                />
                <button
                  type="button"
                  disabled={groqTest.testing || (!groqKey.trim() && !hasGroq)}
                  onClick={() => handleTestConnection('groq')}
                  className="px-5 min-h-[44px] rounded-full bg-[#e8ebe6] hover:bg-[#dbe0d8] text-xs font-bold text-[#0e0f0c] whitespace-nowrap"
                >
                  {groqTest.testing ? 'Testing...' : 'Test Groq'}
                </button>
              </div>
              {groqTest.message && (
                <div
                  className={`p-3 rounded-[12px] text-xs font-medium ${
                    groqTest.success ? 'bg-[#e2f6d5] text-[#054d28]' : 'bg-[#320707] text-[#ffd11a]'
                  }`}
                >
                  {groqTest.message}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-4">
            <div className="border-b border-[#e8ebe6] pb-3">
              <h2 className="text-sm font-black text-[#0e0f0c]">YouTube Publisher Bridge (ytagent)</h2>
              <p className="text-xs text-[#595c58] mt-0.5">
                Connects to your local ytagent service for Long and Short handoff.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="ytagent-url" className="block text-xs font-bold text-[#454745]">
                  YTAGENT_BASE_URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="ytagent-url"
                    type="text"
                    value={ytagentUrl}
                    onChange={(e) => setYtagentUrl(e.target.value)}
                    className="flex-1 px-4 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs font-semibold text-[#0e0f0c]"
                  />
                  <button
                    type="button"
                    disabled={ytagentTest.testing}
                    onClick={() => handleTestConnection('ytagent')}
                    className="px-4 min-h-[44px] rounded-full bg-[#e8ebe6] hover:bg-[#dbe0d8] text-xs font-bold text-[#0e0f0c] whitespace-nowrap"
                  >
                    {ytagentTest.testing ? 'Checking...' : 'Check Ping'}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ytagent-channel" className="block text-xs font-bold text-[#454745]">
                  Target YouTube Channel Name
                </label>
                <input
                  id="ytagent-channel"
                  type="text"
                  placeholder="phone-reviews"
                  value={ytagentChannel}
                  onChange={(e) => setYtagentChannel(e.target.value)}
                  className="w-full px-4 min-h-[44px] rounded-[12px] bg-[#f8f9f7] border border-[#595c58]/60 text-xs font-semibold text-[#0e0f0c]"
                />
              </div>
            </div>

            {ytagentTest.message && (
              <div
                className={`p-3 rounded-[12px] text-xs font-medium ${
                  ytagentTest.success ? 'bg-[#e2f6d5] text-[#054d28]' : 'bg-[#320707] text-[#ffd11a]'
                }`}
              >
                {ytagentTest.message}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <label htmlFor="show-keys" className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#454745]">
              <input
                id="show-keys"
                type="checkbox"
                checked={showKeys}
                onChange={(e) => setShowKeys(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Show typed key text</span>
            </label>

            <button
              type="submit"
              disabled={savingKeys}
              className="px-7 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
            >
              {savingKeys ? 'Saving...' : 'Save API Credentials'}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'autopilot' && (
        <form onSubmit={handleSaveAutopilot} className="space-y-6">
          <div
            className={`rounded-[24px] p-6 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isPaused ? 'bg-[#320707] text-white border-[#d03238]' : 'bg-[#ffffff] border-[#d5dbd1]'
            }`}
          >
            <div>
              <div className="text-sm font-black">
                {isPaused ? 'Autopilot Status: PAUSED' : 'Autopilot Kill Switch: Armed'}
              </div>
              <p className={`text-xs mt-1 ${isPaused ? 'text-[#ffd11a]' : 'text-[#595c58]'}`}>
                {isPaused
                  ? pauseReason || 'data/PAUSE file or safety brake is active.'
                  : 'Pausing creates data/PAUSE and halts all unattended Autopilot runs.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleRunAutopilotNow(true)}
                disabled={savingPolicy || runningAutopilot}
                className="px-6 min-h-[44px] rounded-full bg-[#0e0f0c] text-[#9fe870] hover:bg-[#232620] text-xs font-bold whitespace-nowrap disabled:opacity-60"
              >
                {runningAutopilot
                  ? 'Queueing Cycle...'
                  : pipelineMode === 'autopilot' && autopilotEnabled && !isPaused
                  ? 'Run Autopilot Now'
                  : 'Start Full Automation Now'}
              </button>
              <button
                type="button"
                onClick={handleTogglePause}
                disabled={savingPolicy || runningAutopilot}
                className={`px-6 min-h-[44px] rounded-full text-xs font-bold whitespace-nowrap ${
                  isPaused
                    ? 'bg-[#9fe870] text-[#0e0f0c] hover:bg-[#cdffad]'
                    : 'bg-[#320707] text-[#ffd11a] hover:bg-[#4d0b0b]'
                }`}
              >
                {isPaused ? 'Resume Autopilot & Reset Brakes' : 'Pause Autopilot'}
              </button>
            </div>
          </div>

          <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-6">
            <div className="border-b border-[#e8ebe6] pb-4">
              <h2 className="text-lg font-black text-[#0e0f0c]">Pipeline Mode &amp; Thresholds</h2>
              <p className="text-xs text-[#595c58] mt-0.5">
                Pick Autopilot Mode for zero-touch runs with Auto-Judges, or Manual Gate Mode to approve Gate A and Gate B yourself.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                aria-pressed={pipelineMode === 'autopilot'}
                onClick={() => {
                  setPipelineMode('autopilot');
                  setAutopilotEnabled(true);
                }}
                className={`text-left p-5 rounded-[18px] border-2 ${
                  pipelineMode === 'autopilot' ? 'bg-[#e2f6d5] border-[#054d28]' : 'bg-[#f8f9f7] border-[#e8ebe6]'
                }`}
              >
                <div className="text-sm font-black text-[#0e0f0c]">Autopilot Mode (Zero-Touch)</div>
                <p className="text-xs text-[#454745] mt-1">
                  Hourly scheduler picks topics, Data Judge and Video Judge replace Gate A/B, weak data skips automatically, and final videos wait for the hold window before handoff.
                </p>
              </button>

              <button
                type="button"
                aria-pressed={pipelineMode === 'manual'}
                onClick={() => {
                  setPipelineMode('manual');
                  setAutopilotEnabled(false);
                }}
                className={`text-left p-5 rounded-[18px] border-2 ${
                  pipelineMode === 'manual' ? 'bg-[#e2f6d5] border-[#054d28]' : 'bg-[#f8f9f7] border-[#e8ebe6]'
                }`}
              >
                <div className="text-sm font-black text-[#0e0f0c]">Manual Gate Mode</div>
                <p className="text-xs text-[#454745] mt-1">
                  Pipeline stops at Gate A (review specs and images) and Gate B (watch preview and edit copy) until you approve.
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-1.5">
                <label htmlFor="ap-vpw" className="block text-xs font-bold text-[#454745]">
                  Videos per week cap
                </label>
                <input
                  id="ap-vpw"
                  type="number"
                  min={1}
                  max={21}
                  value={videosPerWeek}
                  onChange={(e) => setVideosPerWeek(Number(e.target.value))}
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 text-xs font-bold text-[#0e0f0c]"
                />
              </div>

              <div className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-1.5">
                <label htmlFor="ap-score" className="block text-xs font-bold text-[#454745]">
                  Min topic score (Gate 0)
                </label>
                <input
                  id="ap-score"
                  type="number"
                  min={0}
                  max={100}
                  value={topicScoreMin}
                  onChange={(e) => setTopicScoreMin(Number(e.target.value))}
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 text-xs font-bold text-[#0e0f0c]"
                />
              </div>

              <div className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-1.5">
                <label htmlFor="ap-cats" className="block text-xs font-bold text-[#454745]">
                  Min valid categories
                </label>
                <input
                  id="ap-cats"
                  type="number"
                  min={3}
                  max={17}
                  value={minCategories}
                  onChange={(e) => setMinCategories(Number(e.target.value))}
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 text-xs font-bold text-[#0e0f0c]"
                />
              </div>

              <div className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-1.5">
                <label htmlFor="ap-conf" className="block text-xs font-bold text-[#454745]">
                  Min spec confidence
                </label>
                <input
                  id="ap-conf"
                  type="number"
                  step="0.05"
                  min="0.4"
                  max="1.0"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 text-xs font-bold text-[#0e0f0c]"
                />
              </div>

              <div className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-1.5">
                <label htmlFor="ap-hold" className="block text-xs font-bold text-[#454745]">
                  Hold window before publish (hours)
                </label>
                <input
                  id="ap-hold"
                  type="number"
                  min={0}
                  max={168}
                  value={holdHours}
                  onChange={(e) => setHoldHours(Number(e.target.value))}
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 text-xs font-bold text-[#0e0f0c]"
                />
              </div>

              <div className="p-4 rounded-[16px] bg-[#f8f9f7] border border-[#e8ebe6] space-y-1.5">
                <label htmlFor="ap-template" className="block text-xs font-bold text-[#454745]">
                  Default video template
                </label>
                <select
                  id="ap-template"
                  value={defaultTemplate}
                  onChange={(e) => setDefaultTemplate(e.target.value as 'v1' | 'v2' | 'v3')}
                  className="w-full px-3 min-h-[44px] rounded-[10px] bg-white border border-[#595c58]/60 text-xs font-bold text-[#0e0f0c]"
                >
                  <option value="v3">Template V3</option>
                  <option value="v2">Template V2</option>
                  <option value="v1">Template V1</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-[#e8ebe6]">
              <label htmlFor="ap-enabled" className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#0e0f0c]">
                <input
                  id="ap-enabled"
                  type="checkbox"
                  checked={autopilotEnabled}
                  onChange={(e) => setAutopilotEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Enable hourly background scheduler</span>
              </label>

              <button
                type="submit"
                disabled={savingPolicy}
                className="px-7 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs"
              >
                {savingPolicy ? 'Saving Policy...' : 'Save Autopilot Policy'}
              </button>
            </div>
          </div>
        </form>
      )}

      {activeTab === 'brands' && (
        <div className="bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e8ebe6] pb-4">
            <div>
              <h2 className="text-lg font-black text-[#0e0f0c]">Per-Brand Image Licensing Policy</h2>
              <p className="text-xs text-[#595c58] mt-0.5">
                Brands marked Unknown or Blocked use the Parametric Phone illustration instead of external photos.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSaveBrands}
              disabled={savingBrands}
              className="px-6 min-h-[44px] rounded-full bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold text-xs self-start sm:self-auto"
            >
              {savingBrands ? 'Saving...' : 'Save Brand Policy'}
            </button>
          </div>

          <div className="divide-y divide-[#e8ebe6] border border-[#e8ebe6] rounded-[16px] overflow-hidden">
            {brands.map((b, idx) => (
              <div
                key={b.brand}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f8f9f7] hover:bg-white text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-black text-[#0e0f0c] text-sm">{b.brand}</div>
                  {b.termsUrl && (
                    <a
                      href={b.termsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#454745] underline break-all"
                    >
                      {b.termsUrl}
                    </a>
                  )}
                </div>

                <div>
                  <label htmlFor={`brand-policy-${b.brand}`} className="sr-only">
                    Image license permission for {b.brand}
                  </label>
                  <select
                    id={`brand-policy-${b.brand}`}
                    value={b.allowed === true ? 'true' : b.allowed === false ? 'false' : 'null'}
                    onChange={(e) => updateBrandAllowed(idx, e.target.value)}
                    className={`px-3 min-h-[44px] rounded-full text-xs font-bold border ${
                      b.allowed === true
                        ? 'bg-[#e2f6d5] text-[#054d28] border-[#054d28]'
                        : b.allowed === false
                        ? 'bg-[#320707] text-[#ffd11a] border-[#d03238]'
                        : 'bg-[#e8ebe6] text-[#0e0f0c] border-[#595c58]/50'
                    }`}
                  >
                    <option value="null">Unknown: Parametric fallback</option>
                    <option value="true">Allowed: Verified press kit</option>
                    <option value="false">Blocked: Parametric fallback</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
