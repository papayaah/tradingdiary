'use client';

import { createPortal } from 'react-dom';

interface FocusBackdropProps {
  label: string;
  onDismiss: () => void;
}

/**
 * Full-viewport dim + blur that focuses one element. Portalled to document.body
 * so it sits above page content at z-[80]; lift the focused element to z-[100]
 * so it "pops" above the dim. Click (or the accessible label) dismisses.
 * Shared across Market Watch and the Journal so focus behaves identically.
 */
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
