'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Image as ImageIcon,
  LifeBuoy,
  Settings,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useImport } from '@/contexts/ImportContext';
import { useAccount } from '@/contexts/AccountContext';
import { useWelcome } from '@/components/welcome/WelcomeContext';
import BrandLogo from '@/components/brand/BrandLogo';
import AccountSwitcher from '@/components/sidebar/AccountSwitcher';
import FlexSyncControl from '@/components/import/ibkr-flex/FlexSyncControl';
import AccountUser from './AccountUser';
import Omnibox from './Omnibox';

const PRIMARY = [
  { href: '/calendar', label: 'Calendar' },
  { href: '/journal', label: 'Journal' },
  { href: '/watch', label: 'Market Watch' },
];

export default function TopNav() {
  const pathname = usePathname();
  const { isProcessing } = useImport();
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();
  const { openWelcomeModal } = useWelcome();
  const [isAdmin, setIsAdmin] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/status')
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data) => {
        if (active && data?.isAdmin) setIsAdmin(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [moreOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const menuLink = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink-soft hover:bg-paper-2 hover:text-ink';

  return (
    <header className="relative z-40 hidden h-16 shrink-0 items-center gap-4 border-b-[2.5px] border-line bg-paper px-6 sm:flex">
      {/* Hand-drawn scribble filter for the active-nav pen loop. */}
      <svg width="0" height="0" aria-hidden className="absolute">
        <filter id="nav-scribble" x="-20%" y="-35%" width="140%" height="170%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.03" numOctaves="2" seed="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <Link href="/calendar" className="flex shrink-0 items-center gap-2">
        <BrandLogo className="h-8 w-8" priority />
        <span className="font-hand text-[20px] text-ink">Trading Diary</span>
      </Link>

      <nav className="flex items-center gap-1">
        {PRIMARY.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative isolate px-3.5 py-1.5 text-[15px] transition-colors ${
                active ? 'text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {item.label}
              {active && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-x-[7px] -inset-y-[3px] -z-10"
                  style={{
                    border: '2.5px solid var(--ink)',
                    borderRadius: '50%',
                    transform: 'rotate(-1.5deg)',
                    filter: 'url(#nav-scribble)',
                  }}
                />
              )}
            </Link>
          );
        })}

        <div ref={moreRef} className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            className={`flex items-center gap-1 px-3 pb-1 pt-1 text-[15px] transition-colors ${
              moreOpen ? 'text-ink' : 'text-ink-soft hover:text-ink'
            }`}
            aria-expanded={moreOpen}
          >
            More
            <ChevronDown size={15} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>

          {moreOpen && (
            <div
              className="absolute left-0 top-[130%] z-50 min-w-[200px] rounded-[12px] border-[2.5px] border-line bg-paper-card p-2"
              style={{ boxShadow: 'var(--paper-shadow)' }}
            >
              <Link href="/reports" onClick={() => setMoreOpen(false)} className={menuLink}>
                <BarChart3 size={16} /> Reports
              </Link>
              <Link href="/media" onClick={() => setMoreOpen(false)} className={menuLink}>
                {isProcessing ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper-profit border-t-transparent" />
                ) : (
                  <ImageIcon size={16} />
                )}
                Library
              </Link>
              <Link href="/settings" onClick={() => setMoreOpen(false)} className={menuLink}>
                <Settings size={16} /> Settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  openWelcomeModal();
                }}
                className={`w-full ${menuLink}`}
              >
                <Sparkles size={16} /> Welcome &amp; demo
              </button>

              {isAdmin && (
                <div className="mt-2 border-t-2 border-dashed border-line-soft pt-2">
                  <Link href="/admin" onClick={() => setMoreOpen(false)} className={menuLink}>
                    <ShieldAlert size={16} className="text-paper-profit" /> Admin dashboard
                  </Link>
                  <Link href="/admin/engage" onClick={() => setMoreOpen(false)} className={menuLink}>
                    <LifeBuoy size={16} className="text-paper-profit" /> Engage dashboard
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <div className="flex-1" />

      <Omnibox />

      <div className="flex shrink-0 items-center gap-3">
        <FlexSyncControl tone="paper" compact />
        {accounts.length > 0 && (
          <div className="w-[170px]">
            <AccountSwitcher
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelect={setSelectedAccountId}
              collapsed={false}
              menuPlacement="bottom-end"
              tone="paper"
            />
          </div>
        )}
        <AccountUser />
      </div>
    </header>
  );
}
