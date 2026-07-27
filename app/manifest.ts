import type { MetadataRoute } from 'next';

// App Router generates /manifest.webmanifest from this and auto-injects the
// <link rel="manifest">. display: standalone is required before iOS 16.4+ will
// permit Web Push for the site installed to the Home Screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trading Diary',
    short_name: 'Diary',
    description: 'Your personal trading journal',
    start_url: '/watch',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
