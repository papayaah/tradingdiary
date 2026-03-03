'use client';

import { MediaAttachmentStrip } from '@/packages/react-media-library/src/components/MediaAttachmentStrip';
import { lucideIcons } from '@/packages/react-media-library/src/presets';

interface ScreenshotAttachmentProps {
  screenshotIds: number[];
  onAdd: (assetId: number) => void;
  onRemove: (assetId: number) => void;
}

export default function ScreenshotAttachment({
  screenshotIds,
  onAdd,
  onRemove,
}: ScreenshotAttachmentProps) {
  return (
    <MediaAttachmentStrip
      assetIds={screenshotIds}
      onAdd={onAdd}
      onRemove={onRemove}
      accept="image/*"
      icons={lucideIcons}
    />
  );
}
