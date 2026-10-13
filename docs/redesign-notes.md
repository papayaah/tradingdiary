# Hand-drawn Calendar redesign — working notes

Handoff for continuing this redesign on another machine. Branch: `redesign/handdrawn-calendar-ui` (off `main`).

## Goal

Move Trading Diary to a hand-drawn "paper journal" aesthetic **and** greatly simplify the information architecture. Rolling out **incrementally, Calendar-first** — the app stays shippable; migrate other pages one at a time.

## Locked decisions

- **Aesthetic:** cream dotted "paper" background, hand-drawn wobbly grid (SVG `feTurbulence` displacement filter), highlighter-swipe P&L (green wins / red losses), **Patrick Hand** display font (upright — not slanty/scripty). No bold weights. Must work light AND dark.
- **No emoji anywhere in the app** — use lucide-react icons or brand SVGs only. (Emoji is fine in throwaway design prototypes, never in shipped code. `⌘` keyboard legend is not emoji.)
- **IA:** Calendar is the lightweight home. Top nav replaces the sidebar. Only three everyday links: **Calendar · Journal · Market Watch**. Everything else (Reports, Library, Settings, Welcome, Admin) lives in a **More ▾** dropdown. Reports is deliberately NOT a top link.
- **Search:** ONE unified "Ask your journal…" omnibox — instant local results + Ask-AI on Enter, no Find/Ask tabs. Field expands on focus; results drawer is fused to the input. AI path is a visible STUB until a model is wired.

## Done (steps 1–3)

1. **Foundation** — Patrick Hand via `next/font` ([app/layout.tsx](../app/layout.tsx)); paper token palette (light+dark) + Tailwind mappings (`bg-paper`, `text-ink`, `font-hand`, `text-paper-profit/loss`, `bg-hl-green/red`, …) in [app/globals.css](../app/globals.css). Additive — existing tokens untouched.
2. **Top nav + omnibox** — [components/topnav/TopNav.tsx](../components/topnav/TopNav.tsx) (brand, 3 links, More dropdown, account) + [components/topnav/Omnibox.tsx](../components/topnav/Omnibox.tsx) (reuses the real `useGlobalSearch` index). Swapped into [app/(journal)/layout.tsx](<../app/(journal)/layout.tsx>) — **desktop sidebar removed**; mobile (MobileTopBar + BottomNav) unchanged.
3. **Calendar page** — [components/calendar/PaperCalendar.tsx](../components/calendar/PaperCalendar.tsx) + [app/(journal)/calendar/page.tsx](<../app/(journal)/calendar/page.tsx>). Uses real `getJournalSummaries`. Nav "Calendar" + brand now point to `/calendar`. Click a day → `/journal?date=YYYYMMDD`.

Run: `npm run dev` → http://localhost:3000/calendar

## What's next (in rough order)

1. **Verify on real data** — number legibility in Patrick Hand over the highlighter; dark-mode "paper" (flip OS theme) and that the wobble grid stays intentional.
2. **Make Calendar the true home** — point `/` (and the post-login landing) at `/calendar`.
3. **Migrate Dashboard charts → Reports**, then redirect `/dashboard` → `/calendar`. `/dashboard` currently still exists (reachable by URL, just not in the nav).
4. **Polish the account control** — the reused `AccountSwitcher` + `LoginButton` still use the old sidebar tokens; restyle to paper.
5. **Mobile** — bring the paper calendar + the mobile search sheet (fused drawer / scrim pattern from the prototype) to small screens; retire MobileTopBar when ready.
6. **Migrate remaining pages** to paper: Journal → Reports → Settings.

## Reference

Throwaway design prototype (NOT shipping code — look/feel only, uses emoji + Mac system fonts): claude.ai artifact `b1abbead-6c1b-47fe-88c5-f72f78ef83ac`.
