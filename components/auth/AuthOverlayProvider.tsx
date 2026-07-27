'use client';

import dynamic from 'next/dynamic';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const AuthModal = dynamic(() => import('./AuthModal'), { ssr: false });
const AUTH_PARAM = 'auth';
const SIGN_IN_VALUE = 'sign-in';

interface AuthOverlayContextValue {
  openSignIn: () => void;
  closeSignIn: () => void;
}

const AuthOverlayContext = createContext<AuthOverlayContextValue | null>(null);

function isSignInUrl() {
  return new URL(window.location.href).searchParams.get(AUTH_PARAM) === SIGN_IN_VALUE;
}

function callbackUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(AUTH_PARAM);
  return url.toString();
}

export function AuthOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSignIn = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set(AUTH_PARAM, SIGN_IN_VALUE);
    window.history.pushState(
      { ...window.history.state, tradingDiaryAuthOverlay: true },
      '',
      url,
    );
    setIsOpen(true);
  }, []);

  const closeSignIn = useCallback(() => {
    if (window.history.state?.tradingDiaryAuthOverlay) {
      window.history.back();
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete(AUTH_PARAM);
    window.history.replaceState(window.history.state, '', url);
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const restoreFrame = requestAnimationFrame(() => setIsOpen(isSignInUrl()));
    const handlePopState = () => setIsOpen(isSignInUrl());
    window.addEventListener('popstate', handlePopState);
    return () => {
      cancelAnimationFrame(restoreFrame);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const value = useMemo(
    () => ({ openSignIn, closeSignIn }),
    [closeSignIn, openSignIn],
  );

  return (
    <AuthOverlayContext.Provider value={value}>
      {children}
      {isOpen && <AuthModal callbackURL={callbackUrl()} onClose={closeSignIn} />}
    </AuthOverlayContext.Provider>
  );
}

export function useAuthOverlay() {
  const context = useContext(AuthOverlayContext);
  if (!context) {
    throw new Error('useAuthOverlay must be used within AuthOverlayProvider');
  }
  return context;
}
