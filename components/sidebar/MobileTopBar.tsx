'use client';

import BrandLogo from '@/components/brand/BrandLogo';
import AccountSwitcher from '@/components/sidebar/AccountSwitcher';
import FlexSyncControl from '@/components/import/ibkr-flex/FlexSyncControl';
import AccountUser from '@/components/topnav/AccountUser';
import Omnibox from '@/components/topnav/Omnibox';
import { useAccount } from '@/contexts/AccountContext';

/**
 * Paper top bar for phones: brand mark, the unified "Ask your journal" search,
 * and the account controls. The primary nav lives in the bottom tab bar.
 */
export default function MobileTopBar() {
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b-[2.5px] border-line bg-paper/95 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-md sm:hidden">
      <BrandLogo className="h-8 w-8 shrink-0" />
      <Omnibox />
      <FlexSyncControl tone="paper" compact />
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
      <AccountUser />
    </header>
  );
}
