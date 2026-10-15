'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Wallet } from 'lucide-react';
import type { AccountRecord } from '@/lib/db/schema';

interface AccountSwitcherProps {
  accounts: AccountRecord[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  collapsed: boolean;
  // Where the dropdown opens from the icon button: to the right (sidebar rail)
  // or below-right (mobile top bar).
  menuPlacement?: 'right' | 'bottom-end';
  // Visual tone for the expanded <select>. 'paper' matches the hand-drawn
  // calendar surfaces; 'default' uses the standard app tokens.
  tone?: 'default' | 'paper';
}

export default function AccountSwitcher({
  accounts,
  selectedAccountId,
  onSelect,
  collapsed,
  menuPlacement = 'right',
  tone = 'default',
}: AccountSwitcherProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedAccount = accounts.find((account) => account.accountId === selectedAccountId);
  const close = useCallback(() => setIsOpen(false), []);
  const paper = tone === 'paper';

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, isOpen]);

  if (!collapsed) {
    return (
      <div className="relative group">
        <select
          value={selectedAccountId || ''}
          onChange={(event) => onSelect(event.target.value)}
          aria-label="Select trading account"
          className={
            paper
              ? 'w-full cursor-pointer appearance-none rounded-[12px] border-[2px] border-line bg-paper-card py-2 pl-9 pr-8 text-[13px] text-ink outline-none transition-colors hover:bg-paper-2 focus:ring-2 focus:ring-paper-profit/30'
              : 'w-full appearance-none rounded-lg border border-sidebar-border bg-muted-bg py-2 pl-8 pr-6 text-xs font-medium text-foreground outline-none transition-all hover:bg-sidebar-hover focus:ring-1 focus:ring-accent'
          }
        >
          {accounts.map((account) => (
            <option key={account.accountId} value={account.accountId}>
              {account.name}
            </option>
          ))}
        </select>
        <Wallet size={14} className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 ${paper ? 'text-ink-soft' : 'text-muted'}`} />
        <ChevronDown size={12} className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${paper ? 'text-ink-soft' : 'text-muted'}`} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative z-50 ${menuPlacement === 'right' ? 'px-2' : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Switch trading account"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={selectedAccount ? `Account: ${selectedAccount.name}` : 'Switch account'}
        className={`flex items-center justify-center rounded-lg transition-colors ${
          menuPlacement === 'right' ? 'h-10 w-full' : 'h-8 w-8'
        } ${
          isOpen
            ? paper ? 'bg-paper-2 text-ink' : 'bg-accent/10 text-accent'
            : paper ? 'text-ink-soft hover:bg-paper-2 hover:text-ink' : 'text-muted hover:bg-sidebar-hover hover:text-foreground'
        }`}
      >
        <Wallet size={17} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Trading accounts"
          className={`absolute z-50 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden p-2 ${
            paper
              ? 'rounded-[16px] border-[2.5px] border-line bg-paper-card'
              : 'rounded-2xl border border-card-border bg-card-bg shadow-2xl'
          } ${
            menuPlacement === 'right'
              ? 'left-[calc(100%+0.75rem)] top-0'
              : 'right-0 top-[calc(100%+0.5rem)]'
          }`}
          style={paper ? { boxShadow: 'var(--paper-shadow)' } : undefined}
        >
          <div className={`px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest ${paper ? 'text-ink-soft' : 'text-muted'}`}>
            Switch account
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {accounts.map((account) => {
              const active = account.accountId === selectedAccountId;
              return (
                <button
                  key={account.accountId}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onSelect(account.accountId);
                    close();
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active
                      ? paper ? 'bg-paper-2' : 'bg-accent/10'
                      : paper ? 'hover:bg-paper-2' : 'hover:bg-muted-bg'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active
                      ? paper ? 'bg-paper-profit text-paper-card' : 'bg-accent text-white'
                      : paper ? 'bg-paper-2 text-ink-soft' : 'bg-muted-bg text-muted'
                  }`}>
                    <Wallet size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${paper ? 'text-ink' : 'text-foreground'}`}>{account.name}</span>
                    <span className={`block truncate text-xs ${paper ? 'text-ink-soft' : 'text-muted'}`}>{account.type} · {account.currency}</span>
                  </span>
                  {active && <Check size={16} className={`shrink-0 ${paper ? 'text-paper-profit' : 'text-accent'}`} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
