import type { EngageWidgetContentOverrides } from '@reactkits.dev/react-engage';

/** Product-owned help and copy. react-engage owns rendering, not domain content. */
export const tradingDiaryEngageContent = {
  feedback: {
    summaryPlaceholders: {
      bug: 'e.g. My imported executions are grouped incorrectly',
      suggestion: 'e.g. Add another dashboard comparison',
      support: 'e.g. Question about importing from my broker',
    },
  },
  faq: {
    items: [
      {
        id: 'import-trades',
        question: 'How do I import trades from my broker?',
        answer: 'Open Import Trades, then drop or select your broker export. Trading Diary detects supported formats automatically and shows a preview before anything is saved.',
        category: 'Importing',
        tags: ['broker', 'CSV', 'IBKR', 'TradeLog'],
      },
      {
        id: 'supported-imports',
        question: 'Which broker files are supported?',
        answer: 'Trading Diary has dedicated import support for IBKR TradeLog and Flex files, Schwab, Fidelity, Robinhood, Webull, and eSignal. Other CSV files can be imported with column mapping.',
        category: 'Importing',
        tags: ['broker', 'file format', 'CSV'],
      },
      {
        id: 'data-storage',
        question: 'Where is my journal data stored?',
        answer: 'Guest journals stay in this browser. When you sign in, your journal is also synchronized securely with the Trading Diary server so it can follow you across devices.',
        category: 'Account & Data',
        tags: ['privacy', 'sync', 'browser', 'account'],
      },
      {
        id: 'dashboard-range',
        question: 'How does the dashboard date range work?',
        answer: 'The dashboard starts at Month to Date. Choose another period from the calendar menu; your latest selection and custom dates are remembered in this browser.',
        category: 'Dashboard',
        tags: ['analytics', 'date range', 'month to date'],
      },
      {
        id: 'trade-replay',
        question: 'How do I replay a trading session?',
        answer: 'Open Replay, choose a trading day and symbol, then use the timeline controls to review executions and how the position developed through the session.',
        category: 'Replay',
        tags: ['timeline', 'executions', 'review'],
      },
      {
        id: 'market-watch',
        question: 'What does Market Watch do?',
        answer: 'Market Watch scans the symbols and intervals you configure for selected chart patterns. Signed-in users can synchronize their watchlist and receive supported server alerts across devices.',
        category: 'Market Watch',
        tags: ['scanner', 'watchlist', 'patterns', 'alerts'],
      },
      {
        id: 'duplicate-imports',
        question: 'What happens if I import the same trades twice?',
        answer: 'Trading Diary creates deterministic execution identities and skips executions it has already stored, so re-importing the same source does not duplicate your trades.',
        category: 'Importing',
        tags: ['duplicates', 're-import'],
      },
      {
        id: 'report-problem',
        question: 'How do I report a problem or request a feature?',
        answer: 'Select Support in this panel. Choose Bug for something broken, Suggestion for a product idea, or Support when you need a direct response. Signed-in submissions appear under My Tickets.',
        category: 'Support',
        tags: ['bug', 'suggestion', 'ticket'],
      },
    ],
  },
  newsletter: {
    subscribeDescription: 'Get Trading Diary feature announcements, workflow tips, and release updates straight to your inbox.',
  },
} satisfies EngageWidgetContentOverrides;
