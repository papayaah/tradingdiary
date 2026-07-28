'use client';

import { Suspense, type ReactNode } from 'react';
import { Images, Upload } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import TradeImportWorkspace from '@/components/import/TradeImportWorkspace';
import { tradingDiaryMediaTheme } from '@/lib/media/theme';
import { MediaGrid } from '@/packages/react-media-library/src/components/MediaGrid';
import { lucideIcons, tailwindPreset } from '@/packages/react-media-library/src/presets';

type LibraryView = 'media' | 'import';

function LibraryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: LibraryView = searchParams.get('view') === 'import' ? 'import' : 'media';

  function setView(nextView: LibraryView) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === 'media') params.delete('view');
    else params.set('view', nextView);
    const query = params.toString();
    router.replace(query ? `/media?${query}` : '/media', { scroll: false });
  }

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">Library</h1>
        <p className="mt-2 text-sm text-muted">
          Manage media assets or import trading history into your journal.
        </p>
      </header>

      <nav
        aria-label="Library sections"
        className="inline-flex rounded-xl border border-card-border bg-muted-bg/50 p-1"
      >
        <LibraryTab
          active={view === 'media'}
          icon={<Images size={16} />}
          label="Media"
          onClick={() => setView('media')}
        />
        <LibraryTab
          active={view === 'import'}
          icon={<Upload size={16} />}
          label="Import Trades"
          onClick={() => setView('import')}
        />
      </nav>

      {view === 'media' ? (
        <MediaGrid
          preset={tailwindPreset}
          icons={lucideIcons}
          theme="inherit"
          tokens={tradingDiaryMediaTheme}
          showHeader={false}
          style={{ padding: 0 }}
        />
      ) : (
        <TradeImportWorkspace />
      )}
    </div>
  );
}

function LibraryTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-card-bg text-accent shadow-sm ring-1 ring-card-border'
          : 'text-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function MediaPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Loading library…</div>}>
      <LibraryPageContent />
    </Suspense>
  );
}
