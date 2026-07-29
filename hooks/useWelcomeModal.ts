'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'td_welcome_seen';

export function useWelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setIsOpen(true);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    } finally {
      setHasChecked(true);
    }
  }, []);

  const closeModal = useCallback((dontShowAgain = false) => {
    setIsOpen(false);
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  return {
    isOpen,
    hasChecked,
    openModal,
    closeModal,
  };
}
