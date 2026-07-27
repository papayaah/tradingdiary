'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { getTradeDateCutoff, setTradeDateCutoff } from '@/lib/settings';

const PRESETS = [
  { label: 'None (use file dates)', value: 'none' },
  { label: '16:00 (Market Close)', value: '16:00' },
  { label: '20:00 (After-Hours End)', value: '20:00' },
  { label: 'Custom', value: 'custom' },
];

export default function TradeDateCutoff() {
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState('20:00');
  const [selectedPreset, setSelectedPreset] = useState('none');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = getTradeDateCutoff();
    setCutoff(saved);

    if (saved === null) {
      setSelectedPreset('none');
    } else if (saved === '16:00') {
      setSelectedPreset('16:00');
    } else if (saved === '20:00') {
      setSelectedPreset('20:00');
    } else {
      setSelectedPreset('custom');
      setCustomTime(saved);
    }
    setMounted(true);
  }, []);

  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue);
    if (presetValue === 'none') {
      setCutoff(null);
      setTradeDateCutoff(null);
    } else if (presetValue === 'custom') {
      setCutoff(customTime);
      setTradeDateCutoff(customTime);
    } else {
      setCutoff(presetValue);
      setTradeDateCutoff(presetValue);
    }
  };

  const handleCustomTimeChange = (time: string) => {
    setCustomTime(time);
    if (selectedPreset === 'custom') {
      setCutoff(time);
      setTradeDateCutoff(time);
    }
  };

  if (!mounted) return null;

  return (
    <div className="bg-card-bg border border-card-border p-6 rounded-2xl shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
          <Clock size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Trade Date Cutoff</h2>
          <p className="text-xs text-muted font-medium">Configure daily cutoff threshold for trade attribution</p>
        </div>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        Trades executed after the cutoff time will be attributed to the next
        trading day. This affects how trades are grouped in the journal and
        dashboard — your original data is not modified.
      </p>

      <div className="space-y-3">
        {PRESETS.map((preset) => (
          <label
            key={preset.value}
            className="flex items-center gap-3 cursor-pointer group text-foreground"
          >
            <input
              type="radio"
              name="cutoff-preset"
              value={preset.value}
              checked={selectedPreset === preset.value}
              onChange={() => handlePresetChange(preset.value)}
              className="accent-accent w-4 h-4 cursor-pointer"
            />
            <span className="text-xs font-semibold">{preset.label}</span>
          </label>
        ))}
      </div>

      {selectedPreset === 'custom' && (
        <div className="mt-2 ml-7">
          <input
            type="time"
            value={customTime}
            onChange={(e) => handleCustomTimeChange(e.target.value)}
            className="px-3 py-2 rounded-xl border border-card-border bg-card-bg text-foreground text-xs font-mono outline-none focus:border-accent"
          />
        </div>
      )}

      {cutoff && (
        <div className="p-4 rounded-xl bg-card-bg/60 border border-card-border text-xs text-muted">
          Trades after{' '}
          <span className="font-bold text-accent">{cutoff}</span> will be
          grouped under the next calendar day.
        </div>
      )}
    </div>
  );
}
