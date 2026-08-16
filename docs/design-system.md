# Trading Diary Design System

## Purpose

Trading Diary uses one semantic visual language across pages, feature components, and integrated packages. Components must remain readable and visually consistent in both light and dark system themes without page-specific color patches.

## Source of truth

Theme values live in `app/globals.css`. Components consume semantic Tailwind utilities generated from those variables.

| Purpose | Utility | CSS variable |
| --- | --- | --- |
| Page background | `bg-background` | `--background` |
| Primary text | `text-foreground` | `--foreground` |
| Secondary text | `text-muted` | `--muted` |
| Muted surface | `bg-muted-bg` | `--muted-bg` |
| Card surface | `bg-card-bg` | `--card-bg` |
| Card border | `border-card-border` | `--card-border` |
| Primary action | `bg-accent`, `text-accent` | `--accent` |
| Focus backdrop | `bg-focus-backdrop` | `--focus-backdrop` |
| Positive value | `text-profit` | `--profit` |
| Negative/destructive value | `text-loss` | `--loss` |

## Rules

1. Use semantic utilities instead of raw palette colors for application surfaces and text.
2. Do not add light-only values such as `bg-white`, `text-gray-900`, or hexadecimal colors to feature UI.
3. Raw colors are acceptable only for data visualization series, brand marks, photographs, and status colors without a semantic token.
4. Cards use `bg-card-bg border border-card-border`; secondary panels use `bg-muted-bg`.
5. Primary actions use the accent token. Destructive actions use the loss token.
6. Page components compose feature components; they should not contain large reusable forms or domain logic.
7. Prefer the established spacing and shape vocabulary: crisp sharp edges (`--radius: 0px`), compact `text-sm`, and bounded page widths.
8. Verify every new interface in light and dark mode.

## Reusable package integration

Reusable packages must not depend on Trading Diary variable names internally. They expose semantic theme tokens and an `inherit` mode. Trading Diary maps that mode to its existing variables at the package boundary.

For the media library:

```tsx
<MediaGrid theme="inherit" />
```

For the engage widget and admin panel:

```tsx
<FeedbackWidget theme="inherit" corners="sharp" />
<EngageAdminPanel defaultTab="inbox" />
```

The packages also support standalone `system`, `light`, and `dark` themes for other applications.

## Navigation

- Sidebar navigation represents primary destinations only.
- Related workflows should use in-page tabs or embedded panels.
- Preserve old routes as redirects when moving a workflow.
- Authentication is owned by the sidebar account control rather than a duplicate navigation destination.
