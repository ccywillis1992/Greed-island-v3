import { Trade, CashEntry, OtherProductRecord, DailySnapshot, PriceCacheEntry, Position, Market, Broker, MarketFilter, BrokerFilter } from '../types';

/**
 * MODULE 4: Portfolio Calculation Engine
 * Pure functions with no side effects.
 */

/**
 * Normalizes HK or Crypto ticker symbols for price cache lookup
 */
export function normalizeTickerKey(ticker: string, market: Market): string {
  const clean = ticker.trim().toUpperCase();
  if (market === 'HK') {
    let padded = clean;
    if (/^\d{1,4}$/.test(clean)) {
      padded = clean.padStart(4, '0');
    }
    return padded.endsWith('.HK') ? padded : `${padded}.HK`;
  }
  if (market === 'CRYPTO') {
    return clean.endsWith('-USD') ? clean : `${clean}-USD`;
  }
  return clean;
}

/**
 * 1. computePositions(trades, priceCache, brokerFilter)
 * Aggregates trades into positions. Handles BUY/SELL basis, broker merging,
 * sold-out removal, price cache merging, and return % calculations.
 */
export function computePositions(
  trades: Trade[],
  priceCache: Record<string, PriceCacheEntry> = {},
  brokerFilter: Broker | 'ALL' = 'ALL'
): Position[] {
  // 1. Sort trades chronologically
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // 2. Map to accumulate positions by key `${broker}:${market}:${ticker}`
  const positionMap: Record<
    string,
    {
      ticker: string;
      market: Market;
      broker: Broker;
      quantity: number;
      totalCost: number;
      avgCost: number;
    }
  > = {};

  for (const trade of sortedTrades) {
    if (brokerFilter !== 'ALL' && trade.broker !== brokerFilter) {
      continue;
    }

    const key = `${trade.broker}:${trade.market}:${trade.ticker.toUpperCase()}`;
    if (!positionMap[key]) {
      positionMap[key] = {
        ticker: trade.ticker.toUpperCase(),
        market: trade.market,
        broker: trade.broker,
        quantity: 0,
        totalCost: 0,
        avgCost: 0,
      };
    }

    const pos = positionMap[key];
    const tradeQty = Number(trade.quantity);
    const tradePrice = Number(trade.price);
    const tradeTotal = trade.totalAmount ? Number(trade.totalAmount) : tradeQty * tradePrice;

    if (trade.action === 'BUY') {
      pos.quantity += tradeQty;
      pos.totalCost += tradeTotal;
      pos.avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
    } else if (trade.action === 'SELL') {
      // Average cost remains unchanged on SELL
      pos.quantity = Math.max(0, pos.quantity - tradeQty);
      pos.totalCost = pos.quantity * pos.avgCost;
    }
  }

  // Convert map to array
  let rawPositions = Object.values(positionMap).filter((p) => p.quantity > 0.00001);

  // 3. Handle Broker Merging when brokerFilter = "ALL"
  let aggregatedPositions: Array<{
    ticker: string;
    market: Market;
    broker: Broker;
    quantity: number;
    totalCost: number;
    avgCost: number;
  }> = [];

  if (brokerFilter === 'ALL') {
    const mergedMap: Record<
      string,
      {
        ticker: string;
        market: Market;
        quantity: number;
        totalCost: number;
      }
    > = {};

    for (const pos of rawPositions) {
      const mergedKey = `${pos.market}:${pos.ticker}`;
      if (!mergedMap[mergedKey]) {
        mergedMap[mergedKey] = {
          ticker: pos.ticker,
          market: pos.market,
          quantity: 0,
          totalCost: 0,
        };
      }
      mergedMap[mergedKey].quantity += pos.quantity;
      mergedMap[mergedKey].totalCost += pos.totalCost;
    }

    aggregatedPositions = Object.values(mergedMap)
      .filter((m) => m.quantity > 0.00001)
      .map((m) => ({
        ticker: m.ticker,
        market: m.market,
        broker: 'ALL' as Broker,
        quantity: m.quantity,
        totalCost: m.totalCost,
        avgCost: m.quantity > 0 ? m.totalCost / m.quantity : 0,
      }));
  } else {
    aggregatedPositions = rawPositions;
  }

  // 4. Enrich with priceCache data and compute currentValue & returnPct
  const finalPositions: Position[] = aggregatedPositions.map((pos) => {
    const normalizedKey = normalizeTickerKey(pos.ticker, pos.market);
    
    // Check priceCache with fallback keys
    const cacheEntry =
      priceCache[`${pos.market}:${pos.ticker}`] ||
      priceCache[`${pos.market}:${normalizedKey}`] ||
      priceCache[pos.ticker] ||
      priceCache[normalizedKey];

    const currentPrice =
      cacheEntry && typeof cacheEntry.price === 'number' && cacheEntry.price > 0
        ? cacheEntry.price
        : pos.avgCost; // Fallback to avgCost if no current price cached

    const currentValue = Math.round(pos.quantity * currentPrice * 100) / 100;
    const roundedTotalCost = Math.round(pos.totalCost * 100) / 100;
    const returnPct =
      roundedTotalCost > 0
        ? Math.round(((currentValue - roundedTotalCost) / roundedTotalCost) * 10000) / 100
        : 0;

    return {
      ticker: pos.ticker,
      market: pos.market,
      broker: pos.broker,
      quantity: Math.round(pos.quantity * 1000) / 1000,
      totalCost: roundedTotalCost,
      avgCost: Math.round(pos.avgCost * 100) / 100,
      currentPrice: Math.round(currentPrice * 100) / 100,
      currentValue,
      returnPct,
    };
  });

  return finalPositions;
}

/**
 * 3. computeCashTotal(cashEntries, brokerFilter)
 * Sum of cash IN minus OUT, optionally filtered by broker.
 */
export function computeCashTotal(
  cashEntries: CashEntry[],
  brokerFilter: Broker | 'ALL' = 'ALL'
): number {
  let total = 0;
  for (const entry of cashEntries) {
    if (brokerFilter !== 'ALL' && entry.broker !== brokerFilter) {
      continue;
    }
    const amount = Number(entry.amount) || 0;
    if (entry.action === 'IN') {
      total += amount;
    } else if (entry.action === 'OUT') {
      total -= amount;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * 2. computeSummaryNumbers(positions, otherProducts, cashEntries, marketFilter, brokerFilter)
 * Calculates Number A, B, C, D strictly as defined in PRD.
 */
export interface SummaryNumbers {
  numberA: number; // Total Assets Ex Cash (Stock/Crypto positions + Other Products)
  numberB: number; // Stock/Crypto Unrealized Gain/Loss in USD
  numberC: number; // Stock/Crypto Return %
  numberD: number; // Net Asset Value (Number A + Cash Total)
}

export function computeSummaryNumbers(
  positions: Position[],
  otherProducts: OtherProductRecord[] = [],
  cashEntries: CashEntry[] = [],
  marketFilter: MarketFilter = 'ALL',
  brokerFilter: BrokerFilter = 'ALL'
): SummaryNumbers {
  // Filter positions
  const filteredPositions = positions.filter((p) => {
    const matchMarket =
      marketFilter === 'ALL' ||
      p.market === marketFilter ||
      (marketFilter === 'US+HK' && (p.market === 'US' || p.market === 'HK'));
    const matchBroker =
      brokerFilter === 'ALL' ||
      (p.broker as string) === brokerFilter ||
      (p.broker as string) === 'ALL';
    return matchMarket && matchBroker;
  });

  // Calculate sum of positions
  const posCurrentValueSum = filteredPositions.reduce((acc, p) => acc + p.currentValue, 0);
  const posTotalCostSum = filteredPositions.reduce((acc, p) => acc + p.totalCost, 0);

  // Other products (Market "OTHER"): Include only if market filter allows
  let otherProductsVal = 0;
  if (marketFilter === 'ALL' || marketFilter === 'OTHER') {
    const latestOther = otherProducts.filter((o) => o.isLatest);
    if (latestOther.length > 0) {
      otherProductsVal = latestOther.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
    } else if (otherProducts.length > 0) {
      // Fallback to last record if isLatest not explicitly flagged
      const sorted = [...otherProducts].sort(
        (a, b) => new Date(b.asOfDate).getTime() - new Date(a.asOfDate).getTime()
      );
      otherProductsVal = Number(sorted[0].totalAmount) || 0;
    }
  }

  // Number A = sum(current values of positions) + sum(other product total amounts)
  const numberA = Math.round((posCurrentValueSum + otherProductsVal) * 100) / 100;

  // Number B = sum(current values) - sum(total costs) [Excludes Other Product per PRD]
  const numberB = Math.round((posCurrentValueSum - posTotalCostSum) * 100) / 100;

  // Number C = (sum current values - sum total costs) / sum total costs * 100
  const numberC =
    posTotalCostSum > 0
      ? Math.round(((posCurrentValueSum - posTotalCostSum) / posTotalCostSum) * 10000) / 100
      : 0;

  // Number D = Number A + Net Cash
  const cashTotal = computeCashTotal(cashEntries, brokerFilter);
  const numberD = Math.round((numberA + cashTotal) * 100) / 100;

  return {
    numberA,
    numberB,
    numberC,
    numberD,
  };
}

/**
 * 4. computePerformance(snapshots)
 * Calculates daily %, YTD, 1M, 3M, 1Y percentage returns based on historical snapshots.
 * Returns null for windows where insufficient historical snapshot data exists.
 */
export interface PerformanceMetrics {
  dailyPct: number | null;
  ytdPct: number | null;
  m1Pct: number | null;
  m3Pct: number | null;
  y1Pct: number | null;
}

export function computePerformance(snapshots: DailySnapshot[]): PerformanceMetrics {
  if (!snapshots || snapshots.length === 0) {
    return {
      dailyPct: null,
      ytdPct: null,
      m1Pct: null,
      m3Pct: null,
      y1Pct: null,
    };
  }

  // Sort chronologically by date ascending
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const latest = sorted[sorted.length - 1];
  const latestNav = latest.totalAssetsWithCash;
  const latestDate = new Date(latest.date);

  // Helper to find closest snapshot on or before a target Date object
  const findClosestSnapshot = (targetDate: Date, maxDaysDiff: number): DailySnapshot | null => {
    let bestMatch: DailySnapshot | null = null;
    let smallestDiff = Infinity;

    for (const snap of sorted) {
      const snapDate = new Date(snap.date);
      const diffDays = (targetDate.getTime() - snapDate.getTime()) / (1000 * 3600 * 24);

      if (diffDays >= 0 && diffDays <= maxDaysDiff) {
        if (diffDays < smallestDiff) {
          smallestDiff = diffDays;
          bestMatch = snap;
        }
      }
    }

    return bestMatch;
  };

  const calcPct = (prevNav: number): number | null => {
    if (!prevNav || prevNav <= 0) return null;
    return Math.round(((latestNav - prevNav) / prevNav) * 10000) / 100;
  };

  // 1. Daily / 1D (Previous available snapshot day)
  let dailyPct: number | null = null;
  if (sorted.length >= 2) {
    const prevSnap = sorted[sorted.length - 2];
    dailyPct = calcPct(prevSnap.totalAssetsWithCash);
  }

  // 2. YTD (Snapshot at or before Dec 31 of previous year)
  let ytdPct: number | null = null;
  const prevYearEnd = new Date(latestDate.getFullYear() - 1, 11, 31);
  const ytdSnap = findClosestSnapshot(prevYearEnd, 30); // within 30 days of prev year end
  if (ytdSnap) {
    ytdPct = calcPct(ytdSnap.totalAssetsWithCash);
  }

  // 3. 1M (~30 days prior)
  let m1Pct: number | null = null;
  const m1Target = new Date(latestDate);
  m1Target.setDate(m1Target.getDate() - 30);
  const m1Snap = findClosestSnapshot(m1Target, 10);
  if (m1Snap) {
    m1Pct = calcPct(m1Snap.totalAssetsWithCash);
  }

  // 4. 3M (~90 days prior)
  let m3Pct: number | null = null;
  const m3Target = new Date(latestDate);
  m3Target.setDate(m3Target.getDate() - 90);
  const m3Snap = findClosestSnapshot(m3Target, 15);
  if (m3Snap) {
    m3Pct = calcPct(m3Snap.totalAssetsWithCash);
  }

  // 5. 1Y (~365 days prior)
  let y1Pct: number | null = null;
  const y1Target = new Date(latestDate);
  y1Target.setDate(y1Target.getDate() - 365);
  const y1Snap = findClosestSnapshot(y1Target, 20);
  if (y1Snap) {
    y1Pct = calcPct(y1Snap.totalAssetsWithCash);
  }

  return {
    dailyPct,
    ytdPct,
    m1Pct,
    m3Pct,
    y1Pct,
  };
}

/**
 * Verification test suite for Module 4 requirements.
 * Verifies merged multi-broker position, single-broker view, and Number A/B/C/D.
 */
export function runCalcSanitySuite(): {
  success: boolean;
  logs: string[];
  sampleData: {
    trades: Trade[];
    cash: CashEntry[];
    other: OtherProductRecord[];
    mergedPositions: Position[];
    ibkrPositions: Position[];
    summary: SummaryNumbers;
  };
} {
  const logs: string[] = [];
  let success = true;

  // Sample Data per specification
  const sampleTrades: Trade[] = [
    {
      id: 't1',
      date: '2026-01-10',
      ticker: 'MSFT',
      market: 'US',
      broker: 'IBKR',
      action: 'BUY',
      quantity: 10,
      price: 300,
      totalAmount: 3000,
    },
    {
      id: 't2',
      date: '2026-01-15',
      ticker: 'MSFT',
      market: 'US',
      broker: 'FUTU',
      action: 'BUY',
      quantity: 5,
      price: 320,
      totalAmount: 1600,
    },
    {
      id: 't3',
      date: '2026-01-20',
      ticker: '1810',
      market: 'HK',
      broker: 'IBKR',
      action: 'BUY',
      quantity: 1000,
      price: 2.0,
      totalAmount: 2000,
    },
    {
      id: 't4',
      date: '2026-02-01',
      ticker: 'MSFT',
      market: 'US',
      broker: 'IBKR',
      action: 'SELL',
      quantity: 2,
      price: 350,
      totalAmount: 700,
    },
  ];

  const sampleCash: CashEntry[] = [
    { id: 'c1', date: '2026-01-01', broker: 'IBKR', action: 'IN', amount: 10000 },
    { id: 'c2', date: '2026-01-05', broker: 'FUTU', action: 'IN', amount: 2000 },
    { id: 'c3', date: '2026-02-05', broker: 'IBKR', action: 'OUT', amount: 3000 },
  ];

  const sampleOther: OtherProductRecord[] = [
    {
      id: 'o1',
      asOfDate: '2026-02-01',
      unrealizedGainLoss: 500,
      performancePct: 10,
      totalAmount: 5000,
      isLatest: true,
    },
  ];

  const samplePriceCache: Record<string, PriceCacheEntry> = {
    'US:MSFT': {
      ticker: 'MSFT',
      market: 'US',
      price: 350.0,
      lastFetchedAt: '2026-02-08T10:00:00Z',
      lastFetchStatus: 'success',
    },
    'HK:1810': {
      ticker: '1810',
      market: 'HK',
      price: 2.5,
      lastFetchedAt: '2026-02-08T10:00:00Z',
      lastFetchStatus: 'success',
    },
  };

  // 1. Merged Multi-Broker Test ("ALL")
  const mergedPositions = computePositions(sampleTrades, samplePriceCache, 'ALL');
  const msftMerged = mergedPositions.find((p) => p.ticker === 'MSFT');

  if (msftMerged) {
    if (msftMerged.quantity === 13) {
      logs.push('✓ Merged MSFT quantity matches expected 13 shares (8 IBKR + 5 FUTU)');
    } else {
      logs.push(`✗ Merged MSFT quantity mismatch: expected 13, got ${msftMerged.quantity}`);
      success = false;
    }

    if (msftMerged.totalCost === 4000) {
      logs.push('✓ Merged MSFT total cost matches expected $4,000.00');
    } else {
      logs.push(`✗ Merged MSFT total cost mismatch: expected $4000, got ${msftMerged.totalCost}`);
      success = false;
    }

    if (msftMerged.currentValue === 4550) {
      logs.push('✓ Merged MSFT current value matches expected $4,550.00');
    } else {
      logs.push(`✗ Merged MSFT current value mismatch: expected $4550, got ${msftMerged.currentValue}`);
      success = false;
    }

    if (Math.abs(msftMerged.returnPct - 13.75) < 0.01) {
      logs.push('✓ Merged MSFT return % matches expected +13.75%');
    } else {
      logs.push(`✗ Merged MSFT return % mismatch: expected 13.75%, got ${msftMerged.returnPct}%`);
      success = false;
    }
  } else {
    logs.push('✗ MSFT merged position not found');
    success = false;
  }

  // 2. Single-Broker View Test ("IBKR")
  const ibkrPositions = computePositions(sampleTrades, samplePriceCache, 'IBKR');
  const msftIbkr = ibkrPositions.find((p) => p.ticker === 'MSFT');

  if (msftIbkr) {
    if (msftIbkr.quantity === 8) {
      logs.push('✓ IBKR-filtered MSFT quantity matches expected 8 shares');
    } else {
      logs.push(`✗ IBKR MSFT quantity mismatch: expected 8, got ${msftIbkr.quantity}`);
      success = false;
    }

    if (msftIbkr.totalCost === 2400) {
      logs.push('✓ IBKR-filtered MSFT total cost matches expected $2,400.00');
    } else {
      logs.push(`✗ IBKR MSFT total cost mismatch: expected $2400, got ${msftIbkr.totalCost}`);
      success = false;
    }
  } else {
    logs.push('✗ IBKR MSFT position not found');
    success = false;
  }

  // 3. Summary Numbers Test (A, B, C, D)
  const summary = computeSummaryNumbers(mergedPositions, sampleOther, sampleCash, 'ALL', 'ALL');

  if (summary.numberA === 12050) {
    logs.push('✓ Number A (Total Product Value) matches expected $12,050.00');
  } else {
    logs.push(`✗ Number A mismatch: expected $12,050.00, got $${summary.numberA}`);
    success = false;
  }

  if (summary.numberB === 1050) {
    logs.push('✓ Number B (Stock Unrealized Gain) matches expected +$1,050.00');
  } else {
    logs.push(`✗ Number B mismatch: expected +$1,050.00, got $${summary.numberB}`);
    success = false;
  }

  if (Math.abs(summary.numberC - 17.5) < 0.01) {
    logs.push('✓ Number C (Stock Return %) matches expected +17.50%');
  } else {
    logs.push(`✗ Number C mismatch: expected +17.50%, got ${summary.numberC}%`);
    success = false;
  }

  if (summary.numberD === 21050) {
    logs.push('✓ Number D (Net Asset Value with Cash) matches expected $21,050.00');
  } else {
    logs.push(`✗ Number D mismatch: expected $21,050.00, got $${summary.numberD}`);
    success = false;
  }

  return {
    success,
    logs,
    sampleData: {
      trades: sampleTrades,
      cash: sampleCash,
      other: sampleOther,
      mergedPositions,
      ibkrPositions,
      summary,
    },
  };
}

