'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  LayoutDashboard,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/import', label: 'Import', icon: Upload },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col h-screen bg-sidebar-bg border-r border-sidebar-border transition-all duration-200 ease-in-out ${
        collapsed ? 'w-[60px]' : 'w-[220px]'
      }`}
    >
      <div className={`flex items-center h-14 px-3 border-b border-sidebar-border gap-2 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent text-white shrink-0">
          <TrendingUp size={18} />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground truncate">
            Trading Diary
          </span>
        )}
      </div>

      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-sidebar-active text-foreground font-medium'
                  : 'text-muted hover:bg-sidebar-hover hover:text-foreground'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full rounded-lg px-3 py-2 text-sm text-muted hover:bg-sidebar-hover hover:text-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span className="ml-3">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
