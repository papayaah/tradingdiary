import { describe, expect, it } from 'vitest';
import {
  dashboardCacheHeaders,
  dashboardEtag,
  etagMatches,
} from './dashboard-http-cache';

describe('dashboard HTTP cache', () => {
  it('changes the private validator when data revision or request scope changes', () => {
    const first = dashboardEtag('user-1', 'account-a:mtd::', 12);
    expect(dashboardEtag('user-1', 'account-a:mtd::', 12)).toBe(first);
    expect(dashboardEtag('user-1', 'account-a:mtd::', 13)).not.toBe(first);
    expect(dashboardEtag('user-1', 'account-b:mtd::', 12)).not.toBe(first);
  });

  it('recognizes validators in an If-None-Match list', () => {
    const etag = dashboardEtag('user-1', 'account-a:mtd::', 12);
    expect(etagMatches(`W/"another", ${etag}`, etag)).toBe(true);
    expect(etagMatches('W/"another"', etag)).toBe(false);
    expect(etagMatches('*', etag)).toBe(true);
  });

  it('marks personalized responses private and cookie-varying', () => {
    const headers = dashboardCacheHeaders('W/"value"');
    expect(headers['Cache-Control']).toContain('private');
    expect(headers['Cache-Control']).toContain('max-age=60');
    expect(headers.Vary).toBe('Cookie');
    expect(headers.ETag).toBe('W/"value"');
  });
});
