import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['bullmq', 'ioredis'],

  // ---------------------------------------------------------------------------
  // Remote API proxy — DISABLED for local-first development.
  //
  // When NEXT_PUBLIC_SERVER_URL was set, this rewrote EVERY /api/* request
  // (including /api/auth/*) to that remote server. Proxying auth cross-origin
  // breaks Google sign-in — the OAuth flow must run on the same origin as the
  // page. It also meant the local app silently read the remote DB instead of
  // your local one.
  //
  // Kept here (commented) so it's clear the app CAN talk to a remote backend.
  // To re-enable safely, uncomment and EXCLUDE /api/auth from the proxy, e.g.
  //   source: '/api/:path((?!auth/).*)'
  // and set NEXT_PUBLIC_SERVER_URL.
  //
  // async rewrites() {
  //   if (process.env.NEXT_PUBLIC_SERVER_URL) {
  //     return [
  //       { source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/:path*` },
  //     ];
  //   }
  //   return [];
  // },
};

export default nextConfig;
