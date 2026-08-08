'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/sidebar/Sidebar';
import { ReplayProvider } from '@/components/replay/ReplayProvider';
import { AuthOverlayProvider } from '@/components/auth/AuthOverlayProvider';
import { MediaLibraryProvider } from '@/packages/react-media-library/src/components/MediaLibraryProvider';
import { ImportProvider } from '@/contexts/ImportContext';
import { AccountProvider } from '@/contexts/AccountContext';
import { WelcomeProvider } from '@/components/welcome/WelcomeContext';
import WelcomeModal from '@/components/welcome/WelcomeModal';
import GlobalSearch from '@/components/global-search/GlobalSearch';

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
      setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true');
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
      <div className="flex h-screen">
        {!isDirectReplay && (
          <div className="w-[220px] bg-sidebar-bg border-r border-sidebar-border" />
        )}
        <main className="flex-1" />
      </div>
    );
  }

  return (
    <AccountProvider>
      <MediaLibraryProvider>
        <ImportProvider>
          <AuthOverlayProvider>
            <ReplayProvider>
              <WelcomeProvider>
                <div className="flex h-screen overflow-hidden">
                  {!isDirectReplay && <Sidebar collapsed={collapsed} onToggle={toggle} />}
                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
                    {!isDirectReplay && <GlobalSearch />}
                    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
                      {children}
                    </main>
                  </div>
                  <WelcomeModal />
                </div>
              </WelcomeProvider>
            </ReplayProvider>
          </AuthOverlayProvider>
        </ImportProvider>
      </MediaLibraryProvider>
    </AccountProvider>
  );
}
