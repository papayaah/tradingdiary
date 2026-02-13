'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/sidebar/Sidebar';

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
    setMounted(true);
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
        <div className="w-[220px] bg-sidebar-bg border-r border-sidebar-border" />
        <main className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
