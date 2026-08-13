'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Image as ImageIcon,
  LayoutDashboard,
  Settings,
  Bell,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/watch', label: 'Watch', icon: Bell },
  { href: '/media', label: 'Library', icon: ImageIcon },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Phone-style bottom tab bar. Shown only on small (portrait) screens where the
 * sidebar is hidden; larger screens use the push sidebar instead.
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sm:hidden fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-sidebar-border bg-sidebar-bg/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              active ? 'text-accent' : 'text-muted hover:text-foreground'
            }`}
          >
            <Icon size={20} className="shrink-0" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
