'use client';

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, CheckCircle2, Smartphone, ShieldCheck, RefreshCw } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationToggle() {
  const { data: sessionData } = authClient.useSession();
  const isAuthenticated = !!sessionData?.user;

  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Register service worker
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        return reg.pushManager.getSubscription();
      })
      .then((sub) => {
        if (sub) {
          setSubscribed(true);
        }
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  }, []);

  const handleTogglePush = async () => {
    if (!isAuthenticated) {
      setStatusMessage('Please sign in to enable closed-browser mobile alerts.');
      return;
    }

    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatusMessage('Web Push is not supported by this browser.');
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const reg = await navigator.serviceWorker.ready;

      if (subscribed) {
        // Unsubscribe
        const currentSub = await reg.pushManager.getSubscription();
        if (currentSub) {
          await currentSub.unsubscribe();
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: currentSub.endpoint }),
          });
        }
        setSubscribed(false);
        setStatusMessage('Closed-browser notifications disabled.');
      } else {
        // Subscribe
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setStatusMessage('Notification permission denied by browser.');
          setLoading(false);
          return;
        }

        if (!vapidPublicKey) {
          setStatusMessage('VAPID public key not configured on server.');
          setLoading(false);
          return;
        }

        const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
        const newSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        });

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: newSub.toJSON() }),
        });

        if (res.ok) {
          setSubscribed(true);
          setStatusMessage('Mobile & Closed-Browser Alerts Enabled! 📲');
        } else {
          setStatusMessage('Failed to save subscription on server.');
        }
      }
    } catch (err: any) {
      console.error('Push toggle error:', err);
      setStatusMessage(err?.message || 'Push subscription error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-card-border bg-card-bg shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${subscribed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted-bg text-muted'}`}>
            <Smartphone size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              Mobile & Closed-Browser Alerts
              {subscribed && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Active
                </span>
              )}
            </div>
            <p className="text-xs text-muted">Receive 24/7 push alerts on mobile & desktop even when browser is closed</p>
          </div>
        </div>

        <button
          onClick={handleTogglePush}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${
            subscribed
              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
              : 'bg-emerald-500 hover:bg-emerald-600 text-white'
          } disabled:opacity-50`}
        >
          {loading ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : subscribed ? (
            <>
              <BellOff size={14} /> Disable Alerts
            </>
          ) : (
            <>
              <Bell size={14} /> Enable Push Alerts
            </>
          )}
        </button>
      </div>

      {statusMessage && (
        <div className="text-xs p-2.5 rounded-lg bg-muted-bg border border-card-border text-muted font-medium">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
