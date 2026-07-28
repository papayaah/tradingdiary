import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PatternPromoConfig } from '../types';
import { videoTheme } from '../theme';

type AnimatedCandlesProps = {
  pattern: PatternPromoConfig;
};

export function AnimatedCandles({ pattern }: AnimatedCandlesProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prices = pattern.candles.flatMap((candle) => [candle.high, candle.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = Math.max((maxPrice - minPrice) * 0.18, 0.5);
  const chartMin = minPrice - padding;
  const chartMax = maxPrice + padding;
  const priceY = (price: number) => 440 - ((price - chartMin) / (chartMax - chartMin)) * 330;
  const signalColor = pattern.direction === 'bullish' ? videoTheme.profit : videoTheme.loss;

  return (
    <svg viewBox="0 0 880 540" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line
          key={ratio}
          x1={42}
          x2={838}
          y1={110 + ratio * 330}
          y2={110 + ratio * 330}
          stroke={videoTheme.grid}
          strokeDasharray="6 12"
          strokeWidth={2}
        />
      ))}

      {pattern.candles.map((candle, index) => {
        const appear = spring({
          frame: frame - 40 - index * 14,
          fps,
          config: { damping: 18, stiffness: 180, mass: 0.65 },
        });
        const x = 92 + index * 96;
        const bullish = candle.close >= candle.open;
        const color = bullish ? videoTheme.profit : videoTheme.loss;
        const openY = priceY(candle.open);
        const closeY = priceY(candle.close);
        const bodyHeight = Math.max(8, Math.abs(closeY - openY));
        const scaledHeight = Math.max(6, bodyHeight * appear);
        const centerY = (openY + closeY) / 2;
        const signalOpacity = candle.signal
          ? interpolate(frame, [145, 164], [0, 0.14], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          : 0;

        return (
          <g key={`${candle.open}-${index}`} opacity={appear}>
            <rect
              x={x - 34}
              y={priceY(candle.high) - 18}
              width={68}
              height={priceY(candle.low) - priceY(candle.high) + 36}
              rx={18}
              fill={signalColor}
              opacity={signalOpacity}
            />
            <line
              x1={x}
              x2={x}
              y1={priceY(candle.high)}
              y2={priceY(candle.low)}
              stroke={color}
              strokeWidth={7}
              strokeLinecap="round"
            />
            <rect
              x={x - 19}
              y={centerY - scaledHeight / 2}
              width={38}
              height={scaledHeight}
              rx={6}
              fill={color}
            />
            {typeof candle.volume === 'number' ? (
              <rect
                x={x - 23}
                y={510 - candle.volume * 45 * appear}
                width={46}
                height={candle.volume * 45 * appear}
                rx={5}
                fill={color}
                opacity={0.48}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
