# Universal Feedback, Bug Report & FAQ Widget Spec

## Status

Draft

## Summary

A lightweight, embeddable React component package (`@reactkits.dev/react-feedbox` residing in `packages/react-feedbox`) that mounts as a floating trigger button in the lower-right (or lower-left) corner of any web application.

When clicked, it expands an in-page panel providing a multi-purpose hub for:
1. **Documentation / FAQ**: Searchable self-serve quick help articles and FAQs.
2. **Bug Reporting**: Automatic system metadata capture (URL, browser, screen size, OS), file/screenshot attachment, and bug severity selection.
3. **Suggestion Box**: Feature requests and user feedback submission with categorical tagging.
4. **Support Ticket / Contact**: Direct support inquiries.

The package is general-purpose, fully customizable/reskinnable, framework-flexible, and backend-agnostic (supporting custom submit handlers, REST APIs, or Webhooks).

## Goals

- **Universal Reusability**: Single package mountable across Trading Diary and other applications via standard NPM module structure in `packages/react-feedback-widget`.
- **4-in-1 Hub**: Combines FAQ/Docs, Bug Reports, Suggestion Box, and Support Tickets in one compact UI widget.
- **Auto-captured Context**: Automatically attach URL, route, OS, browser, screen resolution, viewport size, and client timestamp to bug reports.
- **Design System & Theme Integration**: Full adherence to `docs/design-system.md` with semantic theme tokens (`inherit`, `system`, `light`, `dark`).
- **Reskinnable Branding**: Configurable trigger icons, accent colors, custom launcher positions, custom typography, and translated text labels.
- **Pluggable Backend Adapters**: Clean TypeScript handler interfaces and built-in REST/webhook integrations (e.g. Slack, Discord, GitHub Issues, custom API routes).
- **In-Page Flow**: Non-blocking slide-out drawer/panel that preserves page context without disruptive focus-trapping modals (per `AGENTS.md` guidelines).

## Non-goals

- Full-fledged customer service live-chat system with real-time websocket agents (out of scope; can link out to third-party chat if configured).
- Built-in full rich-text WYSIWYG article CMS (FAQs are passed via props, JSON, or lightweight markdown endpoint).

## Package Architecture & Directory Structure

```
packages/react-feedback-widget/
├── src/
│   ├── components/
│   │   ├── FeedbackWidget.tsx         # Main container & floating trigger button
│   │   ├── FeedbackDrawer.tsx         # Embedded slide-out panel
│   │   ├── tabs/
│   │   │   ├── FaqTab.tsx             # FAQ search & article viewer
│   │   │   ├── BugReportTab.tsx       # Bug submission form with meta capture
│   │   │   ├── SuggestionTab.tsx      # Suggestion box form
│   │   │   └── TicketTab.tsx          # General contact / ticket form
│   │   └── ui/                        # Reusable internal micro-components
│   ├── context/
│   │   └── FeedbackContext.tsx        # Widget state & config provider
│   ├── hooks/
│   │   ├── useEnvironmentMeta.ts      # Auto captures URL, screen, browser, OS
│   │   └── useFeedbackTheme.ts        # Dynamic theme resolution (inherit/light/dark)
│   ├── types/
│   │   └── index.ts                   # Payload & prop interfaces
│   ├── utils/
│   │   └── adapters.ts                # Webhook & REST API adapters
│   ├── index.ts                       # Public package export
│   └── styles.css                     # Semantic CSS variables & utility classes
├── package.json
├── README.md
└── tsconfig.json
```

## Component API & Usage Example

```tsx
import { FeedbackWidget } from '@tradingdiary/react-feedback-widget';
import '@tradingdiary/react-feedback-widget/dist/styles.css';

export function AppLayout({ children }) {
  return (
    <div>
      {children}
      
      <FeedbackWidget
        appId="trading-diary"
        position="bottom-right" // "bottom-right" | "bottom-left" | "top-right" | "top-left"
        theme="inherit"        // "inherit" | "system" | "light" | "dark"
        user={{
          id: "usr_123",
          name: "Trader Jane",
          email: "jane@example.com",
        }}
        faqs={[
          {
            id: "faq-1",
            question: "How do I import trades from my broker?",
            answer: "Go to Settings > Accounts and select your broker CSV format.",
            category: "Trading",
          },
          {
            id: "faq-2",
            question: "How is P&L calculated?",
            answer: "P&L is calculated based on realized executions in your account currency.",
            category: "Analytics",
          },
        ]}
        onSubmitBug={async (payload) => {
          await fetch('/api/feedback/bug', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }}
        onSubmitSuggestion={async (payload) => {
          await fetch('/api/feedback/suggestion', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }}
        onSubmitTicket={async (payload) => {
          await fetch('/api/feedback/ticket', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }}
      />
    </div>
  );
}
```

## Data Models & Payloads

### 1. Bug Report Payload (`BugReportPayload`)
```typescript
export interface BugReportPayload {
  appId: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
  attachments?: Array<{
    name: string;
    type: string;
    dataUrl?: string; // Base64 or uploaded URL
  }>;
  environment: {
    url: string;
    path: string;
    referrer: string;
    userAgent: string;
    browser: string;
    os: string;
    screenResolution: string;
    viewportSize: string;
    devicePixelRatio: number;
    timestamp: string;
    themeMode: 'light' | 'dark';
  };
}
```

### 2. Suggestion Box Payload (`SuggestionPayload`)
```typescript
export interface SuggestionPayload {
  appId: string;
  title: string;
  category: 'ui_ux' | 'new_feature' | 'performance' | 'integrations' | 'other';
  description: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
  timestamp: string;
}
```

### 3. Support Ticket Payload (`TicketPayload`)
```typescript
export interface TicketPayload {
  appId: string;
  subject: string;
  message: string;
  category?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
  timestamp: string;
}
```

### 4. FAQ / Help Item (`FaqItem`)
```typescript
export interface FaqItem {
  id: string;
  question: string;
  answer: string; // Markdown or plain text
  category?: string;
  tags?: string[];
  externalUrl?: string;
}
```

## Theme & Styling Integration

The package strictly enforces semantic theme tokens that adapt seamlessly in any hosting app:

- `--fb-bg`: Panel background (maps to `--background` or `--card-bg`).
- `--fb-fg`: Primary text (maps to `--foreground`).
- `--fb-muted`: Secondary text & borders (maps to `--muted`).
- `--fb-card-bg`: Surface color for FAQ cards and form inputs (maps to `--muted-bg` or `--card-bg`).
- `--fb-card-border`: Border color (maps to `--card-border`).
- `--fb-accent`: Primary button / active tab accent color (maps to `--accent`).
- `--fb-loss`: Destructive/High severity indicator (maps to `--loss`).

When `theme="inherit"` is passed, the widget extracts CSS variables directly from the host application body/root, ensuring perfect visual consistency with Trading Diary or any external application.

## User Interface & User Experience Details

1. **Floating Trigger Button**:
   - Fixed positioning in lower right with customizable margin (`bottom-6 right-6`).
   - Compact pill or icon badge with optional label ("Help & Feedback").
   - Micro-animations on hover and click (smooth rotation / scale transition).

2. **In-Page Slide-out Panel / Drawer**:
   - Responsive panel width (e.g., `w-80 sm:w-96`, height `max-h-[600px]` or `h-[80vh]`).
   - Positioned cleanly directly above or adjacent to the trigger button in the page flow.
   - Header with tab bar navigation: `[Help / FAQ]` | `[Report Bug]` | `[Suggest Feature]` | `[Contact]`.
   - Close button (`Esc` key binding included).

3. **Form Experience**:
   - Quick input validations with semantic feedback.
   - Instant success view with confirmation checkmark & auto-reset.
   - Support for file attachments (drag & drop or image file picker with image preview thumbnail).

## Verification Plan

### Automated Tests
- Unit tests for `useEnvironmentMeta` hook to ensure accurate browser/URL info capture.
- Component rendering tests for `FeedbackWidget` under `light`, `dark`, and `inherit` theme modes.
- Event submission tests verifying payload structure for `onSubmitBug`, `onSubmitSuggestion`, and `onSubmitTicket`.

### Manual Verification
- Mount `<FeedbackWidget />` in Trading Diary app layout.
- Test floating trigger toggle, tab switching, search filtering in FAQs, attachment previews, and theme switching between light and dark mode.
