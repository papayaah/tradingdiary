'use client';

import LoginButton from '@/components/auth/LoginButton';
import { TrendingUp, Shield, Zap, Globe, Lock } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    return (
        <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
            </div>

            <div className="w-full max-w-md z-10">
                <div className="text-center mb-10">
                    <Link href="/" className="inline-flex items-center gap-3 mb-6 transition-transform hover:scale-105">
                        <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-xl shadow-accent/40">
                            <TrendingUp size={28} className="text-white" />
                        </div>
                        <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                            Trading Diary
                        </span>
                    </Link>
                    <h1 className="text-4xl font-extrabold tracking-tight mb-3">Welcome back</h1>
                    <p className="text-muted-foreground text-lg">
                        Sign in to sync your trades across all devices.
                    </p>
                </div>

                <div className="bg-card-bg/40 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative">
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <LoginButton />
                        </div>

                        <div className="relative flex items-center py-2">
                            <div className="flex-grow border-t border-white/5"></div>
                            <span className="flex-shrink mx-4 text-xs font-medium text-white/30 uppercase tracking-widest">Secure Cloud Sync</span>
                            <div className="flex-grow border-t border-white/5"></div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                                <Shield size={20} className="text-accent" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">Protected</span>
                            </div>
                            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                                <Zap size={20} className="text-blue-400" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">Instant Sync</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-10 text-center">
                    <p className="text-muted-foreground text-sm flex items-center justify-center gap-2">
                        <Lock size={14} className="text-white/40" />
                        Your data is encrypted and secure.
                    </p>
                </div>

                <div className="mt-20 grid grid-cols-3 gap-8 opacity-40">
                    <div className="flex flex-col items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Hetzner VPS</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">PostgreSQL</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Better Auth</span>
                    </div>
                </div>
            </div>

            {/* Aesthetic decorative element */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/5 rounded-full pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/5 rounded-full pointer-events-none" />
        </div>
    );
}
