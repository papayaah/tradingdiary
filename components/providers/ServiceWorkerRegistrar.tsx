'use client';

import { useEffect } from 'react';

/**
 * Registers the Web Push service worker at app scope. Mounted once from
 * ClientProviders so the worker exists for every authenticated user, not only
 * those who happen to open Settings. Subscription management stays in
 * PushNotificationToggle, which relies on navigator.serviceWorker.ready.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('[sw] registration failed:', err);
    });
  }, []);

  return null;
}
