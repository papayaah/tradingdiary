import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ClientProviders } from '@/components/providers/ClientProviders';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tradingdiary.app';
const OG_TITLE = 'Trading Diary — Log Your Trades with an AI Assistant';
const OG_DESCRIPTION =
  'Drop your broker statement for instant P&L stats, giveback tracking, and an AI assistant that breaks down your entries, exits, and execution.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Trading Diary — Log Your Trades with an AI Assistant',
    template: '%s · Trading Diary',
  },
  description: OG_DESCRIPTION,
  keywords: [
    'trading diary',
    'AI trading assistant',
    'AI trade review',
    'trade log import',
    'P&L dashboard',
    'profit giveback',
    'trade leak detector',
    'trade analytics',
    'market scanner',
  ],
  applicationName: 'Trading Diary',
  icons: {
    icon: [
      { url: '/brand/market-watcher-owl.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Trading Diary',
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Trading Diary — log your trades with an AI assistant to track profit giveback and review executions',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#6366f1' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
