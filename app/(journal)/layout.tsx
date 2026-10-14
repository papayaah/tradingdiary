'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import TopNav from '@/components/topnav/TopNav';
import BottomNav from '@/components/sidebar/BottomNav';
import MobileTopBar from '@/components/sidebar/MobileTopBar';
import { ReplayProvider } from '@/components/replay/ReplayProvider';
import { AuthOverlayProvider } from '@/components/auth/AuthOverlayProvider';
import { MediaLibraryProvider } from '@/packages/react-media-library/src/components/MediaLibraryProvider';
import { ImportProvider } from '@/contexts/ImportContext';
import { AccountProvider } from '@/contexts/AccountContext';
import { JournalSyncProvider } from '@/components/journal/JournalSyncProvider';
import { WelcomeProvider } from '@/components/welcome/WelcomeContext';
import WelcomeModal from '@/components/welcome/WelcomeModal';
import JournalAssistantBar from '@/components/assistant/JournalAssistantBar';

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const isDirectReplay = pathname === '/replay';

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-dvh w-full max-w-full flex-col overflow-hidden">
        {!isDirectReplay && (
          <div className="hidden h-16 shrink-0 border-b-[2.5px] border-line bg-paper sm:block" />
        )}
        <main className="min-w-0 flex-1" />
      </div>
    );
  }

  return (
    <AccountProvider>
      <JournalSyncProvider>
      <MediaLibraryProvider>
        <ImportProvider>
          <AuthOverlayProvider>
            <ReplayProvider>
              <WelcomeProvider>
                <div className="flex h-dvh w-full max-w-full flex-col overflow-hidden">
                  {!isDirectReplay && <TopNav />}
                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
                    {!isDirectReplay && <MobileTopBar />}
                    {/* Desktop asks via the top-nav omnibox; the full assistant
                        bar stays for mobile until the mobile omnibox lands. */}
                    {!isDirectReplay && (
                      <div className="sm:hidden">
                        <JournalAssistantBar />
                      </div>
                    )}
                    <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
                      {children}
                    </main>
                  </div>
                  {!isDirectReplay && <BottomNav />}
                  <WelcomeModal />
                </div>
              </WelcomeProvider>
            </ReplayProvider>
          </AuthOverlayProvider>
        </ImportProvider>
      </MediaLibraryProvider>
      </JournalSyncProvider>
    </AccountProvider>
  );
}
