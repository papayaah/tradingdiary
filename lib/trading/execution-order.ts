// Canonical execution ordering.
//
// Fills that share a timestamp (a large order sliced into many same-second
// executions) must be walked in a single deterministic order everywhere trade
// semantics are derived — the trade splitter, the import converter, and the
// execution audit. Without a stable tiebreaker, same-second fills tie on
// (date, time) and fall back to array/query order, which is nondeterministic:
// if a sell is walked before the buys at the moment the position is flat, a
// long round trip is mislabeled SHORT (and vice versa). The broker's
// transaction id (IBKR `sourceTradeId`, persisted as `tradeId`) is monotonic in
// true fill order, so it is the correct tiebreaker.

function timeToSeconds(time: string | undefined): number {
  if (!time) return 0;
  const [h, m, s] = time.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

/**
 * Compare two broker sequence ids (transaction ids). Numeric when both parse as
 * finite numbers — so `"999"` sorts before `"1000"` — otherwise lexicographic.
 * Empty/missing ids sort last so identified fills keep their broker order.
 */
export function compareSequenceIds(a: string | undefined, b: string | undefined): number {
  const sa = a ?? '';
  const sb = b ?? '';
  if (sa === sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  const na = Number(sa);
  const nb = Number(sb);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na < nb ? -1 : 1;
  return sa < sb ? -1 : 1;
}

/**
 * Total, deterministic order for executions: raw date, then time, then the
 * broker sequence id. Callers pass the sequence id they carry (`tradeId`
 * server-side = the IBKR transaction id; the raw `orderId` at import time).
 */
export function compareExecutionOrder(
  a: { date: string; time?: string },
  b: { date: string; time?: string },
  seqA: string | undefined,
  seqB: string | undefined,
): number {
  const dateCmp = a.date.localeCompare(b.date);
  if (dateCmp !== 0) return dateCmp;
  const timeCmp = timeToSeconds(a.time) - timeToSeconds(b.time);
  if (timeCmp !== 0) return timeCmp;
  return compareSequenceIds(seqA, seqB);
}
