import Image from 'next/image';

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
}

export default function BrandLogo({ className = 'h-8 w-8', priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/brand/market-watcher-owl.svg"
      alt="Trading Diary"
      width={512}
      height={512}
      priority={priority}
      className={`object-contain ${className}`}
    />
  );
}
