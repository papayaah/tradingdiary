'use client';

import { FileDown } from 'lucide-react';
import BrokerExportGuide, { type GuideStep } from './BrokerExportGuide';

const STEPS: GuideStep[] = [
  {
    title: 'Open Flex Queries in Client Portal',
    body: (
      <>
        Sign in to IBKR Client Portal and open{' '}
        <strong className="text-foreground">Performance &amp; Reports → Flex Queries</strong>.
      </>
    ),
  },
  {
    title: 'Create an Activity Flex Query',
    body: (
      <>
        Add an <strong className="text-foreground">Activity Flex Query</strong>, give it a memorable
        name such as <strong className="text-foreground">Trading Diary Trades</strong>, and add the{' '}
        <strong className="text-foreground">Trades</strong> section.
      </>
    ),
  },
  {
    title: 'Include the trade fields we recognize',
    body: (
      <>
        Include Symbol, Description, Buy/Sell, Quantity, Trade Price, Trade Date, Trade Time,
        Currency, IB Commission, Proceeds, Exchange, and Transaction ID or Trade ID.
      </>
    ),
  },
  {
    title: 'Choose XML or CSV and save',
    body: (
      <>
        Select <strong className="text-foreground">XML</strong> or{' '}
        <strong className="text-foreground">CSV</strong> output, choose the reporting period you
        want to import, and save the query template.
      </>
    ),
  },
  {
    title: 'Run, download, and import',
    accent: 'profit',
    body: (
      <>
        Run the saved query, download the generated file, then drag and drop it into the importer
        above. Interactive Brokers and the Flex format are detected automatically.
      </>
    ),
  },
];

export default function IBKRFlexQueryGuide() {
  return (
    <BrokerExportGuide
      title="IBKR Flex Query File Import"
      subtitle="Create a reusable IBKR report and download your executions as XML or CSV."
      badge="Import Guide"
      icon={FileDown}
      steps={STEPS}
      formatNote={
        <>
          <strong className="text-foreground">Current workflow:</strong> upload the downloaded Flex
          XML or CSV file. Automated Flex Web Service syncing is not connected yet, so never paste
          your Flex token into the URL field. Tokens should only be handled by a secure server-side
          connection.{' '}
          <a
            href="https://ibkrcampus.com/campus/ibkr-api-page/flex-web-service/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-accent hover:underline"
          >
            IBKR Flex documentation
          </a>
        </>
      }
    />
  );
}
