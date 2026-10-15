'use client';

import { usePathname } from 'next/navigation';
import BrandLogo from '@/components/brand/BrandLogo';
import AccountSwitcher from '@/components/sidebar/AccountSwitcher';
import GlobalSearch from '@/components/global-search/GlobalSearch';
import { useAccount } from '@/contexts/AccountContext';

// Longest-prefix wins, so '/admin/engage' must be checked before '/admin'.
const TITLES: { prefix: string; label: string }[] = [
  { prefix: '/calendar', label: 'Calendar' },
  { prefix: '/dashboard', label: 'Dashboard' },
  { prefix: '/journal', label: 'Journal' },
  { prefix: '/reports', label: 'Reports' },
  { prefix: '/watch', label: 'Market Watch' },
  { prefix: '/media', label: 'Library' },
  { prefix: '/settings', label: 'Settings' },
  { prefix: '/admin/engage', label: 'Email & support' },
  { prefix: '/admin', label: 'Admin' },
  { prefix: '/import', label: 'Import' },
];

function pageTitle(pathname: string): string {
  const match = TITLES.find(
    (t) => pathname === t.prefix || pathname.startsWith(`${t.prefix}/`),
  );
  return match ? match.label : 'Trading Diary';
}

/**
 * Slim top app bar shown only on phones (where the sidebar is hidden): brand
 * mark + the current page title on the left, account switcher icon on the right.
 */
export default function MobileTopBar() {
  const pathname = usePathname();
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();

  return (
    <header className="sm:hidden sticky top-0 z-40 flex items-center justify-between gap-2 border-b-2 border-line bg-paper/95 px-3 py-1 pt-[calc(0.25rem+env(safe-area-inset-top))] backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2">
        <BrandLogo className="h-8 w-8 shrink-0" />
        <span className="truncate text-base font-semibold text-ink">{pageTitle(pathname)}</span>
      </div>
      <div className="flex items-center gap-1">
        <GlobalSearch variant="mobile" />
        {accounts.length > 0 && (
          <AccountSwitcher
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelect={setSelectedAccountId}
            collapsed
            menuPlacement="bottom-end"
            tone="paper"
          />
        )}
      </div>
    </header>
  );
}
