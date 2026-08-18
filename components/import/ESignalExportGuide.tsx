'use client';

import { LineChart } from 'lucide-react';
import BrokerExportGuide, { type GuideStep } from './BrokerExportGuide';

// Steps are intentionally generic — the exact eSignal export UI is not verified
// here, so we describe the file to produce rather than fabricate menu paths. The
// format note below reflects what the eSignal parser actually detects
// (see lib/import/brokers/esignal/trade-log-parser.ts).
const STEPS: GuideStep[] = [
  {
    title: 'Open your eSignal Trade Log',
    body: 'In eSignal, open your account trade history / Trade Log — the view that lists each execution with its timestamp, symbol, side, quantity, and average price.',
  },
  {
    title: 'Export as CSV',
    body: (
      <>
        Export or save the log as a <strong className="text-foreground">CSV</strong> file. eSignal
        Trade Logs use a <strong className="text-foreground">semicolon (;) delimiter</strong> — that
        is the format we auto-detect.
      </>
    ),
  },
  {
    title: 'Drop the file above',
    accent: 'profit',
    body: 'Drag and drop or paste the exported CSV into the box above. We detect the eSignal format automatically and map your executions.',
  },
];

export default function ESignalExportGuide() {
  return (
    <BrokerExportGuide
      title="eSignal Trade Log Import"
      subtitle="How to export your eSignal Trade Log as a CSV for import."
      badge="Import Guide"
      icon={LineChart}
      steps={STEPS}
      formatNote={
        <>
          <strong className="text-foreground">Expected file:</strong> an eSignal Trade Log CSV
          (semicolon-delimited) whose header includes{' '}
          <code className="text-foreground">Timestamp</code>,{' '}
          <code className="text-foreground">Category</code>,{' '}
          <code className="text-foreground">Symbol</code>,{' '}
          <code className="text-foreground">Buy/Sell</code>,{' '}
          <code className="text-foreground">Quantity</code>, and{' '}
          <code className="text-foreground">Average Price</code>. Rows marked{' '}
          <code className="text-foreground">Execution</code> become your trades.
        </>
      }
    />
  );
}
