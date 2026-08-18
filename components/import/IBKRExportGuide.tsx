'use client';

import { FileSpreadsheet } from 'lucide-react';
import BrokerExportGuide, { type GuideStep } from './BrokerExportGuide';

const STEPS: GuideStep[] = [
  {
    title: 'Open IBKR Performance & Reports',
    body: (
      <>
        Log into IBKR portal, navigate to{' '}
        <strong className="text-foreground">Performance &amp; Reports</strong> in the top bar, then
        select <strong className="text-foreground">Third-Party Reports</strong>.
      </>
    ),
  },
  {
    title: 'Select Provider: TradeLog',
    body: (
      <>
        Under <strong className="text-foreground">Third-Party Downloads</strong> on the right, open
        the Provider dropdown and choose{' '}
        <strong className="text-accent font-bold">TradeLog</strong>.
      </>
    ),
  },
  {
    title: 'Download & Drop File',
    accent: 'profit',
    body: (
      <>
        Click <strong className="text-foreground">Download</strong> to save your TradeLog file, then
        drag and drop or paste it into the box above!
      </>
    ),
  },
];

export default function IBKRExportGuide() {
  return (
    <BrokerExportGuide
      title="IBKR TradeLog Export Tutorial"
      subtitle="Learn how to download your Interactive Brokers TradeLog file in 3 simple steps."
      badge="Video Guide"
      icon={FileSpreadsheet}
      steps={STEPS}
      video={{
        src: '/ibkr-tradelog-tutorial.mp4',
        caption: (
          <>
            This short tutorial demonstrates selecting{' '}
            <strong className="text-foreground">TradeLog</strong> under IBKR Third-Party Reports.
          </>
        ),
      }}
    />
  );
}
