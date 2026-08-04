'use client';

import { createPortal } from 'react-dom';

interface FocusBackdropProps {
  label: string;
  onDismiss: () => void;
}

export default function FocusBackdrop({ label, onDismiss }: FocusBackdropProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <button
      type="button"
      aria-label={label}
      onClick={onDismiss}
      className="fixed inset-0 z-[80] cursor-default bg-focus-backdrop backdrop-blur-[2px] animate-in fade-in duration-150"
    />,
    document.body,
  );
}
