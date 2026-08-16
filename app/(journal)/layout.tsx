'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/sidebar/Sidebar';
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

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const isDirectReplay = pathname === '/replay';

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const isSmallScreen = window.innerWidth < 768;
      const savedCollapsed = localStorage.getItem('sidebar-collapsed');
      if (isSmallScreen) {
        setCollapsed(true);
      } else if (savedCollapsed !== null) {
        setCollapsed(savedCollapsed === 'true');
      }
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  if (!mounted) {
    return (
      <div className="flex h-dvh w-full max-w-full overflow-hidden">
        {!isDirectReplay && (
          <div className="hidden sm:block w-[60px] md:w-[220px] shrink-0 bg-sidebar-bg border-r border-sidebar-border" />
        )}
        <main className="flex-1 min-w-0" />
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
                <div className="flex h-dvh w-full max-w-full overflow-hidden">
                  {!isDirectReplay && <Sidebar collapsed={collapsed} onToggle={toggle} />}
                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
                    {!isDirectReplay && <MobileTopBar />}
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
