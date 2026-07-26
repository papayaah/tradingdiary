// Service Worker for TradingDiary Web Push Notifications
// Handles push delivery and notification click navigation when browser is closed.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const symbol = (data.symbol || 'ALERT').toUpperCase();
    const title = `Market Alert: ${symbol}`;
    const cleanMsg = (data.message || data.details || `Pattern alert triggered on ${symbol}`)
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .replace(/📈|📉|🚨/g, '')
      .trim();

    const options = {
      body: cleanMsg,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `push-${symbol}-${Date.now()}`,
      data: {
        url: data.url || `/watch?symbol=${symbol}`,
        symbol,
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[sw] Push payload error:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/watch';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/watch') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
