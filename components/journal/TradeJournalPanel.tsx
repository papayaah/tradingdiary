'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Camera,
  FileText,
  Sparkles,
  Tags,
  Target,
} from 'lucide-react';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import type { TradeNoteRecord } from '@/lib/db/schema';
import {
  addScreenshotToTrade,
  getTradeNote,
  removeScreenshotFromTrade,
  tradeRef,
} from '@/lib/db/notes';
import ScreenshotAttachment from './ScreenshotAttachment';
import TradeAIReviewCard from './TradeAIReviewCard';
import TradeNotesEditor from './TradeNotesEditor';
import TradePlanEditor from './TradePlanEditor';
import TradePlaybookEditor from './TradePlaybookEditor';
import TradeTagsEditor from './TradeTagsEditor';

type JournalTool = 'screenshots' | 'tags' | 'playbook' | 'plan' | 'notes' | 'ai';

interface TradeJournalPanelProps {
  trade: AggregatedTrade;
  accountId: string;
  currency: string;
  onChange?: () => void;
}

function hasPlanData(note?: TradeNoteRecord): boolean {
  return Boolean(note && (
    note.plannedEntry != null
    || note.initialStop != null
    || note.targets?.length
    || note.plannedRiskAmount != null
    || note.plannedRiskPercent != null
    || note.planTiming
    || note.executionRating != null
    || note.processRating != null
  ));
}

export default function TradeJournalPanel({
  trade,
  accountId,
  currency,
  onChange,
}: TradeJournalPanelProps) {
  const ref = tradeRef(trade, accountId);
  const groupKey = ref.tradeGroupKey;
  const [activeTool, setActiveTool] = useState<JournalTool | null>(null);
  const [note, setNote] = useState<TradeNoteRecord | undefined>();

  const refresh = useCallback(async () => {
    setNote(await getTradeNote(groupKey));
    onChange?.();
  }, [groupKey, onChange]);

  useEffect(() => {
    let active = true;
    getTradeNote(groupKey).then((record) => {
      if (active) setNote(record);
    });
    return () => { active = false; };
  }, [groupKey]);

  const toggleTool = (tool: JournalTool) => {
    setActiveTool((current) => {
      if (current === tool) {
        void refresh();
        return null;
      }
      return tool;
    });
  };

  const addScreenshot = async (assetId: number) => {
    await addScreenshotToTrade(ref, assetId);
    await refresh();
  };

  const removeScreenshot = async (assetId: number) => {
    await removeScreenshotFromTrade(groupKey, assetId);
    await refresh();
  };

  const tools: Array<{
    id: JournalTool;
    label: string;
    icon: typeof Camera;
    status?: string;
  }> = [
    {
      id: 'screenshots',
      label: 'Screenshot',
      icon: Camera,
      status: note?.screenshotIds?.length ? String(note.screenshotIds.length) : undefined,
    },
    {
      id: 'tags',
      label: 'Tag',
      icon: Tags,
      status: note?.tagIds?.length ? String(note.tagIds.length) : undefined,
    },
    {
      id: 'playbook',
      label: 'Playbook',
      icon: BookOpen,
      status: note?.strategyId ? 'Linked' : undefined,
    },
    {
      id: 'plan',
      label: 'Plan & risk',
      icon: Target,
      status: hasPlanData(note) ? 'Added' : undefined,
    },
    {
      id: 'notes',
      label: 'Note',
      icon: FileText,
      status: note?.content.trim() ? 'Added' : undefined,
    },
    { id: 'ai', label: 'AI review', icon: Sparkles },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-muted">
          Add to trade
        </span>
        {tools.map(({ id, label, icon: Icon, status }) => {
          const active = activeTool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleTool(id)}
              aria-expanded={active}
              className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-card-border bg-card-bg text-muted hover:border-accent/30 hover:text-foreground'
              }`}
            >
              <Icon size={13} aria-hidden="true" />
              {label}
              {status && (
                <span className="text-[10px] font-normal text-muted">· {status}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeTool && (
        <div className="mt-3 border-t border-card-border pt-3">
          {activeTool === 'screenshots' && (
            <ScreenshotAttachment
              screenshotIds={note?.screenshotIds ?? []}
              onAdd={addScreenshot}
              onRemove={removeScreenshot}
            />
          )}
          {activeTool === 'tags' && (
            <TradeTagsEditor tradeRef={ref} onChange={refresh} />
          )}
          {activeTool === 'playbook' && (
            <TradePlaybookEditor tradeRef={ref} onChange={refresh} />
          )}
          {activeTool === 'plan' && (
            <TradePlanEditor tradeRef={ref} trade={trade} onChange={refresh} />
          )}
          {activeTool === 'notes' && (
            <TradeNotesEditor tradeRef={ref} onChange={refresh} />
          )}
          {activeTool === 'ai' && (
            <TradeAIReviewCard trade={trade} accountId={accountId} currency={currency} />
          )}
        </div>
      )}
    </div>
  );
}
