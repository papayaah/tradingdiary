import { getVideoTheme } from '../theme';

export function BrandHeader({
  themeMode = 'dark',
  title = 'Candle Signals',
  logoSize = 170,
}: {
  themeMode?: 'light' | 'dark';
  title?: string;
  logoSize?: number;
}) {
  const videoTheme = getVideoTheme(themeMode);

  return (
    <div
      style={{
        position: 'absolute',
        left: 44,
        right: 44,
        top: 36,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
      }}
    >
      {/* Massive Owl SVG Logo (NO GLOW, Zero Padding, Maximum Scale) */}
      <div
        style={{
          width: logoSize,
          height: logoSize,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 512 512" style={{ width: '100%', height: '100%' }}>
          <g transform="translate(0 40)">
            <path
              fill="#183B72"
              d="M38 62C80 79 123 84 166 77C203 71 234 81 256 106C278 81 309 71 346 77C389 84 432 79 474 62C479 60 483 64 482 70C479 109 466 140 441 165C455 189 462 216 462 244C462 306 382 350 256 350C130 350 50 306 50 244C50 216 57 189 71 165C46 140 33 109 30 70C29 64 33 60 38 62Z"
            />
            <path fill="#FFFFFF" d="M214 218H298L256 294L214 218Z" />
            <circle cx="173" cy="207" r="82" fill="#FFFFFF" />
            <circle cx="339" cy="207" r="82" fill="#FFFFFF" />
            <g fill="#20B86A">
              <rect x="168" y="157" width="10" height="100" rx="5" />
              <rect x="147" y="175" width="52" height="64" rx="5" />
            </g>
            <g fill="#D93443">
              <rect x="334" y="157" width="10" height="100" rx="5" />
              <rect x="313" y="175" width="52" height="64" rx="5" />
            </g>
          </g>
        </svg>
      </div>

      {/* Massive Bold Title Right Next to the Logo */}
      {title && (
        <div
          style={{
            fontSize: 78,
            fontWeight: 900,
            letterSpacing: -1.5,
            color: videoTheme.foreground,
            lineHeight: 1,
          }}
        >
          {title}
        </div>
      )}
    </div>
  );
}
