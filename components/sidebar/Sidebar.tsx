'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BookOpen,
  Image as ImageIcon,
  LayoutDashboard,
  TrendingUp,
  Settings,
  Wallet,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bell,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { useImport } from '@/contexts/ImportContext';
import { useAccount } from '@/contexts/AccountContext';
import { useWelcome } from '@/components/welcome/WelcomeContext';
import LoginButton from '@/components/auth/LoginButton';
import GlobalSearch from '@/components/global-search/GlobalSearch';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/watch', label: 'Market Watch', icon: Bell },
  { href: '/media', label: 'Library', icon: ImageIcon },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { isProcessing } = useImport();
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();
  const { openWelcomeModal } = useWelcome();

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/status')
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data) => {
        if (active && data?.isAdmin) {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <aside
      className={`relative flex flex-col h-screen bg-sidebar-bg border-r border-sidebar-border transition-all duration-200 ease-in-out ${collapsed ? 'w-[60px]' : 'w-[220px]'
        }`}
    >
      {/* Collapse/expand notch on the right edge, vertically centered */}
      <button
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute top-1/2 -right-3 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-12 rounded-full bg-sidebar-bg border border-sidebar-border text-muted shadow-sm hover:text-foreground hover:bg-sidebar-hover transition-colors"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className={`flex flex-col border-b border-sidebar-border ${collapsed ? 'py-4' : 'p-3'}`}>
        <div className={`flex items-center gap-2 mb-4 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent text-white shrink-0">
            <TrendingUp size={18} />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-foreground truncate">
              Trading Diary
            </span>
          )}
        </div>

        {/* Account Switcher */}
        {accounts.length > 0 && (
          <div className="relative group">
            <select
              value={selectedAccountId || ''}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className={`w-full appearance-none bg-muted/30 border border-sidebar-border rounded-lg text-xs font-medium cursor-pointer focus:ring-1 ring-accent outline-none transition-all hover:bg-muted/50 ${collapsed ? 'p-2 text-center' : 'py-2 pl-8 pr-6'}`}
            >
              {accounts.map(acc => (
                <option key={acc.accountId} value={acc.accountId}>
                  {collapsed ? acc.name.charAt(0) : acc.name}
                </option>
              ))}
            </select>
            {!collapsed && (
              <>
                <Wallet size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </>
            )}
            {collapsed && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Wallet size={14} className="text-muted-foreground opacity-50 group-hover:opacity-100" />
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 py-2 px-2 space-y-0.5">
        <GlobalSearch collapsed={collapsed} />

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const isImporting = item.href === '/media' && isProcessing;
          const Icon = isImporting ? () => <div className="animate-spin rounded-full h-4 w-4 border-2 border-accent border-t-transparent" /> : item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive
                ? 'bg-sidebar-active text-foreground font-medium'
                : 'text-muted hover:bg-sidebar-hover hover:text-foreground'
                } ${collapsed ? 'justify-center px-0' : ''} ${isImporting ? 'text-accent' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && (
                <span className="flex items-center gap-2">
                  {item.label}
                  {isImporting && <span className="text-[10px] bg-accent/10 px-1 rounded animate-pulse">Analyzing...</span>}
                </span>
              )}
            </Link>
          );
        })}

        {isAdmin && (
          <div className="pt-2 border-t border-sidebar-border mt-2">
            <Link
              href="/admin"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-sidebar-active text-foreground font-medium'
                  : 'text-muted hover:bg-sidebar-hover hover:text-foreground'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? 'Admin Observability' : undefined}
            >
              <ShieldAlert size={18} className="shrink-0 text-accent" />
              {!collapsed && <span>Admin Dashboard</span>}
            </Link>
          </div>
        )}
      </nav>
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <button
          onClick={openWelcomeModal}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/10 transition-colors ${
            collapsed ? 'justify-center px-0' : ''
          }`}
          title={collapsed ? 'Welcome & Demo Video' : undefined}
        >
          <Sparkles size={16} className="shrink-0" />
          {!collapsed && <span>Welcome & Demo Video</span>}
        </button>

        <div className="px-1 py-1">
          <LoginButton collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}
