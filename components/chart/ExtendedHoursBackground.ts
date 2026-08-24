import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CandleData } from '@/lib/chart/patterns';
import { etWallClockToEpochSeconds } from '@/lib/chart/execution-time';

export interface ExtendedHoursRange {
  session: 'pre' | 'post';
  startTime: number;
  endTime: number;
}

export function buildExtendedHoursRanges(
  candles: readonly CandleData[],
  date?: string,
): ExtendedHoursRange[] {
  if (!date || candles.length === 0) return [];
  const preStart = etWallClockToEpochSeconds(date, '04:00:00');
  const regularStart = etWallClockToEpochSeconds(date, '09:30:00');
  const regularEnd = etWallClockToEpochSeconds(date, '16:00:00');
  const postEnd = etWallClockToEpochSeconds(date, '20:00:00');
  if (preStart === null || regularStart === null || regularEnd === null || postEnd === null) return [];

  const rangeFor = (
    session: ExtendedHoursRange['session'],
    from: number,
    to: number,
  ): ExtendedHoursRange | null => {
    const sessionCandles = candles.filter((candle) => candle.time >= from && candle.time < to);
    if (sessionCandles.length === 0) return null;
    return {
      session,
      startTime: sessionCandles[0].time,
      endTime: sessionCandles[sessionCandles.length - 1].time,
    };
  };

  return [
    rangeFor('pre', preStart, regularStart),
    rangeFor('post', regularEnd, postEnd),
  ].filter((range): range is ExtendedHoursRange => range !== null);
}

export class ExtendedHoursBackgroundPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private candles: readonly CandleData[] = [];
  private ranges: ExtendedHoursRange[] = [];
  private enabled = false;
  private isDark = true;
  private requestUpdate?: () => void;
  private readonly views: readonly IPrimitivePaneView[];

  constructor(
    private readonly formatCandleTime: (timestamp: number) => Time,
  ) {
    this.views = [new ExtendedHoursPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
  }

  update(candles: readonly CandleData[], date: string | undefined, enabled: boolean, isDark: boolean) {
    this.candles = candles;
    this.ranges = enabled ? buildExtendedHoursRanges(candles, date) : [];
    this.enabled = enabled;
    this.isDark = isDark;
    this.requestUpdate?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]) {
    if (!this.enabled || !this.chart || !this.series || this.ranges.length === 0) return;
    target.useMediaCoordinateSpace((scope) => {
      if (!this.chart) return;
      const timeScale = this.chart.timeScale();
      const { width, height } = scope.mediaSize;
      const context = scope.context;

      let barWidth = 6;
      if (this.candles.length >= 2) {
        const first = timeScale.timeToCoordinate(this.formatCandleTime(this.candles[0].time));
        const second = timeScale.timeToCoordinate(this.formatCandleTime(this.candles[1].time));
        if (first !== null && second !== null) barWidth = Math.abs(second - first);
      }

      for (const range of this.ranges) {
        const start = timeScale.timeToCoordinate(this.formatCandleTime(range.startTime));
        const end = timeScale.timeToCoordinate(this.formatCandleTime(range.endTime));
        if (start === null || end === null) continue;
        const left = Math.max(0, Math.min(start, end) - barWidth / 2);
        const right = Math.min(width, Math.max(start, end) + barWidth / 2);
        if (right <= left) continue;

        context.fillStyle = range.session === 'pre'
          ? (this.isDark ? 'rgba(59, 130, 246, 0.075)' : 'rgba(59, 130, 246, 0.055)')
          : (this.isDark ? 'rgba(139, 92, 246, 0.08)' : 'rgba(124, 58, 237, 0.055)');
        context.fillRect(left, 0, right - left, height);
      }
    });
  }
}

class ExtendedHoursPaneView implements IPrimitivePaneView {
  constructor(private readonly primitive: ExtendedHoursBackgroundPrimitive) {}

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer {
    return { draw: (target) => this.primitive.draw(target) };
  }
}
