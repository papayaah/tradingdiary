import webPush from 'web-push';
import { db } from '@/lib/scanner/db';
import { userPushSubscription } from '@/lib/db/server/schema';
import { eq } from 'drizzle-orm';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@tradingdiary.app';

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  console.log('[web-push] VAPID configured — push notifications enabled');
} else {
  // Fail loudly: without this line a missing key is indistinguishable from
  // "no subscriptions", and closed-browser alerts silently never fire.
  console.error(
    '[web-push] VAPID keys missing — push notifications are DISABLED ' +
      `(publicKey=${vapidPublicKey ? 'set' : 'MISSING'}, privateKey=${vapidPrivateKey ? 'set' : 'MISSING'})`,
  );
}

export interface PushNotificationPayload {
  symbol: string;
  interval: string;
  matchedPattern: string;
  message: string;
  price?: number;
  url?: string;
  // Stable identity + timestamp let the service worker collapse duplicates by
  // tag and skip stale replays, mirroring the in-page notification guards.
  alertId?: string;
  createdAt?: string;
}

export async function sendWebPushToUser(userId: string, payload: PushNotificationPayload): Promise<number> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error(`[web-push] skipped for user ${userId}: VAPID keys not configured`);
    return 0;
  }

  try {
    const subscriptions = await db
      .select()
      .from(userPushSubscription)
      .where(eq(userPushSubscription.userId, userId));

    if (subscriptions.length === 0) return 0;

    const payloadString = JSON.stringify({
      ...payload,
      url: payload.url || `/watch?symbol=${payload.symbol.toUpperCase()}`,
    });

    let sentCount = 0;

    for (const sub of subscriptions) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: sub.keys as { p256dh: string; auth: string },
      };

      try {
        await webPush.sendNotification(pushSub, payloadString);
        sentCount++;
      } catch (err: any) {
        const host = safeHost(sub.endpoint);
        // If subscription is expired or unregistered (404/410), delete from DB
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.warn(`[web-push] pruning expired subscription for user ${userId} (${host})`);
          await db
            .delete(userPushSubscription)
            .where(eq(userPushSubscription.endpoint, sub.endpoint))
            .catch(() => {});
        } else {
          console.error(`[web-push] send failed for user ${userId} (${host}): ${err?.statusCode ?? err?.message ?? err}`);
        }
      }
    }

    console.log(`[web-push] user ${userId}: sent ${sentCount}/${subscriptions.length} for ${payload.symbol} ${payload.interval}`);
    return sentCount;
  } catch (err) {
    console.error('[web-push] send error:', err);
    return 0;
  }
}

/** Endpoint host for diagnostics without logging the full (sensitive) URL. */
function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown-host';
  }
}
