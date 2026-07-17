import type { TransactionRecord } from '../db/schema';
import { timeToSeconds } from './engine';

export interface RoundTripExecution {
  tradeId: string;
  time: string;
  timeSeconds: number;
  side: string;
  quantity: number;
  price: number;
  commission: number;
}

export interface RoundTrip {
  index: number; // 1-based trip number for the day
  symbol: string;
  side: 'LONG' | 'SHORT';
  startTime: string;
  endTime: string | null; // null = still open
  startTimeSeconds: number;
  endTimeSeconds: number | null;
  executions: RoundTripExecution[];
  entryQty: number;
  entryAvgPrice: number;
  exitAvgPrice: number | null;
  grossPnL: number;
  totalCommissions: number;
  netPnL: number;
  isOpen: boolean;
  currentQty: number; // absolute current position size
  currentAvgCost: number;
}

interface FIFOLot {
  qty: number;
  costPerShare: number;
  commission: number;
}

/**
 * Segment a symbol's transactions into individual round trips.
 * A round trip starts when position goes from flat → non-flat,
 * and ends when position returns to flat (net qty == 0).
 */
export function computeRoundTrips(
  transactions: TransactionRecord[],
  symbol: string
): RoundTrip[] {
  const symbolTxns = transactions
    .filter((t) => t.symbol === symbol)
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return timeToSeconds(a.time) - timeToSeconds(b.time);
    });

  if (symbolTxns.length === 0) return [];

  const roundTrips: RoundTrip[] = [];
  let tripIndex = 0;

  let currentTrip: {
    executions: RoundTripExecution[];
    lots: FIFOLot[];
    netQty: number;
    side: 'LONG' | 'SHORT';
    realizedGross: number;
    totalCommission: number;
    totalEntryQty: number;
    totalEntryCost: number;
    totalExitQty: number;
    totalExitCost: number;
    startTime: string;
  } | null = null;

  for (const t of symbolTxns) {
    const isOpening = t.side === 'BUYTOOPEN' || t.side === 'SELLTOOPEN';
    const qty = Math.abs(t.quantity);
    const ts = timeToSeconds(t.time);

    const execution: RoundTripExecution = {
      tradeId: t.tradeId,
      time: t.time,
      timeSeconds: ts,
      side: t.side,
      quantity: qty,
      price: t.price,
      commission: t.commission,
    };

    // Starting a new trip?
    if (currentTrip === null) {
      tripIndex++;
      const side: 'LONG' | 'SHORT' =
        t.side === 'SELLTOOPEN' ? 'SHORT' : 'LONG';
      currentTrip = {
        executions: [execution],
        lots: [],
        netQty: 0,
        side,
        realizedGross: 0,
        totalCommission: 0,
        totalEntryQty: 0,
        totalEntryCost: 0,
        totalExitQty: 0,
        totalExitCost: 0,
        startTime: t.time,
      };
    } else {
      currentTrip.executions.push(execution);
    }

    if (isOpening) {
      currentTrip.lots.push({
        qty,
        costPerShare: Math.abs(t.totalValue) / qty,
        commission: t.commission,
      });
      currentTrip.netQty += t.side === 'BUYTOOPEN' ? qty : -qty;
      currentTrip.totalEntryQty += qty;
      currentTrip.totalEntryCost += Math.abs(t.totalValue);
    } else {
      // Closing — FIFO match
      let remaining = qty;
      const closePrice = Math.abs(t.totalValue) / qty;

      while (remaining > 0.001 && currentTrip.lots.length > 0) {
        const lot = currentTrip.lots[0];
        const matched = Math.min(remaining, lot.qty);

        const isLong = t.side === 'SELLTOCLOSE';
        if (isLong) {
          currentTrip.realizedGross +=
            (closePrice - lot.costPerShare) * matched;
        } else {
          currentTrip.realizedGross +=
            (lot.costPerShare - closePrice) * matched;
        }

        // Allocate opening lot commission proportionally
        const lotFraction = matched / (matched + (lot.qty - matched));
        currentTrip.totalCommission += lot.commission * lotFraction;
        lot.commission -= lot.commission * lotFraction;

        lot.qty -= matched;
        remaining -= matched;
        if (lot.qty < 0.001) currentTrip.lots.shift();
      }

      // Closing commission
      currentTrip.totalCommission += t.commission;
      currentTrip.netQty += t.side === 'BUYTOCLOSE' ? qty : -qty;
      currentTrip.totalExitQty += qty;
      currentTrip.totalExitCost += Math.abs(t.totalValue);
    }

    // Check if position returned to flat → trip complete
    if (Math.abs(currentTrip.netQty) < 0.01 && currentTrip.executions.length > 1) {
      const netPnL = currentTrip.realizedGross + currentTrip.totalCommission;
      roundTrips.push({
        index: tripIndex,
        symbol,
        side: currentTrip.side,
        startTime: currentTrip.startTime,
        endTime: t.time,
        startTimeSeconds: timeToSeconds(currentTrip.startTime),
        endTimeSeconds: ts,
        executions: currentTrip.executions,
        entryQty: currentTrip.totalEntryQty,
        entryAvgPrice:
          currentTrip.totalEntryQty > 0
            ? currentTrip.totalEntryCost / currentTrip.totalEntryQty
            : 0,
        exitAvgPrice:
          currentTrip.totalExitQty > 0
            ? currentTrip.totalExitCost / currentTrip.totalExitQty
            : 0,
        grossPnL: currentTrip.realizedGross,
        totalCommissions: currentTrip.totalCommission,
        netPnL,
        isOpen: false,
        currentQty: 0,
        currentAvgCost: 0,
      });
      currentTrip = null; // Reset for next trip
    }
  }

  // If there's an unclosed trip at end, add it as open
  if (currentTrip !== null) {
    const openQty = currentTrip.lots.reduce((s, l) => s + l.qty, 0);
    const openCost = currentTrip.lots.reduce(
      (s, l) => s + l.qty * l.costPerShare,
      0
    );
    const netPnL = currentTrip.realizedGross + currentTrip.totalCommission;
    roundTrips.push({
      index: tripIndex,
      symbol,
      side: currentTrip.side,
      startTime: currentTrip.startTime,
      endTime: null,
      startTimeSeconds: timeToSeconds(currentTrip.startTime),
      endTimeSeconds: null,
      executions: currentTrip.executions,
      entryQty: currentTrip.totalEntryQty,
      entryAvgPrice:
        currentTrip.totalEntryQty > 0
          ? currentTrip.totalEntryCost / currentTrip.totalEntryQty
          : 0,
      exitAvgPrice: null,
      grossPnL: currentTrip.realizedGross,
      totalCommissions: currentTrip.totalCommission,
      netPnL,
      isOpen: true,
      currentQty: Math.abs(currentTrip.netQty),
      currentAvgCost: openQty > 0.001 ? openCost / openQty : 0,
    });
  }

  return roundTrips;
}

/**
 * Given the current replay time, find:
 * 1. All completed round trips so far
 * 2. The currently active (in-progress) round trip, if any
 */
export function getRoundTripState(
  roundTrips: RoundTrip[],
  currentTimeSeconds: number
): {
  completedTrips: RoundTrip[];
  activeTrip: RoundTrip | null;
  dayNetPnL: number;
} {
  const completedTrips: RoundTrip[] = [];
  let activeTrip: RoundTrip | null = null;
  let dayNetPnL = 0;

  for (const trip of roundTrips) {
    if (trip.startTimeSeconds > currentTimeSeconds) {
      // This trip hasn't started yet
      break;
    }

    if (!trip.isOpen && trip.endTimeSeconds !== null && trip.endTimeSeconds <= currentTimeSeconds) {
      // Fully completed and visible
      completedTrips.push(trip);
      dayNetPnL += trip.netPnL;
    } else if (trip.startTimeSeconds <= currentTimeSeconds) {
      // This trip is in progress — compute partial state
      // Re-compute with only the visible executions
      const visibleExecs = trip.executions.filter(
        (e) => e.timeSeconds <= currentTimeSeconds
      );

      if (visibleExecs.length === 0) continue;

      // Re-run FIFO for visible executions only
      const lots: FIFOLot[] = [];
      let netQty = 0;
      let realizedGross = 0;
      let totalCommission = 0;
      let totalEntryQty = 0;
      let totalEntryCost = 0;
      let totalExitQty = 0;
      let totalExitCost = 0;

      for (const exec of visibleExecs) {
        const isOpening =
          exec.side === 'BUYTOOPEN' || exec.side === 'SELLTOOPEN';
        if (isOpening) {
          lots.push({
            qty: exec.quantity,
            costPerShare: exec.price,
            commission: exec.commission,
          });
          netQty += exec.side === 'BUYTOOPEN' ? exec.quantity : -exec.quantity;
          totalEntryQty += exec.quantity;
          totalEntryCost += exec.price * exec.quantity;
        } else {
          let remaining = exec.quantity;
          const closePrice = exec.price;

          while (remaining > 0.001 && lots.length > 0) {
            const lot = lots[0];
            const matched = Math.min(remaining, lot.qty);

            const isLong = exec.side === 'SELLTOCLOSE';
            if (isLong) {
              realizedGross += (closePrice - lot.costPerShare) * matched;
            } else {
              realizedGross += (lot.costPerShare - closePrice) * matched;
            }

            const lotFraction = matched / (matched + (lot.qty - matched));
            totalCommission += lot.commission * lotFraction;
            lot.commission -= lot.commission * lotFraction;

            lot.qty -= matched;
            remaining -= matched;
            if (lot.qty < 0.001) lots.shift();
          }

          totalCommission += exec.commission;
          netQty +=
            exec.side === 'BUYTOCLOSE' ? exec.quantity : -exec.quantity;
          totalExitQty += exec.quantity;
          totalExitCost += exec.price * exec.quantity;
        }
      }

      const openQty = lots.reduce((s, l) => s + l.qty, 0);
      const openCost = lots.reduce(
        (s, l) => s + l.qty * l.costPerShare,
        0
      );
      const netPnL = realizedGross + totalCommission;
      const isFlat = Math.abs(netQty) < 0.01;

      if (isFlat) {
        // Trip completed during visible window
        completedTrips.push({
          ...trip,
          netPnL,
          grossPnL: realizedGross,
          totalCommissions: totalCommission,
          isOpen: false,
          currentQty: 0,
          currentAvgCost: 0,
        });
        dayNetPnL += netPnL;
      } else {
        // Trip is actively in progress
        activeTrip = {
          ...trip,
          executions: visibleExecs.map((e) => ({
            ...e,
          })),
          grossPnL: realizedGross,
          totalCommissions: totalCommission,
          netPnL,
          isOpen: true,
          currentQty: Math.abs(netQty),
          currentAvgCost: openQty > 0.001 ? openCost / openQty : 0,
          entryAvgPrice:
            totalEntryQty > 0 ? totalEntryCost / totalEntryQty : 0,
          exitAvgPrice:
            totalExitQty > 0 ? totalExitCost / totalExitQty : null,
        };
        dayNetPnL += netPnL;
      }
    }
  }

  return { completedTrips, activeTrip, dayNetPnL };
}
