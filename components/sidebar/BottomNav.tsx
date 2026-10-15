'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  BookOpen,
  BarChart3,
  Bell,
  MoreHorizontal,
  Image as ImageIcon,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useWelcome } from '@/components/welcome/WelcomeContext';

// Primary tabs mirror the desktop top nav; everything else lives behind "More".
const TABS = [
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/watch', label: 'Watch', icon: Bell },
];

// Routes that live under the "More" sheet — used to keep it lit when active.
const MORE_HREFS = ['/reports', '/media', '/settings'];

/**
 * Phone-style bottom tab bar, paper-themed to match the diary surfaces. Shown
 * only on small screens; larger screens use the top nav instead.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { openWelcomeModal } = useWelcome();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [moreOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = MORE_HREFS.some((href) => isActive(href));

  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[10px] transition-colors ${
      active ? 'text-ink' : 'text-ink-soft'
    }`;
  const pill = (active: boolean) =>
    `flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-paper-2' : ''}`;
  const menuLink =
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink-soft hover:bg-paper-2 hover:text-ink';

  return (
    <nav
      aria-label="Primary"
      className="sm:hidden fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t-2 border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      {TABS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={tabClass(active)}
          >
            <span className={pill(active)}>
              <Icon size={20} className="shrink-0" />
            </span>
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}

      <div ref={moreRef} className="flex flex-1">
        <button
          type="button"
          onClick={() => setMoreOpen((prev) => !prev)}
          aria-expanded={moreOpen}
          className={`w-full ${tabClass(moreActive || moreOpen)}`}
        >
          <span className={pill(moreActive || moreOpen)}>
            <MoreHorizontal size={20} className="shrink-0" />
          </span>
          <span>More</span>
        </button>

        {moreOpen && (
          <div
            className="absolute bottom-[calc(100%+10px)] right-2 z-50 min-w-[210px] rounded-[16px] border-2 border-line bg-paper-card p-2"
            style={{ boxShadow: 'var(--paper-shadow)' }}
          >
            <Link href="/reports" onClick={() => setMoreOpen(false)} className={menuLink}>
              <BarChart3 size={16} /> Reports
            </Link>
            <Link href="/media" onClick={() => setMoreOpen(false)} className={menuLink}>
              <ImageIcon size={16} /> Library
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
          </div>
        )}
      </div>
    </nav>
  );
}
