'use client';

import { MediaGrid } from '@/packages/react-media-library/src/components/MediaGrid';
import { tailwindPreset, lucideIcons } from '@/packages/react-media-library/src/presets';

export default function MediaPage() {
  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">Media Library</h1>
      <MediaGrid preset={tailwindPreset} icons={lucideIcons} />
    </div>
  );
}
