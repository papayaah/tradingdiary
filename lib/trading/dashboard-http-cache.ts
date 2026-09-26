import { createHash } from 'node:crypto';

const DASHBOARD_BROWSER_MAX_AGE_SECONDS = 60;
const DASHBOARD_STALE_WHILE_REVALIDATE_SECONDS = 300;

export function dashboardEtag(
  userId: string,
  scope: string,
  revision: number,
): string {
  const digest = createHash('sha256')
    .update(`${userId}\u001f${scope}\u001f${revision}`)
    .digest('base64url')
    .slice(0, 20);
  return `W/"dashboard-${digest}"`;
}

export function dashboardCacheHeaders(etag: string): Record<string, string> {
  return {
    'Cache-Control': `private, max-age=${DASHBOARD_BROWSER_MAX_AGE_SECONDS}, stale-while-revalidate=${DASHBOARD_STALE_WHILE_REVALIDATE_SECONDS}`,
    ETag: etag,
    // Personalized responses must never be reused across signed-in users in a
    // shared browser/proxy cache.
    Vary: 'Cookie',
  };
}

export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === etag || candidate === '*');
}
