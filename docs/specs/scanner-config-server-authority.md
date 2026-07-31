# Scanner Configuration: Server as the Source of Truth

## Status

Proposed.

## Related specification

Extends [Server-Side Market Scanner and Live Watch Clients](./server-side-market-scanner.md). That spec moved *scanning* to the server. This one fixes the gap it left behind: several settings that decide **what and how the server scans still live only in the browser**, so they silently never reach the scanner.

## The problem (observed)

Because pattern matching now runs on the **server**, every setting that affects a scan must be persisted server-side and reach `server_watch`. Today some do and some don't, which produces a confusing "I changed it but nothing happened" experience. Concretely, during a live debugging session we found:

1. **Provider selection and API keys live only in browser cookies.** [components/settings/MarketDataSettings.tsx](../../components/settings/MarketDataSettings.tsx) writes `watcher_pref_provider`, `watcher_tiingo_key`, `watcher_polygon_key`, etc. as cookies. The server scanner reads providers only from `process.env` (via `getActiveProvider` with no user config), so:
   - The user's UI provider choice (e.g. Tiingo) is **ignored by the scanner**.
   - The scanner used Polygon — the only key present in the server environment — and hit rate limits (429s), even though the UI said Tiingo.
   - The key the user typed into Settings never reached the scanner at all.
2. **Pattern selection did not reliably reach the server.** The watch page showed "Momentum Burst" selected while `server_watch.pattern_id` (and the saved settings blob) remained `consecutive`. The server therefore kept scanning with the old detector, so the newly selected pattern produced no alerts.
3. **Session defaults to pre-market only.** `parseSession` in [app/api/watch/sync/route.ts](../../app/api/watch/sync/route.ts) defaults to `'pre'` (04:00–09:30 ET). Watches created without an explicit session are scanned **only during pre-market** and skipped for the rest of the day — so stocks silently stop alerting after 09:30 ET.
4. **Resolved: minimum candle size is now one global scanner setting.** The
   duplicate override and per-symbol controls were removed. The always-visible
   pattern settings guide writes the account-level value to `user_watchlists`
   and materializes it onto every `server_watch`.
5. **Runtime/deploy config traps** (operational, already hit in production):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined at **build time** — adding it to `.env` and restarting does nothing; the web image must be rebuilt.
   - The scanner container must be **recreated** to pick up new env (VAPID, provider keys); a running container keeps its old environment.
   - `SCANNER_SHADOW` defaults to `true` (silent) — a footgun where a correctly-deployed scanner produces no alerts.

## Root cause

A **split brain** between two configuration stores:

- **Browser** (cookies + `localStorage`): provider selection, provider API keys, global min-move override — read by the legacy in-browser scan path and chart fetches.
- **Server** (`server_watch` / `user_watchlists` + `process.env`): what the authoritative scanner actually uses.

The UI presents both as "settings" with no indication of which is authoritative for the 24/7 scanner. Anything that only writes to the browser store is invisible to the scanner. The legacy browser scanner masked this because it *did* read the browser store — but it is paused when signed in, so the gaps only surface now that the server is authoritative.

## Goals

- Make the **server the single source of truth** for every setting that affects scanning: provider choice, provider credentials, pattern, threshold (including global override), session, scan frequency, and enabled state.
- Any scan-affecting change in the UI must persist server-side and be reflected in `server_watch` before the next scan, with no manual refresh.
- The UI should make it obvious what is server-authoritative versus a local display preference.
- No secret should live only in a browser cookie once server scanning is authoritative.

## Non-goals

- Changing detector definitions.
- Building multi-user credential sharing (see [Shared Market-Data Scanning](./shared-market-data-scanning.md)).
- Removing local display preferences that genuinely don't affect scanning (compact/table view, sound on/off).

## Proposed improvements

Ordered by impact. Items 1–3 are the ones that caused the observed confusion.

### 1. Move provider configuration server-side

- Persist the user's **provider selection** (equities + futures) and **API keys** on the server, not in cookies. For a single-user/self-hosted deployment, server-wide env keys are acceptable; for multi-user, store per-user credentials **encrypted at rest** (the "Provider credentials" section of the scanner spec).
- The scanner's `getActiveProvider(...)` call must be passed the user's persisted provider preference + credentials, instead of falling through to `process.env` auto-order. Until then, the scanner ignores the UI entirely.
- Stop writing provider secrets to cookies once the server is authoritative; migrate any existing cookie keys into server storage.
- **Acceptance:** selecting Tiingo in the UI makes the scanner fetch from Tiingo for that user's equities; the key entered in Settings is the key the scanner uses.

### 2. Guarantee every scan-affecting setting syncs

- Pattern, session, scan frequency, global minimum candle size, required candle
  count, and enabled categories must all be included in the sync payload and
  written to `server_watch` on change (debounced), through a single code path
  so none is forgotten.
- The `GET /api/watch/state` snapshot should return the **server-authoritative** values so the UI hydrates from the server rather than from stale localStorage — this prevents the "UI shows X, server has Y" divergence seen with pattern selection.
- **Acceptance:** changing any of these in the UI is observable in `server_watch` within one debounce interval and takes effect on the next scan; a hard refresh shows the server's values, not stale local ones.

### 3. Fix the session default and surface it

- Default session should be **`all`** (or an explicit onboarding choice), not `pre`. A pre-market-only default silently disables stock alerts for most of the trading day.
- The watch page should clearly show the active session/window and warn when the current time is outside it ("Stocks are outside their scan window until 04:00 ET").
- **Acceptance:** a newly added stock, with no explicit session choice, is scanned during regular trading hours.

### 4. Make deploy/runtime config safe and legible

- Treat `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as build-time: document that Web Push requires a **web image rebuild**, and surface push readiness in the UI (already logged by the scanner at startup).
- Ensure `deploy.sh` / compose **recreate the scanner** so it always picks up current env; add a startup log (present) that states which provider keys, VAPID, and shadow mode are active.
- Reconsider `SCANNER_SHADOW` default → `false`, or require it to be set explicitly, so a correct deploy is not silently muted. (For a single-user deploy it should be `false`.)

### 5. Make the split explicit in the UI

- Group settings into **"Scanning (server)"** vs **"Display (this device)."** Anything under Scanning writes to the server; anything under Display is local. This alone would have prevented the confusion.

## Suggested sequence

1. Snapshot API returns authoritative pattern/session/frequency/threshold/provider so the UI hydrates from the server (kills divergence). *(small)*
2. Persist provider selection server-side and pass it into the scanner's `getActiveProvider`. *(medium)*
3. Move provider API keys to server storage (env for single-user now; encrypted per-user later) and stop using cookies for scanner-relevant secrets. *(medium)*
4. Include the global min-move override + enabled categories in every sync. *(small)*
5. Change the session default to `all` and add the out-of-window banner. *(small)*
6. UI reorganization into Scanning vs Display. *(small–medium)*

## Acceptance criteria (summary)

- No scan-affecting setting exists only in the browser.
- The scanner honors the user's provider selection and credentials.
- Selecting a pattern flips `server_watch.pattern_id` and changes which detector runs.
- A new stock scans during regular hours by default.
- The UI shows the server-authoritative values after a refresh, and distinguishes server settings from local display preferences.
