'use client';

import { useIntegrationContext } from '@/packages/better-auth-connect/src/components';
import { LogIn, LogOut, Loader2, User as UserIcon, LogIn as LogInIcon } from 'lucide-react';
import { useState, useEffect } from 'react';

interface LoginButtonProps {
    collapsed?: boolean;
}

export default function LoginButton({ collapsed = false }: LoginButtonProps) {
    const { services, authClient } = useIntegrationContext();
    const sessionState = authClient.useSession?.() || { data: null, isPending: true };
    const session = sessionState.data || null;
    const isLoading = sessionState.isPending;

    const handleLogin = async () => {
        try {
            await services.google.connect();
        } catch (error) {
            console.error('Login failed:', error);
        }
    };

    const handleLogout = async () => {
        try {
            await authClient.signOut();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    if (isLoading) {
        return (
            <div className={`flex items-center gap-2 rounded-lg bg-muted/10 p-2 text-muted-foreground ${collapsed ? 'justify-center' : ''}`}>
                <Loader2 size={18} className="animate-spin" />
                {!collapsed && <span className="text-xs font-medium">Checking...</span>}
            </div>
        );
    }

    if (session?.user) {
        if (collapsed) {
            return (
                <button
                    onClick={handleLogout}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-sidebar-border hover:bg-red-500/10 hover:border-red-500/50 transition-all overflow-hidden group relative"
                    title={`Sign out (${session.user.name})`}
                >
                    {session.user.image ? (
                        <img src={session.user.image} alt={session.user.name} className="w-full h-full object-cover group-hover:opacity-20 transition-opacity" />
                    ) : (
                        <UserIcon size={14} className="group-hover:opacity-20 transition-opacity" />
                    )}
                    <LogOut size={12} className="absolute inset-0 m-auto opacity-0 group-hover:opacity-100 text-red-500 transition-opacity" />
                </button>
            );
        }

        return (
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-sidebar-hover/50 border border-sidebar-border/50">
                <div className="flex items-center gap-2 overflow-hidden">
                    {session.user.image ? (
                        <img src={session.user.image} alt={session.user.name} className="w-7 h-7 rounded-full border border-sidebar-border" />
                    ) : (
                        <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center">
                            <UserIcon size={12} />
                        </div>
                    )}
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-foreground truncate">{session.user.name}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{session.user.email}</span>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Sign Out"
                >
                    <LogOut size={14} />
                </button>
            </div>
        );
    }

    if (collapsed) {
        return (
            <button
                onClick={handleLogin}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent text-white hover:bg-accent/90 transition-all shadow-lg shadow-accent/20 active:scale-95"
                title="Sign in with Google"
            >
                <LogInIcon size={18} />
            </button>
        );
    }

    return (
        <button
            onClick={handleLogin}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm font-bold rounded-xl bg-accent text-white hover:bg-accent/90 transition-all shadow-lg shadow-accent/20 active:scale-95 group"
        >
            <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center p-0.5 group-hover:scale-110 transition-transform flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-full h-full">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
            </div>
            <span className="truncate">Sign in with Google</span>
        </button>
    );
}
