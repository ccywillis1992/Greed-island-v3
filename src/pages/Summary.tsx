import React, { useState, useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { storage, STORAGE_ERROR_EVENT } from '../lib/storage';
import {
  computePositions,
  computeSummaryNumbers,
  computePerformance,
  runCalcSanitySuite,
  computeCashTotal,
} from '../lib/calc';
import {
  syncDailySnapshot,
  runSnapshotSanitySuite,
  getHongKongDateAndCutoff,
} from '../lib/snapshot';
import {
  fetchStockPrice,
  getCustomWorkerUrl,
  setCustomWorkerUrl,
  PriceFetchResult,
} from '../lib/priceApi';
import { exportToExcel } from '../lib/export';
import { BackupModal } from '../components/BackupModal';
import { PWAInstallBanner } from '../components/PWAInstallBanner';
import { Market, MarketFilter, BrokerFilter, DailySnapshot, Position } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import {
  TrendingUp,
  Wallet,
  Layers,
  Clock,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Database,
  ShieldAlert,
  Check,
  Play,
  Terminal,
  Globe,
  Search,
  Loader2,
  Calculator,
  Calendar,
  Filter,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

export const Summary: React.FC = () => {
  // Filter States
  const [selectedMarket, setSelectedMarket] = useState<MarketFilter>('ALL');
  const [selectedBroker, setSelectedBroker] = useState<BrokerFilter>('ALL');

  // Chart Metric Toggle: 'numberA' (Assets Ex Cash) or 'numberD' (NAV with Cash)
  const [chartMetric, setChartMetric] = useState<'numberA' | 'numberD'>('numberA');

  // Collapsible Section States
  const [showBreakdowns, setShowBreakdowns] = useState<boolean>(true);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

  // Snapshot History State
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);

  // System Diagnostic States
  const [schemaVersion, setSchemaVersion] = useState<number>(0);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [sanityResult, setSanityResult] = useState<{ success: boolean; logs: string[] } | null>(null);
  const [calcSanityResult, setCalcSanityResult] = useState<ReturnType<typeof runCalcSanitySuite> | null>(null);
  const [snapshotSanityResult, setSnapshotSanityResult] = useState<ReturnType<typeof runSnapshotSanitySuite> | null>(null);
  const [counts, setCounts] = useState({
    trades: 0,
    cash: 0,
    other: 0,
    snapshots: 0,
  });

  // Price Proxy Tester State
  const [tickerInput, setTickerInput] = useState<string>('MSFT');
  const [marketInput, setMarketInput] = useState<Market>('US');
  const [workerUrlInput, setWorkerUrlInput] = useState<string>('');
  const [isFetchingPrice, setIsFetchingPrice] = useState<boolean>(false);
  const [proxyTestResult, setProxyTestResult] = useState<PriceFetchResult | null>(null);

  // Load storage data
  const trades = useMemo(() => storage.getTrades(), [counts.trades]);
  const priceCache = useMemo(() => storage.getPriceCache(), [counts.trades]);
  const otherProducts = useMemo(() => storage.getOtherProducts(), [counts.other]);
  const cashEntries = useMemo(() => storage.getCashEntries(), [counts.cash]);

  // Compute positions
  const positions = useMemo(
    () => computePositions(trades, priceCache, selectedBroker),
    [trades, priceCache, selectedBroker]
  );

  // Compute live summary numbers for selected filters
  const summary = useMemo(
    () => computeSummaryNumbers(positions, otherProducts, cashEntries, selectedMarket, selectedBroker),
    [positions, otherProducts, cashEntries, selectedMarket, selectedBroker]
  );

  // Calculate overall live numbers across ALL positions for auto-snapshot recording
  const overallPositions = useMemo(
    () => computePositions(trades, priceCache, 'ALL'),
    [trades, priceCache]
  );
  const overallSummary = useMemo(
    () => computeSummaryNumbers(overallPositions, otherProducts, cashEntries, 'ALL', 'ALL'),
    [overallPositions, otherProducts, cashEntries]
  );

  // Module 5 Snapshot-on-open logic: Trigger automatically on mount
  useEffect(() => {
    const syncRes = syncDailySnapshot(overallSummary.numberA, overallSummary.numberD);
    setSnapshots(syncRes.updatedSnapshots);
  }, [overallSummary.numberA, overallSummary.numberD]);

  // Calculate performance metrics (% returns over 1D, YTD, 1M, 3M, 1Y)
  const perfMetrics = useMemo(() => computePerformance(snapshots), [snapshots]);

  // Storage Stats refresh
  const refreshStorageStats = () => {
    storage.runMigrations();
    setSchemaVersion(storage.getSchemaVersion());
    setCounts({
      trades: storage.getTrades().length,
      cash: storage.getCashEntries().length,
      other: storage.getOtherProducts().length,
      snapshots: storage.getSnapshots().length,
    });
  };

  useEffect(() => {
    refreshStorageStats();
    setWorkerUrlInput(getCustomWorkerUrl());

    const handleStorageError = (e: Event) => {
      const customEvent = e as CustomEvent;
      setStorageError(customEvent.detail?.error || 'A storage error occurred');
    };

    window.addEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    return () => {
      window.removeEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    };
  }, []);

  // Breakdown calculations
  const breakdownByMarket = useMemo(() => {
    const map: Record<string, number> = { US: 0, HK: 0, CRYPTO: 0, OTHER: 0 };
    for (const p of positions) {
      if (selectedMarket === 'ALL' || selectedMarket === p.market || (selectedMarket === 'US+HK' && (p.market === 'US' || p.market === 'HK'))) {
        map[p.market] = (map[p.market] || 0) + p.currentValue;
      }
    }
    if (selectedMarket === 'ALL' || selectedMarket === 'OTHER') {
      const latestOther = otherProducts.filter((o) => o.isLatest);
      const otherVal = latestOther.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
      map['OTHER'] = (map['OTHER'] || 0) + otherVal;
    }
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(map).map(([market, val]) => ({
      market,
      val,
      pct: Math.round((val / total) * 1000) / 10,
    })).filter(item => item.val > 0 || selectedMarket === 'ALL');
  }, [positions, otherProducts, selectedMarket]);

  const breakdownByBroker = useMemo(() => {
    const map: Record<string, number> = { FUTU: 0, IBKR: 0, HSBC: 0, Binance: 0 };
    const rawPositions = computePositions(trades, priceCache, 'ALL');
    for (const p of rawPositions) {
      if (selectedBroker === 'ALL' || p.broker === selectedBroker) {
        map[p.broker] = (map[p.broker] || 0) + p.currentValue;
      }
    }
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(map).map(([broker, val]) => ({
      broker,
      val,
      pct: Math.round((val / total) * 1000) / 10,
    })).filter(item => item.val > 0 || selectedBroker === 'ALL');
  }, [trades, priceCache, selectedBroker]);

  const breakdownByAssetClass = useMemo(() => {
    const stockVal = positions.reduce((acc, p) => acc + p.currentValue, 0);
    const latestOther = otherProducts.filter((o) => o.isLatest);
    const otherVal = latestOther.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
    const cashVal = computeCashTotal(cashEntries, selectedBroker);

    const total = stockVal + otherVal + (cashVal > 0 ? cashVal : 0) || 1;
    return [
      { name: 'Stocks & Crypto', val: stockVal, pct: Math.round((stockVal / total) * 1000) / 10, color: 'bg-[#007AFF]' },
      { name: 'Other Products', val: otherVal, pct: Math.round((otherVal / total) * 1000) / 10, color: 'bg-emerald-500' },
      { name: 'Cash', val: cashVal, pct: Math.round((Math.max(0, cashVal) / total) * 1000) / 10, color: 'bg-amber-500' },
    ];
  }, [positions, otherProducts, cashEntries, selectedBroker]);

  // Formatter helpers
  const formatUSD = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderPerfPill = (label: string, val: number | null) => {
    if (val === null) {
      return (
        <div className="flex items-center gap-1 text-[11px] font-mono text-[#86868b] bg-white/5 px-2 py-1 rounded-lg">
          <span className="text-[10px] uppercase">{label}:</span>
          <span>-</span>
        </div>
      );
    }

    const isPositive = val >= 0;
    return (
      <div
        className={`flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-lg font-medium border ${
          isPositive
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        }`}
      >
        <span className="text-[10px] text-[#86868b] uppercase">{label}:</span>
        <span className="flex items-center">
          {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {isPositive ? '+' : ''}
          {val.toFixed(2)}%
        </span>
      </div>
    );
  };

  // Test Runner Handlers
  const handleRunSanitySuite = () => {
    const result = storage.runStorageSanityChecks();
    setSanityResult(result);
    refreshStorageStats();
  };

  const handleRunCalcSuite = () => {
    const result = runCalcSanitySuite();
    setCalcSanityResult(result);
  };

  const handleRunSnapshotSuite = () => {
    const result = runSnapshotSanitySuite();
    setSnapshotSanityResult(result);
    refreshStorageStats();
  };

  const handleSaveWorkerUrl = () => {
    setCustomWorkerUrl(workerUrlInput);
  };

  const handleTestProxyFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;

    setIsFetchingPrice(true);
    setProxyTestResult(null);

    const result = await fetchStockPrice(tickerInput.trim(), marketInput, workerUrlInput);
    setProxyTestResult(result);
    setIsFetchingPrice(false);
  };

  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);

  const handleExportExcel = () => {
    const res = exportToExcel({
      marketFilter: selectedMarket,
      brokerFilter: selectedBroker,
    });

    if (res.success) {
      setExportStatus(`Exported ${res.filename} successfully!`);
      setTimeout(() => setExportStatus(null), 4000);
    } else {
      setExportStatus(`Export failed: ${res.error || 'Unknown error'}`);
      setTimeout(() => setExportStatus(null), 5000);
    }
  };

  const hkInfo = getHongKongDateAndCutoff();

  // Recharts data preparation
  const chartData = useMemo(() => {
    return snapshots.map((s) => ({
      date: s.date,
      value: chartMetric === 'numberA' ? s.totalAssetsExCash : s.totalAssetsWithCash,
      isBackfilled: s.isBackfilled,
      isManuallyEdited: s.isManuallyEdited,
    }));
  }, [snapshots, chartMetric]);

  return (
    <div className="space-y-5 pb-10">
      {/* Top Banner & Header */}
      <header className="flex items-center justify-between pb-2 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#f5f5f7]">Portfolio Summary</h1>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/20">
              <Sparkles className="w-3 h-3" /> Live
            </span>
          </div>
          <p className="text-xs text-[#86868b]">
            HK Bucket: <span className="font-mono text-white">{hkInfo.bucketDateStr}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            id="backup-restore-trigger-btn"
            variant="secondary"
            size="sm"
            onClick={() => setIsBackupModalOpen(true)}
            className="gap-1.5 text-xs bg-[#1c1c1e] hover:bg-[#2c2c2e] text-purple-400 border border-purple-500/20 shadow-md"
            title="JSON Backup & Restore (Module 12)"
          >
            <Database className="w-3.5 h-3.5 text-purple-400" />
            <span>Backup</span>
          </Button>

          <Button
            id="export-excel-btn"
            variant="secondary"
            size="sm"
            onClick={handleExportExcel}
            className="gap-1.5 text-xs bg-[#1c1c1e] hover:bg-[#2c2c2e] text-emerald-400 border border-emerald-500/20 shadow-md"
            title="Download full portfolio backup Excel file (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Excel</span>
          </Button>

          <NavLink to="/stock-form">
            <Button variant="primary" size="sm" className="gap-1 text-xs">
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Trade</span>
            </Button>
          </NavLink>
        </div>
      </header>

      {/* PWA Install Banner */}
      <PWAInstallBanner />

      {/* Export Toast Banner */}
      {exportStatus && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/30 rounded-xl text-emerald-200 text-xs flex items-center justify-between font-mono shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportStatus}</span>
          </div>
          <button onClick={() => setExportStatus(null)} className="text-[#86868b] hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Storage Error Alert Banner */}
      {storageError && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{storageError}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStorageError(null)} className="h-6 text-[10px]">
            Dismiss
          </Button>
        </div>
      )}

      {/* 2 COMBINABLE INDEPENDENT FILTERS */}
      <section id="portfolio-filters-section" className="space-y-2.5 bg-[#1c1c1e] p-3 rounded-2xl border border-white/5">
        <div className="flex items-center gap-1.5 text-xs text-[#86868b] font-medium pb-1 border-b border-white/5">
          <Filter className="w-3.5 h-3.5 text-[#007AFF]" />
          <span>Combinable Filters</span>
          {(selectedMarket !== 'ALL' || selectedBroker !== 'ALL') && (
            <button
              onClick={() => {
                setSelectedMarket('ALL');
                setSelectedBroker('ALL');
              }}
              className="ml-auto text-[10px] text-[#007AFF] hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Market Filter Chips */}
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[#86868b]">Market</span>
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'US', 'HK', 'US+HK', 'CRYPTO', 'OTHER'] as MarketFilter[]).map((m) => (
              <button
                key={m}
                id={`filter-market-${m.toLowerCase().replace('+', '-')}`}
                onClick={() => setSelectedMarket(m)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                  selectedMarket === m
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'bg-[#2c2c2e] text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#3a3a3c]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Broker Filter Chips */}
        <div className="space-y-1 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-[#86868b]">Broker</span>
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'FUTU', 'IBKR', 'HSBC', 'Binance'] as BrokerFilter[]).map((b) => (
              <button
                key={b}
                id={`filter-broker-${b.toLowerCase()}`}
                onClick={() => setSelectedBroker(b)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                  selectedBroker === b
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'bg-[#2c2c2e] text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#3a3a3c]'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* HERO METRICS CARD (NUMBERS A, B, C, D) */}
      <Card id="hero-summary-metrics-card" className="space-y-5 bg-[#0a0a0a] border-white/10 p-5">
        {/* Number A: Total Assets Ex Cash */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#86868b]">
              Number A: Total Assets (Ex Cash)
            </span>
            <span className="text-[10px] font-mono text-[#86868b]">USD</span>
          </div>

          <div className="text-3xl font-extrabold tracking-tight text-white font-mono">
            {formatUSD(summary.numberA)}
          </div>

          {/* Performance Row near Number A */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {renderPerfPill('1D', perfMetrics.dailyPct)}
            {renderPerfPill('YTD', perfMetrics.ytdPct)}
            {renderPerfPill('1M', perfMetrics.m1Pct)}
            {renderPerfPill('3M', perfMetrics.m3Pct)}
            {renderPerfPill('1Y', perfMetrics.y1Pct)}
          </div>
        </div>

        <div className="h-px bg-white/10" />

        {/* Grid for Numbers B, C, D */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Number B: Unrealized Gain/Loss */}
          <div className="bg-[#1c1c1e] p-3 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] font-medium uppercase text-[#86868b] block">
              Number B: Unrealized G/L
            </span>
            <div
              className={`text-lg font-bold font-mono ${
                summary.numberB >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {summary.numberB >= 0 ? '+' : ''}
              {formatUSD(summary.numberB)}
            </div>
            <span className="text-[9px] text-[#86868b] block">Stocks & Crypto</span>
          </div>

          {/* Number C: Stock Return % */}
          <div className="bg-[#1c1c1e] p-3 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] font-medium uppercase text-[#86868b] block">
              Number C: Return %
            </span>
            <div
              className={`text-lg font-bold font-mono ${
                summary.numberC >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {summary.numberC >= 0 ? '+' : ''}
              {summary.numberC.toFixed(2)}%
            </div>
            <span className="text-[9px] text-[#86868b] block">Weighted Cost Basis</span>
          </div>

          {/* Number D: Net Asset Value (NAV with Cash) */}
          <div className="bg-[#1c1c1e] p-3 rounded-xl border border-[#007AFF]/30 space-y-1">
            <span className="text-[10px] font-medium uppercase text-[#007AFF] block">
              Number D: Total NAV (With Cash)
            </span>
            <div className="text-lg font-bold font-mono text-white">
              {formatUSD(summary.numberD)}
            </div>
            <span className="text-[9px] text-[#86868b] block">Assets + Net Cash</span>
          </div>
        </div>
      </Card>

      {/* TREND CHART CARD (RECHARTS) */}
      <Card id="trend-chart-card" className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#007AFF]" />
            <h2 className="text-sm font-semibold text-white">Historical Performance Trend</h2>
          </div>

          {/* Metric Selector Toggle */}
          <div className="flex items-center bg-[#2c2c2e] p-0.5 rounded-lg border border-white/5">
            <button
              onClick={() => setChartMetric('numberA')}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all ${
                chartMetric === 'numberA'
                  ? 'bg-[#007AFF] text-white shadow-sm'
                  : 'text-[#86868b] hover:text-white'
              }`}
            >
              Assets (A)
            </button>
            <button
              onClick={() => setChartMetric('numberD')}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all ${
                chartMetric === 'numberD'
                  ? 'bg-[#007AFF] text-white shadow-sm'
                  : 'text-[#86868b] hover:text-white'
              }`}
            >
              NAV (D)
            </button>
          </div>
        </div>

        {chartData.length < 1 ? (
          <div className="h-44 flex items-center justify-center text-xs text-[#86868b] bg-[#1c1c1e] rounded-xl border border-white/5">
            No snapshot data yet. Visit daily or add entries in History tab.
          </div>
        ) : (
          <div className="h-48 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#007AFF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#007AFF" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                <XAxis dataKey="date" stroke="#86868b" fontSize={10} tickLine={false} />
                <YAxis
                  stroke="#86868b"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#1c1c1e] border border-white/10 p-2.5 rounded-xl shadow-xl text-xs space-y-1 font-mono">
                          <p className="text-[#86868b] font-medium">{label}</p>
                          <p className="text-white font-bold">
                            {chartMetric === 'numberA' ? 'Assets (A): ' : 'NAV (D): '}
                            {formatUSD(Number(payload[0].value))}
                          </p>
                          {data.isBackfilled && (
                            <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded block">
                              * Backfilled Entry
                            </span>
                          )}
                          {data.isManuallyEdited && (
                            <span className="text-[9px] text-cyan-400 bg-cyan-500/10 px-1 py-0.5 rounded block">
                              * Manually Edited
                            </span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#007AFF"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-[#86868b] pt-1">
          <span>Tracked over {snapshots.length} snapshot days</span>
          <NavLink to="/history" className="text-[#007AFF] hover:underline flex items-center gap-0.5">
            <span>Manage History</span>
            <Clock className="w-3 h-3" />
          </NavLink>
        </div>
      </Card>

      {/* BREAKDOWN MINI-CHARTS SECTION */}
      <section id="breakdowns-section" className="space-y-3">
        <button
          onClick={() => setShowBreakdowns(!showBreakdowns)}
          className="w-full flex items-center justify-between p-3 bg-[#1c1c1e] rounded-xl border border-white/5 text-xs text-[#f5f5f7] font-semibold"
        >
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-[#007AFF]" />
            <span>Portfolio Allocation Breakdowns</span>
          </div>
          {showBreakdowns ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showBreakdowns && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* By Market Breakdown */}
            <Card className="space-y-2 p-3 bg-[#121214]">
              <span className="text-xs font-semibold text-white block">By Market</span>
              <div className="space-y-2 pt-1">
                {breakdownByMarket.map((item) => (
                  <div key={item.market} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-[#86868b]">{item.market}</span>
                      <span className="text-white font-medium">
                        {formatUSD(item.val)} ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#2c2c2e] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#007AFF] rounded-full"
                        style={{ width: `${Math.min(100, item.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* By Broker Breakdown */}
            <Card className="space-y-2 p-3 bg-[#121214]">
              <span className="text-xs font-semibold text-white block">By Broker</span>
              <div className="space-y-2 pt-1">
                {breakdownByBroker.map((item) => (
                  <div key={item.broker} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-[#86868b]">{item.broker}</span>
                      <span className="text-white font-medium">
                        {formatUSD(item.val)} ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#2c2c2e] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, item.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* By Asset Class Breakdown */}
            <Card className="space-y-2 p-3 bg-[#121214]">
              <span className="text-xs font-semibold text-white block">By Asset Class</span>
              <div className="space-y-2 pt-1">
                {breakdownByAssetClass.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-[#86868b]">{item.name}</span>
                      <span className="text-white font-medium">
                        {formatUSD(item.val)} ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#2c2c2e] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full`}
                        style={{ width: `${Math.min(100, item.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </section>

      {/* QUICK NAVIGATION ENTRY POINTS */}
      <section id="quick-nav-cards-section" className="grid grid-cols-2 gap-3">
        <NavLink to="/stocks">
          <Card className="p-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] border-white/5 transition-colors space-y-1 group">
            <div className="flex items-center justify-between text-[#007AFF]">
              <TrendingUp className="w-4 h-4" />
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-xs font-semibold text-white block">Stock Holdings</span>
            <span className="text-[10px] text-[#86868b] block">{positions.length} Positions</span>
          </Card>
        </NavLink>

        <NavLink to="/cash">
          <Card className="p-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] border-white/5 transition-colors space-y-1 group">
            <div className="flex items-center justify-between text-amber-500">
              <Wallet className="w-4 h-4" />
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-xs font-semibold text-white block">Cash Balances</span>
            <span className="text-[10px] text-[#86868b] block">
              {formatUSD(computeCashTotal(cashEntries, selectedBroker))}
            </span>
          </Card>
        </NavLink>

        <NavLink to="/other">
          <Card className="p-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] border-white/5 transition-colors space-y-1 group">
            <div className="flex items-center justify-between text-emerald-500">
              <Layers className="w-4 h-4" />
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-xs font-semibold text-white block">Other Products</span>
            <span className="text-[10px] text-[#86868b] block">{otherProducts.length} Records</span>
          </Card>
        </NavLink>

        <NavLink to="/history">
          <Card className="p-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] border-white/5 transition-colors space-y-1 group">
            <div className="flex items-center justify-between text-cyan-400">
              <Clock className="w-4 h-4" />
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-xs font-semibold text-white block">Snapshot History</span>
            <span className="text-[10px] text-[#86868b] block">{snapshots.length} Daily Buckets</span>
          </Card>
        </NavLink>
      </section>

      {/* DIAGNOSTICS & SYSTEM ENGINE VERIFICATION (COLLAPSIBLE) */}
      <section id="system-diagnostics-section" className="pt-2">
        <button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full flex items-center justify-between p-3 bg-[#161618] rounded-xl border border-white/5 text-xs text-[#86868b] hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#007AFF]" />
            <span>System Diagnostics & Pure Function Test Runners</span>
          </div>
          {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDiagnostics && (
          <div className="space-y-4 pt-3">
            {/* Storage Architecture Overview Card */}
            <Card id="storage-architecture-card" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#f5f5f7]">
                  <Database className="w-5 h-5 text-[#007AFF]" />
                  <h2 className="text-base font-semibold">Storage Architecture & Stats</h2>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Schema v{schemaVersion}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-[#1c1c1e] p-2.5 rounded-xl border border-white/5 space-y-0.5">
                  <span className="text-[10px] text-[#86868b] uppercase block">Trades</span>
                  <span className="text-base font-bold text-white">{counts.trades}</span>
                </div>
                <div className="bg-[#1c1c1e] p-2.5 rounded-xl border border-white/5 space-y-0.5">
                  <span className="text-[10px] text-[#86868b] uppercase block">Cash Entries</span>
                  <span className="text-base font-bold text-white">{counts.cash}</span>
                </div>
                <div className="bg-[#1c1c1e] p-2.5 rounded-xl border border-white/5 space-y-0.5">
                  <span className="text-[10px] text-[#86868b] uppercase block">Other Products</span>
                  <span className="text-base font-bold text-white">{counts.other}</span>
                </div>
                <div className="bg-[#1c1c1e] p-2.5 rounded-xl border border-white/5 space-y-0.5">
                  <span className="text-[10px] text-[#86868b] uppercase block">Snapshots</span>
                  <span className="text-base font-bold text-white">{counts.snapshots}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-xs text-[#f5f5f7] font-medium">Sanity Verification</span>
                <Button id="run-sanity-checks-btn" variant="secondary" size="sm" onClick={handleRunSanitySuite} className="gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Storage Suite</span>
                </Button>
              </div>

              {sanityResult && (
                <div className={`p-3 rounded-xl border font-mono text-[11px] space-y-2 ${sanityResult.success ? 'bg-[#0a0a0a] border-emerald-500/30 text-emerald-300' : 'bg-rose-950/20 border-rose-500/30 text-rose-300'}`}>
                  <div className="flex items-center gap-1.5 font-semibold text-xs pb-1 border-b border-white/10">
                    {sanityResult.success ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>All Storage Integrity Sanity Checks Passed</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        <span>Sanity Checks Failed</span>
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    {sanityResult.logs.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Price Proxy Inspector Card */}
            <Card id="price-proxy-card" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#f5f5f7]">
                  <Globe className="w-5 h-5 text-[#007AFF]" />
                  <h2 className="text-base font-semibold">Real-Time Price Fetch Proxy</h2>
                </div>
                <span className="text-[10px] font-mono text-[#86868b]">Yahoo Finance</span>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-medium uppercase text-[#86868b] block">Worker Proxy URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={workerUrlInput}
                    onChange={(e) => setWorkerUrlInput(e.target.value)}
                    placeholder="https://my-worker.workers.dev"
                    className="flex-1 bg-[#1c1c1e] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#007AFF]"
                  />
                  <Button variant="secondary" size="sm" onClick={handleSaveWorkerUrl}>Save URL</Button>
                </div>
              </div>

              <form onSubmit={handleTestProxyFetch} className="space-y-3 pt-2 border-t border-white/5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium uppercase text-[#86868b] block mb-1">Ticker</label>
                    <input
                      type="text"
                      value={tickerInput}
                      onChange={(e) => setTickerInput(e.target.value)}
                      placeholder="e.g. MSFT or 1810"
                      className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#007AFF]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-medium uppercase text-[#86868b] block mb-1">Market</label>
                    <select
                      value={marketInput}
                      onChange={(e) => setMarketInput(e.target.value as Market)}
                      className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#007AFF]"
                    >
                      <option value="US">US</option>
                      <option value="HK">HK</option>
                      <option value="CRYPTO">CRYPTO</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" variant="primary" size="sm" disabled={isFetchingPrice} className="gap-1.5">
                    {isFetchingPrice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Test Fetch Price</span>
                  </Button>
                </div>
              </form>

              {proxyTestResult && (
                <div className={`p-3 rounded-xl border font-mono text-[11px] space-y-1 ${proxyTestResult.status === 'success' ? 'bg-[#0a0a0a] border-emerald-500/30 text-emerald-300' : 'bg-rose-950/20 border-rose-500/30 text-rose-300'}`}>
                  <div className="flex items-center justify-between font-semibold pb-1 border-b border-white/10">
                    <span>Result: {proxyTestResult.status.toUpperCase()}</span>
                    <span>Source: {proxyTestResult.source}</span>
                  </div>
                  <p>Resolved Key: {proxyTestResult.tickerKey}</p>
                  {proxyTestResult.price !== undefined && <p className="text-white font-bold">Fetched Price: ${proxyTestResult.price.toFixed(2)} USD</p>}
                  {proxyTestResult.error && <p className="text-rose-400">Error: {proxyTestResult.error}</p>}
                </div>
              )}
            </Card>

            {/* Module 4 Calculation Engine Inspector Card */}
            <Card id="calc-engine-card" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#f5f5f7]">
                  <Calculator className="w-5 h-5 text-[#007AFF]" />
                  <h2 className="text-base font-semibold">Module 4: Calculation Engine</h2>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/5 text-[#86868b]">src/lib/calc.ts</span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-xs text-[#f5f5f7] font-medium">Verify Portfolio Math Suite</span>
                <Button id="run-calc-suite-btn" variant="primary" size="sm" onClick={handleRunCalcSuite} className="gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Math Suite</span>
                </Button>
              </div>

              {calcSanityResult && (
                <div className={`p-3 rounded-xl border font-mono text-[11px] space-y-2 ${calcSanityResult.success ? 'bg-[#0a0a0a] border-emerald-500/30 text-emerald-300' : 'bg-rose-950/20 border-rose-500/30 text-rose-300'}`}>
                  <div className="flex items-center gap-1.5 font-semibold text-xs pb-1 border-b border-white/10">
                    {calcSanityResult.success ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>All Pure Functions & Math Assertions Passed</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        <span>Calculation Engine Tests Failed</span>
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    {calcSanityResult.logs.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Module 5 Daily Snapshot Engine Inspector Card */}
            <Card id="snapshot-engine-card" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#f5f5f7]">
                  <Calendar className="w-5 h-5 text-[#007AFF]" />
                  <h2 className="text-base font-semibold">Module 5: Snapshot & Cutoff Engine</h2>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/5 text-[#86868b]">src/lib/snapshot.ts</span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-xs text-[#f5f5f7] font-medium">Verify Snapshot Rules</span>
                <Button id="run-snapshot-suite-btn" variant="primary" size="sm" onClick={handleRunSnapshotSuite} className="gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Rule Suite</span>
                </Button>
              </div>

              {snapshotSanityResult && (
                <div className={`p-3 rounded-xl border font-mono text-[11px] space-y-2 ${snapshotSanityResult.success ? 'bg-[#0a0a0a] border-emerald-500/30 text-emerald-300' : 'bg-rose-950/20 border-rose-500/30 text-rose-300'}`}>
                  <div className="flex items-center gap-1.5 font-semibold text-xs pb-1 border-b border-white/10">
                    {snapshotSanityResult.success ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>All Snapshot Cutoff, Upsert, Backfill, & Manual Rules Passed</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        <span>Snapshot Engine Rule Suite Failed</span>
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    {snapshotSanityResult.logs.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </section>

      {/* Module 12: Backup & Restore Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onRestoreSuccess={refreshStorageStats}
      />
    </div>
  );
};
