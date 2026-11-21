// apps/web/src/app/settings/page.tsx
'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [autopilotEnabled, setAutopilotEnabled] = useState(true);
  const [videosPerWeek, setVideosPerWeek] = useState(4);
  const [minConfidence, setMinConfidence] = useState(0.8);
  const [holdHours, setHoldHours] = useState(24);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Studio Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure autonomous autopilot rules, category weights, and LLM providers.
        </p>
      </div>

      {/* Autopilot settings */}
      <div className="p-6 rounded-2xl bg-[#12151c] border border-[#1f2430] space-y-6">
        <div className="flex items-center justify-between border-b border-[#1f2430] pb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Autopilot Engine (Zero-Touch)</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Automatically discovers candidates, judges data, and schedules uploads without manual gates.
            </p>
          </div>
          <button
            onClick={() => setAutopilotEnabled(!autopilotEnabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              autopilotEnabled ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                autopilotEnabled ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Target Videos / Week
            </label>
            <input
              type="number"
              min={1}
              max={14}
              value={videosPerWeek}
              onChange={(e) => setVideosPerWeek(parseInt(e.target.value, 10))}
              className="mt-1.5 w-full px-3 py-2 rounded-xl bg-[#181d26] border border-[#1f2430] text-sm text-white"
            />
            <span className="text-[11px] text-slate-500">Default: 4 videos/week (1 Long + 1 Short)</span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Safety Hold Window (Hours)
            </label>
            <input
              type="number"
              min={0}
              max={72}
              value={holdHours}
              onChange={(e) => setHoldHours(parseInt(e.target.value, 10))}
              className="mt-1.5 w-full px-3 py-2 rounded-xl bg-[#181d26] border border-[#1f2430] text-sm text-white"
            />
            <span className="text-[11px] text-slate-500">Delay before public upload to allow manual cancellation</span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Min Data Confidence Threshold
            </label>
            <input
              type="number"
              step={0.05}
              min={0.5}
              max={1.0}
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="mt-1.5 w-full px-3 py-2 rounded-xl bg-[#181d26] border border-[#1f2430] text-sm text-white"
            />
            <span className="text-[11px] text-slate-500">Auto-judge skips video if data confidence falls below this</span>
          </div>
        </div>
      </div>

      {/* Brand Image Terms */}
      <div className="p-6 rounded-2xl bg-[#12151c] border border-[#1f2430] space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Brand Image Licensing Gates</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Only brands explicitly verified as allowed will use official press photos. Others default to the parametric phone illustration.
          </p>
        </div>

        <div className="divide-y divide-[#1f2430] text-xs">
          {[
            { brand: 'Samsung', status: 'Unknown (Parametric Fallback)', allowed: false },
            { brand: 'Apple', status: 'Blocked (Parametric Fallback)', allowed: false },
            { brand: 'Xiaomi', status: 'Unknown (Parametric Fallback)', allowed: false },
            { brand: 'Google Pixel', status: 'Unknown (Parametric Fallback)', allowed: false },
          ].map((b) => (
            <div key={b.brand} className="py-2.5 flex items-center justify-between">
              <span className="font-semibold text-white">{b.brand}</span>
              <span className="px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-400 border border-[#1f2430]">
                {b.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
