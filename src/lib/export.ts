import * as XLSX from 'xlsx';
import { storage } from './storage';
import {
  computePositions,
  computeSummaryNumbers,
  computePerformance,
} from './calc';
import { MarketFilter, BrokerFilter } from '../types';

export interface ExportOptions {
  marketFilter?: MarketFilter;
  brokerFilter?: BrokerFilter;
  filename?: string;
}

/**
 * MODULE 11: Excel Export Engine
 * Generates a multi-sheet .xlsx workbook containing full portfolio summary,
 * position breakdown, trade logs, cash logs, other products, and snapshot history.
 */
export function exportToExcel(options: ExportOptions = {}): { success: boolean; filename: string; error?: string } {
  try {
    const marketFilter = options.marketFilter || 'ALL';
    const brokerFilter = options.brokerFilter || 'ALL';

    // 1. Fetch raw datasets from storage
    const trades = storage.getTrades();
    const cashEntries = storage.getCashEntries();
    const otherProducts = storage.getOtherProducts();
    const snapshots = storage.getSnapshots();
    const priceCache = storage.getPriceCache();

    // 2. Compute live position and performance metrics
    const positions = computePositions(trades, priceCache, brokerFilter);
    const summary = computeSummaryNumbers(
      positions,
      otherProducts,
      cashEntries,
      marketFilter,
      brokerFilter
    );
    const performance = computePerformance(snapshots);

    // Create a new Excel workbook
    const wb = XLSX.utils.book_new();

    // ==========================================
    // SHEET 1: "Summary"
    // ==========================================
    const nowStr = new Date().toISOString();
    const summaryRows = [
      ['Metric / Parameter', 'Value', 'Notes / Description'],
      ['Export Timestamp', nowStr, 'Date and time when export was generated'],
      ['Active Market Filter', marketFilter, 'Filter applied at export time'],
      ['Active Broker Filter', brokerFilter, 'Filter applied at export time'],
      ['Number A (Total Assets Ex Cash)', summary.numberA, 'Stock/Crypto positions + Other Products (USD)'],
      ['Number B (Unrealized Gain / Loss)', summary.numberB, 'Stock/Crypto unrealized gain/loss (USD)'],
      ['Number C (Return %)', `${summary.numberC.toFixed(2)}%`, 'Stock/Crypto percentage return'],
      ['Number D (Net Asset Value - NAV)', summary.numberD, 'Number A + Total Cash Balance (USD)'],
      ['Daily Return (1D %)', performance.dailyPct !== null ? `${performance.dailyPct.toFixed(2)}%` : 'N/A', '1-day return from snapshot history'],
      ['YTD Return (%)', performance.ytdPct !== null ? `${performance.ytdPct.toFixed(2)}%` : 'N/A', 'Year-to-date return'],
      ['1 Month Return (%)', performance.m1Pct !== null ? `${performance.m1Pct.toFixed(2)}%` : 'N/A', '30-day return'],
      ['3 Month Return (%)', performance.m3Pct !== null ? `${performance.m3Pct.toFixed(2)}%` : 'N/A', '90-day return'],
      ['1 Year Return (%)', performance.y1Pct !== null ? `${performance.y1Pct.toFixed(2)}%` : 'N/A', '365-day return'],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    formatWorksheet(wsSummary, ['Metric / Parameter', 'Value', 'Notes / Description'], {
      4: '$#,##0.00',
      5: '$#,##0.00',
      7: '$#,##0.00',
    });
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // ==========================================
    // SHEET 2: "Portfolio"
    // ==========================================
    // Filter positions according to marketFilter if requested
    const filteredPositions = positions.filter((p) => {
      if (marketFilter === 'ALL') return true;
      if (marketFilter === 'US+HK') return p.market === 'US' || p.market === 'HK';
      return p.market === marketFilter;
    });

    const portfolioHeaders = [
      'Ticker',
      'Market',
      'Broker',
      'Quantity',
      'Total Cost (USD)',
      'Avg Cost (USD)',
      'Current Price (USD)',
      'Current Value (USD)',
      'Return %',
    ];

    const portfolioRows = filteredPositions.map((p) => [
      p.ticker,
      p.market,
      p.broker,
      Number(p.quantity.toFixed(3)),
      Number(p.totalCost.toFixed(2)),
      Number(p.avgCost.toFixed(2)),
      Number(p.currentPrice.toFixed(2)),
      Number(p.currentValue.toFixed(2)),
      `${p.returnPct.toFixed(2)}%`,
    ]);

    const wsPortfolio = XLSX.utils.aoa_to_sheet([portfolioHeaders, ...portfolioRows]);
    formatWorksheet(wsPortfolio, portfolioHeaders, {
      3: '#,##0.000',
      4: '$#,##0.00',
      5: '$#,##0.00',
      6: '$#,##0.00',
      7: '$#,##0.00',
    });
    XLSX.utils.book_append_sheet(wb, wsPortfolio, 'Portfolio');

    // ==========================================
    // SHEET 3: "Trade Log"
    // ==========================================
    const tradeHeaders = [
      'Trade ID',
      'Date',
      'Ticker',
      'Market',
      'Action',
      'Broker',
      'Quantity',
      'Price (USD)',
      'Total Amount (USD)',
    ];

    // Sorted by date descending
    const sortedTrades = [...trades].sort((a, b) => b.date.localeCompare(a.date));

    const tradeRows = sortedTrades.map((t) => [
      t.id,
      t.date,
      t.ticker,
      t.market,
      t.action,
      t.broker,
      Number(Number(t.quantity).toFixed(3)),
      Number(Number(t.price).toFixed(2)),
      Number((t.totalAmount ? Number(t.totalAmount) : Number(t.quantity) * Number(t.price)).toFixed(2)),
    ]);

    const wsTrades = XLSX.utils.aoa_to_sheet([tradeHeaders, ...tradeRows]);
    formatWorksheet(wsTrades, tradeHeaders, {
      6: '#,##0.000',
      7: '$#,##0.00',
      8: '$#,##0.00',
    });
    XLSX.utils.book_append_sheet(wb, wsTrades, 'Trade Log');

    // ==========================================
    // SHEET 4: "Cash Log"
    // ==========================================
    const cashHeaders = ['Cash Entry ID', 'Date', 'Broker', 'Action', 'Amount (USD)'];

    // Sorted by date descending
    const sortedCash = [...cashEntries].sort((a, b) => b.date.localeCompare(a.date));

    const cashRows = sortedCash.map((c) => [
      c.id,
      c.date,
      c.broker,
      c.action,
      Number(Number(c.amount).toFixed(2)),
    ]);

    const wsCash = XLSX.utils.aoa_to_sheet([cashHeaders, ...cashRows]);
    formatWorksheet(wsCash, cashHeaders, {
      4: '$#,##0.00',
    });
    XLSX.utils.book_append_sheet(wb, wsCash, 'Cash Log');

    // ==========================================
    // SHEET 5: "Other Products"
    // ==========================================
    const otherHeaders = [
      'Record ID',
      'As Of Date',
      'Total Amount (USD)',
      'Unrealized Gain / Loss (USD)',
      'Performance %',
      'Is Latest',
    ];

    // Sorted by date descending
    const sortedOther = [...otherProducts].sort((a, b) => b.asOfDate.localeCompare(a.asOfDate));

    const otherRows = sortedOther.map((o) => [
      o.id,
      o.asOfDate,
      Number(Number(o.totalAmount).toFixed(2)),
      Number(Number(o.unrealizedGainLoss).toFixed(2)),
      `${o.performancePct.toFixed(2)}%`,
      o.isLatest ? 'TRUE' : 'FALSE',
    ]);

    const wsOther = XLSX.utils.aoa_to_sheet([otherHeaders, ...otherRows]);
    formatWorksheet(wsOther, otherHeaders, {
      2: '$#,##0.00',
      3: '$#,##0.00',
    });
    XLSX.utils.book_append_sheet(wb, wsOther, 'Other Products');

    // ==========================================
    // SHEET 6: "Snapshots"
    // ==========================================
    const snapshotHeaders = [
      'Snapshot Date',
      'Assets Ex Cash (Number A) [USD]',
      'Net Asset Value (Number D) [USD]',
      'Is Backfilled',
      'Is Manually Edited',
    ];

    // Sorted by date descending
    const sortedSnapshots = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));

    const snapshotRows = sortedSnapshots.map((s) => [
      s.date,
      Number(Number(s.totalAssetsExCash).toFixed(2)),
      Number(Number(s.totalAssetsWithCash).toFixed(2)),
      s.isBackfilled ? 'TRUE' : 'FALSE',
      s.isManuallyEdited ? 'TRUE' : 'FALSE',
    ]);

    const wsSnapshots = XLSX.utils.aoa_to_sheet([snapshotHeaders, ...snapshotRows]);
    formatWorksheet(wsSnapshots, snapshotHeaders, {
      1: '$#,##0.00',
      2: '$#,##0.00',
    });
    XLSX.utils.book_append_sheet(wb, wsSnapshots, 'Snapshots');

    // Generate output filename with date stamp
    const dateStamp = new Date().toISOString().slice(0, 10);
    const exportFileName = options.filename || `Greed_Island_Portfolio_Export_${dateStamp}.xlsx`;

    // Write file & trigger browser download
    XLSX.writeFile(wb, exportFileName);

    return {
      success: true,
      filename: exportFileName,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Greed Island Export] Export to Excel failed:', errorMsg);
    return {
      success: false,
      filename: '',
      error: errorMsg,
    };
  }
}

/**
 * Applies sheet formatting: freezes top header row, formats numeric columns, and adjusts column widths.
 */
function formatWorksheet(
  ws: XLSX.WorkSheet,
  headers: string[],
  colFormats?: Record<number, string>
) {
  // Freeze top header row
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  // Calculate cell ranges
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const cols: XLSX.ColInfo[] = [];

  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = headers[C] ? headers[C].length : 12;

    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
      const cell = ws[cellRef];

      if (cell) {
        // Apply column formatting for data rows (R > 0)
        if (R > 0 && colFormats && colFormats[C] && typeof cell.v === 'number') {
          cell.z = colFormats[C];
        }

        if (cell.v !== undefined && cell.v !== null) {
          const valStr = String(cell.v);
          if (valStr.length > maxLen) {
            maxLen = Math.min(valStr.length, 45);
          }
        }
      }
    }

    cols.push({ wch: Math.max(maxLen + 3, 12) });
  }

  ws['!cols'] = cols;
}
