import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['bullmq', 'ioredis'],
  async rewrites() {
    if (process.env.NEXT_PUBLIC_SERVER_URL) {
      return [
        {
          source: '/api/watch/:path*',
          destination: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/watch/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
