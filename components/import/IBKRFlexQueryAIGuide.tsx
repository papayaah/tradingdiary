'use client';

import { useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import BrokerExportGuide, { type GuideStep } from './BrokerExportGuide';

const FLEX_AI_PROMPT = 'Create an Activity Trades report with account ID, symbol, asset class, buy/sell, quantity, trade price, trade date, date/time, currency, IB commission, proceeds, FX rate to base, open/close indicator, exchange, transaction ID, trade ID and multiplier. Use CSV with column headers and keep each execution as its own row.';

function CopyablePrompt() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(FLEX_AI_PROMPT);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="mt-2 overflow-hidden border border-card-border bg-card-bg">
      <pre className="whitespace-pre-wrap break-words p-3 font-sans text-[11px] leading-relaxed text-foreground">
        {FLEX_AI_PROMPT}
      </pre>
      <div className="flex items-center justify-between gap-3 border-t border-card-border bg-muted-bg px-3 py-2">
        <span className="text-[10px] text-muted" aria-live="polite">
          {copyState === 'failed'
            ? 'Copy failed. Select the prompt text manually.'
            : `${FLEX_AI_PROMPT.length} characters · Paste into IBKR Configure with AI`}
        </span>
        <button
          type="button"
          onClick={copyPrompt}
          className="inline-flex shrink-0 items-center gap-1.5 bg-accent px-3 py-1.5 text-[10px] font-bold text-white transition-opacity hover:opacity-90"
        >
          {copyState === 'copied' ? <Check size={12} /> : <Copy size={12} />}
          {copyState === 'copied' ? 'Copied' : 'Copy prompt'}
        </button>
      </div>
    </div>
  );
}

const STEPS: GuideStep[] = [
  {
    title: 'Open Configure with AI',
    body: (
      <>
        In <strong className="text-foreground">Performance &amp; Reports → Flex Queries</strong>,
        click the purple <strong className="text-accent">Configure with AI</strong> button.
      </>
    ),
  },
  {
    title: 'Copy and paste the prepared prompt',
    body: <CopyablePrompt />,
  },
  {
    title: 'Select the account to include',
    body: 'Choose the IBKR account whose executions you want in the report. Review this selection carefully if your login has linked accounts.',
  },
  {
    title: 'Review and save the generated query',
    body: (
      <>
        Confirm the generated <strong className="text-foreground">Trades</strong> section includes
        the requested fields—especially <strong className="text-foreground">Trade Date</strong>,{' '}
        <strong className="text-foreground">Date/Time</strong>, <strong className="text-foreground">Proceeds</strong>,{' '}
        <strong className="text-foreground">FX Rate to Base</strong>, and the{' '}
        <strong className="text-foreground">Open/Close Indicator</strong> (these make P&amp;L match IBKR exactly)—uses
        CSV with column headers, and keeps individual executions as separate rows. Then save the query.
      </>
    ),
  },
  {
    title: 'Copy the Query ID and enable Flex Web Service',
    accent: 'profit',
    body: 'Click the Edit (pencil) icon beside the saved query to view its numeric Query ID. Then open Flex Web Service Configuration, enable it, and generate a token. Keep the token private; Trading Diary needs the Query ID and token together for automatic syncing.',
  },
];

export default function IBKRFlexQueryAIGuide() {
  return (
    <BrokerExportGuide
      title="IBKR Flex Query with AI"
      subtitle="Let IBKR build the compatible Trades report from a ready-to-use prompt."
      badge="Recommended"
      icon={Sparkles}
      steps={STEPS}
      video={{
        src: '/ibkr-flex-tutorial.mp4',
        caption: (
          <>
            Watch the complete setup, including the Edit button, Query ID, 365-day
            period, and secure Flex Web Service connection.
          </>
        ),
      }}
      formatNote={
        <>
          <strong className="text-foreground">Fastest setup:</strong> use this when the purple{' '}
          <strong className="text-accent">Configure with AI</strong> option appears in your IBKR
          Client Portal. Always review the generated fields before saving because IBKR may adjust
          field names. The Flex token is a secret; never paste it into the generic Import URL field.
        </>
      }
    />
  );
}
