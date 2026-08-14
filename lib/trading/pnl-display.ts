import type { AggregatedTrade } from './aggregator';

export interface TradePnlDisplay {
  isConverted: boolean;
  primaryAmount: number;
  primaryCurrency: string;
  secondaryAmount?: number;
  secondaryCurrency?: string;
}

export function getTradePnlDisplay(
  trade: AggregatedTrade,
  baseCurrency: string,
  showBaseCurrency: boolean,
): TradePnlDisplay {
  const nativeCurrency = trade.currency ?? baseCurrency;
  const isConverted = nativeCurrency.toUpperCase() !== baseCurrency.toUpperCase();
  const nativeAmount = trade.nativeNetPnL ?? trade.netPnL;

  if (!isConverted) {
    return {
      isConverted: false,
      primaryAmount: trade.netPnL,
      primaryCurrency: baseCurrency,
    };
  }

  return showBaseCurrency
    ? {
        isConverted: true,
        primaryAmount: trade.netPnL,
        primaryCurrency: baseCurrency,
        secondaryAmount: nativeAmount,
        secondaryCurrency: nativeCurrency,
      }
    : {
        isConverted: true,
        primaryAmount: nativeAmount,
        primaryCurrency: nativeCurrency,
        secondaryAmount: trade.netPnL,
        secondaryCurrency: baseCurrency,
      };
}
