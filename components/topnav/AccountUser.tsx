'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useAuthOverlay } from '@/components/auth/AuthOverlayProvider';

function initialsOf(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nameOrEmail.trim().slice(0, 2).toUpperCase();
}

/**
 * Paper-styled account control for the top nav: avatar + sign-out when signed
 * in, a sign-in button otherwise. Mobile keeps the package UserButton.
 */
export default function AccountUser() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { openSignIn } = useAuthOverlay();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (isPending) {
    return <div className="h-9 w-9 animate-pulse rounded-full bg-paper-2" />;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={openSignIn}
        className="flex h-9 items-center gap-2 rounded-full border-[2.5px] border-line bg-paper-card px-4 text-[14px] text-ink transition-colors hover:bg-paper-2"
      >
        <LogIn size={16} /> Sign in
      </button>
    );
  }

  const user = session.user;
  const label = user.name || user.email || 'Account';

  async function signOut() {
    setOpen(false);
    await authClient.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center"
      >
        {user.image ? (
          <span
            className="h-9 w-9 rounded-full border-2 border-line bg-cover bg-center"
            style={{ backgroundImage: `url(${user.image})` }}
          />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-line bg-paper-profit text-[13px] font-semibold text-paper-card">
            {initialsOf(label)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[220px] rounded-[12px] border-[2.5px] border-line bg-paper-card p-2"
          style={{ boxShadow: 'var(--paper-shadow)' }}
        >
          <div className="px-3 py-2">
            {user.name && <div className="text-[14px] text-ink">{user.name}</div>}
            {user.email && <div className="truncate text-[12.5px] text-ink-soft">{user.email}</div>}
          </div>
          <div className="my-1 border-t-2 border-dashed border-line-soft" />
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
