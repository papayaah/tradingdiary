'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'td_welcome_seen';

interface WelcomeContextType {
  isOpen: boolean;
  openWelcomeModal: () => void;
  closeWelcomeModal: (dontShowAgain?: boolean) => void;
}

const WelcomeContext = createContext<WelcomeContextType | undefined>(undefined);

export function WelcomeProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setIsOpen(true);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const openWelcomeModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeWelcomeModal = useCallback((dontShowAgain = false) => {
    setIsOpen(false);
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {
        // Ignore localStorage errors
      }
    }
  }, []);

  return (
    <WelcomeContext.Provider value={{ isOpen, openWelcomeModal, closeWelcomeModal }}>
      {children}
    </WelcomeContext.Provider>
  );
}

export function useWelcome() {
  const context = useContext(WelcomeContext);
  if (!context) {
    throw new Error('useWelcome must be used within a WelcomeProvider');
  }
  return context;
}
