'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Image as ImageIcon,
  LayoutDashboard,
  Play,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  Settings,
  Wallet,
  ChevronDown
} from 'lucide-react';
import { useImport } from '@/contexts/ImportContext';
import { useAccount } from '@/contexts/AccountContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/replay', label: 'Replay', icon: Play },
  { href: '/import', label: 'Import', icon: Upload },
  { href: '/media', label: 'Media', icon: ImageIcon },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { isProcessing } = useImport();
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();

  const selectedAccount = accounts.find(a => a.accountId === selectedAccountId);

  return (
    <aside
      className={`flex flex-col h-screen bg-sidebar-bg border-r border-sidebar-border transition-all duration-200 ease-in-out ${collapsed ? 'w-[60px]' : 'w-[220px]'
        }`}
    >
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
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const isImporting = item.href === '/import' && isProcessing;
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
