'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PortfolioPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="p-8 flex items-center justify-center min-h-[50vh]">
      <div className="animate-pulse text-sm font-medium text-muted">
        Redirecting to Dashboard...
      </div>
    </div>
  );
}
