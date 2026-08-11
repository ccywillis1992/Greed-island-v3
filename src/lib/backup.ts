import {
  Trade,
  CashEntry,
  OtherProductRecord,
  DailySnapshot,
  PriceCacheEntry,
  AppSettings,
} from '../types';
import { storage, STORAGE_KEYS, setItem, CURRENT_SCHEMA_VERSION, STORAGE_ERROR_EVENT } from './storage';
import { CHARGE_SCHEDULE } from './calc';
import { getUsdHkdRate } from './priceApi';

export interface BackupData {
  appName: string; // 'Greed Island Portfolio'
  schemaVersion: number;
  exportDate: string; // ISO timestamp
  trades: Trade[];
  cashEntries: CashEntry[];
  otherProducts: OtherProductRecord[];
  snapshots: DailySnapshot[];
  priceCache?: Record<string, PriceCacheEntry>;
  settings?: AppSettings;
}

export interface BackupValidationSummary {
  tradeCount: number;
  cashCount: number;
  otherCount: number;
  snapshotCount: number;
  exportDate?: string;
  schemaVersion?: number;
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  data?: BackupData;
  summary?: BackupValidationSummary;
}

export interface CurrentStorageSummary {
  tradeCount: number;
  cashCount: number;
  otherCount: number;
  snapshotCount: number;
}

/**
 * Creates a structured JSON backup object containing all current storage collections.
 */
export function createBackupData(includePriceCache = true): BackupData {
  const trades = storage.getTrades();
  const cashEntries = storage.getCashEntries();
  const otherProducts = storage.getOtherProducts();
  const snapshots = storage.getSnapshots();
  const priceCache = includePriceCache ? storage.getPriceCache() : {};
  const settings = storage.getSettings();
  const schemaVersion = storage.getSchemaVersion();

  return {
    appName: 'Greed Island Portfolio',
    schemaVersion: schemaVersion || CURRENT_SCHEMA_VERSION,
    exportDate: new Date().toISOString(),
    trades,
    cashEntries,
    otherProducts,
    snapshots,
    priceCache,
    settings,
  };
}

/**
 * Exports current application storage to a downloadable JSON file.
 */
export function exportBackupJSON(customFilename?: string): {
  success: boolean;
  filename: string;
  error?: string;
} {
  try {
    const backupData = createBackupData(true);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = customFilename || `greedisland-backup-${dateStr}.json`;

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, filename };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Backup Engine] Export failed:', errorMsg);
    return { success: false, filename: '', error: errorMsg };
  }
}

/**
 * Reads current storage collection counts for comparison before import.
 */
export function getCurrentStorageSummary(): CurrentStorageSummary {
  return {
    tradeCount: storage.getTrades().length,
    cashCount: storage.getCashEntries().length,
    otherCount: storage.getOtherProducts().length,
    snapshotCount: storage.getSnapshots().length,
  };
}

/**
 * Strictly parses and validates an uploaded backup JSON string.
 * Ensures schema version and object structure match expectations.
 */
export function parseAndValidateBackup(jsonString: string): BackupValidationResult {
  try {
    if (!jsonString || !jsonString.trim()) {
      return { valid: false, error: 'Uploaded file is empty.' };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseErr) {
      return { valid: false, error: 'File is not valid JSON. Syntax error parsing file.' };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { valid: false, error: 'Backup root must be a JSON object.' };
    }

    // Check schemaVersion
    const version = parsed.schemaVersion;
    if (typeof version !== 'number' || isNaN(version) || version < 1) {
      return {
        valid: false,
        error: 'Invalid or missing "schemaVersion". Must be a number >= 1.',
      };
    }

    // Support both 'cashEntries' and 'cash' key for backward compatibility
    const cashList = parsed.cashEntries || parsed.cash;

    // Check required collections exist and are arrays
    if (!Array.isArray(parsed.trades)) {
      return { valid: false, error: 'Invalid backup structure: "trades" must be an array.' };
    }
    if (!Array.isArray(cashList)) {
      return { valid: false, error: 'Invalid backup structure: "cashEntries" must be an array.' };
    }
    if (!Array.isArray(parsed.otherProducts)) {
      return { valid: false, error: 'Invalid backup structure: "otherProducts" must be an array.' };
    }
    if (!Array.isArray(parsed.snapshots)) {
      return { valid: false, error: 'Invalid backup structure: "snapshots" must be an array.' };
    }

    // Inspect individual elements inside trades array
    for (let i = 0; i < parsed.trades.length; i++) {
      const t = parsed.trades[i];
      if (
        !t ||
        typeof t !== 'object' ||
        typeof t.id !== 'string' ||
        typeof t.ticker !== 'string' ||
        typeof t.quantity !== 'number' ||
        typeof t.price !== 'number'
      ) {
        return {
          valid: false,
          error: `Malformed trade object at index ${i}. Required fields: id, ticker, quantity, price.`,
        };
      }
    }

    // Inspect individual elements inside cash array
    for (let i = 0; i < cashList.length; i++) {
      const c = cashList[i];
      if (
        !c ||
        typeof c !== 'object' ||
        typeof c.id !== 'string' ||
        typeof c.date !== 'string' ||
        typeof c.amount !== 'number'
      ) {
        return {
          valid: false,
          error: `Malformed cash entry object at index ${i}. Required fields: id, date, amount.`,
        };
      }
    }

    // Inspect individual elements inside otherProducts array
    for (let i = 0; i < parsed.otherProducts.length; i++) {
      const o = parsed.otherProducts[i];
      if (
        !o ||
        typeof o !== 'object' ||
        typeof o.id !== 'string' ||
        typeof o.asOfDate !== 'string' ||
        typeof o.totalAmount !== 'number'
      ) {
        return {
          valid: false,
          error: `Malformed other product record at index ${i}. Required fields: id, asOfDate, totalAmount.`,
        };
      }
    }

    // Inspect individual elements inside snapshots array
    for (let i = 0; i < parsed.snapshots.length; i++) {
      const s = parsed.snapshots[i];
      if (
        !s ||
        typeof s !== 'object' ||
        typeof s.date !== 'string' ||
        typeof s.totalAssetsExCash !== 'number' ||
        typeof s.totalAssetsWithCash !== 'number'
      ) {
        return {
          valid: false,
          error: `Malformed snapshot object at index ${i}. Required fields: date, totalAssetsExCash, totalAssetsWithCash.`,
        };
      }
    }

    // Normalized backup object
    const normalizedData: BackupData = {
      appName: parsed.appName || 'Greed Island Portfolio',
      schemaVersion: version,
      exportDate: parsed.exportDate || new Date().toISOString(),
      trades: parsed.trades,
      cashEntries: cashList,
      otherProducts: parsed.otherProducts,
      snapshots: parsed.snapshots,
      priceCache: typeof parsed.priceCache === 'object' && parsed.priceCache !== null ? parsed.priceCache : {},
      settings: typeof parsed.settings === 'object' && parsed.settings !== null ? parsed.settings : undefined,
    };

    return {
      valid: true,
      data: normalizedData,
      summary: {
        tradeCount: normalizedData.trades.length,
        cashCount: normalizedData.cashEntries.length,
        otherCount: normalizedData.otherProducts.length,
        snapshotCount: normalizedData.snapshots.length,
        exportDate: normalizedData.exportDate,
        schemaVersion: normalizedData.schemaVersion,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Validation exception: ${errorMsg}` };
  }
}

/**
  * Shared function used exclusively during JSON import to backfill missing trade charges.
  */
export function backfillTradeCharge(trade: Trade, currentFxRate: number): Trade {
  if (
    trade.serviceCharge !== undefined &&
    trade.serviceCharge !== null &&
    trade.netAmount !== undefined &&
    trade.netAmount !== null
  ) {
    return trade;
  }

  const rule = CHARGE_SCHEDULE[trade.broker]?.[trade.market] || { type: 'none' };
  let serviceCharge = 0;
  let chargeIsApproximate = false;

  if (rule.type === 'flat') {
    serviceCharge = rule.amountUsd;
  } else if (rule.type === 'flatPlusPercentOfNotional') {
    if (trade.originalPrice && trade.fxRateAtEntry) {
      const notionalHKD = trade.originalPrice * trade.quantity;
      const chargeHKD = rule.flatAmount + (rule.percent / 100) * notionalHKD;
      serviceCharge = Math.round((chargeHKD / trade.fxRateAtEntry) * 100) / 100;
    } else {
      // Older export missing originalPrice and fxRateAtEntry -> approximate using current FX rate
      const notionalHKD = trade.totalAmount * currentFxRate;
      const chargeHKD = rule.flatAmount + (rule.percent / 100) * notionalHKD;
      serviceCharge = Math.round((chargeHKD / currentFxRate) * 100) / 100;
      chargeIsApproximate = true;
    }
  } else {
    serviceCharge = 0;
  }

  const netAmount =
    trade.action === 'BUY'
      ? Math.round((trade.totalAmount + serviceCharge) * 100) / 100
      : Math.round((trade.totalAmount - serviceCharge) * 100) / 100;

  return {
    ...trade,
    serviceCharge,
    netAmount,
    chargeIsApproximate: trade.chargeIsApproximate ?? chargeIsApproximate,
  };
}

/**
 * Performs a FULL-REPLACE import overwriting all localStorage collections with backup data.
 */
export async function importBackupData(backupData: BackupData): Promise<{ success: boolean; error?: string }> {
  try {
    if (!backupData) {
      return { success: false, error: 'No backup data provided.' };
    }

    const currentFxRate = await getUsdHkdRate().catch(() => 7.81);

    // Backfill trade charges during import
    const backfilledTrades = backupData.trades.map((trade) => backfillTradeCharge(trade, currentFxRate));

    // Update cash entries that were linked to trades
    const updatedCashEntries = backupData.cashEntries.map((cash) => {
      if (cash.linkedTradeId) {
        const linkedTrade = backfilledTrades.find((t) => t.id === cash.linkedTradeId);
        if (linkedTrade && linkedTrade.netAmount !== undefined) {
          return {
            ...cash,
            amount: linkedTrade.netAmount,
          };
        }
      }
      return cash;
    });

    // 1. Write trades
    const resTrades = setItem(STORAGE_KEYS.TRADES, backfilledTrades);
    if (!resTrades.success) throw new Error(`Failed to restore trades: ${resTrades.error}`);

    // 2. Write cash entries
    const resCash = setItem(STORAGE_KEYS.CASH, updatedCashEntries);
    if (!resCash.success) throw new Error(`Failed to restore cash entries: ${resCash.error}`);

    // 3. Write other products
    const resOther = setItem(STORAGE_KEYS.OTHER_PRODUCTS, backupData.otherProducts);
    if (!resOther.success) throw new Error(`Failed to restore other products: ${resOther.error}`);

    // 4. Write snapshots
    const resSnapshots = setItem(STORAGE_KEYS.SNAPSHOTS, backupData.snapshots);
    if (!resSnapshots.success) throw new Error(`Failed to restore snapshots: ${resSnapshots.error}`);

    // 5. Write price cache if present
    if (backupData.priceCache) {
      setItem(STORAGE_KEYS.PRICE_CACHE, backupData.priceCache);
    }

    // 6. Write settings if present
    if (backupData.settings) {
      setItem(STORAGE_KEYS.SETTINGS, backupData.settings);
    }

    // 7. Write schema version
    setItem(STORAGE_KEYS.SCHEMA_VERSION, backupData.schemaVersion || CURRENT_SCHEMA_VERSION);

    // Dispatch notification to inform UI to update
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(STORAGE_ERROR_EVENT, {
          detail: { key: 'backup_restored', timestamp: new Date().toISOString() },
        })
      );
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Backup Engine] Full-replace import failed:', errorMsg);
    return { success: false, error: errorMsg };
  }
}
