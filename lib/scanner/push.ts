import webPush from 'web-push';
import { db } from '@/lib/scanner/db';
import { userPushSubscription } from '@/lib/db/server/schema';
import { eq } from 'drizzle-orm';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@tradingdiary.app';

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export interface PushNotificationPayload {
  symbol: string;
  interval: string;
  matchedPattern: string;
  message: string;
  price?: number;
  url?: string;
}

export async function sendWebPushToUser(userId: string, payload: PushNotificationPayload): Promise<number> {
  if (!vapidPublicKey || !vapidPrivateKey) {
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
        // If subscription is expired or unregistered (404/410), delete from DB
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db
            .delete(userPushSubscription)
            .where(eq(userPushSubscription.endpoint, sub.endpoint))
            .catch(() => {});
        }
      }
    }

    return sentCount;
  } catch (err) {
    console.error('[web-push] send error:', err);
    return 0;
  }
}
