import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { storage } from '../lib/storage';
import { runCalcSanitySuite } from '../lib/calc';
import { runSnapshotSanitySuite } from '../lib/snapshot';
import { fetchStockPrice, getCustomWorkerUrl, setCustomWorkerUrl, PriceFetchResult } from '../lib/priceApi';
import { Market } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import {
  Terminal,
  Database,
  ShieldAlert,
  Check,
  Play,
  Globe,
  Search,
  Loader2,
  Calculator,
  Calendar,
  ArrowLeft,
} from 'lucide-react';

export const Debug: React.FC = () => {
  const [schemaVersion, setSchemaVersion] = useState<number>(0);
  const [sanityResult, setSanityResult] = useState<{ success: boolean; logs: string[] } | null>(null);
  const [calcSanityResult, setCalcSanityResult] = useState<ReturnType<typeof runCalcSanitySuite> | null>(null);
  const [snapshotSanityResult, setSnapshotSanityResult] = useState<ReturnType<typeof runSnapshotSanitySuite> | null>(null);
  const [counts, setCounts] = useState({
    trades: 0,
    cash: 0,
    other: 0,
    snapshots: 0,
  });

  const [tickerInput, setTickerInput] = useState<string>('MSFT');
  const [marketInput, setMarketInput] = useState<Market>('US');
  const [workerUrlInput, setWorkerUrlInput] = useState<string>('');
  const [isFetchingPrice, setIsFetchingPrice] = useState<boolean>(false);
  const [proxyTestResult, setProxyTestResult] = useState<PriceFetchResult | null>(null);

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
  }, []);

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

  return (
    <div className="space-y-5 pb-10">
      <header className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <NavLink to="/" className="p-1.5 rounded-lg bg-[#1c1c1e] text-[#86868b] hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </NavLink>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-[#007AFF]" />
            <h1 className="text-lg font-bold text-[#f5f5f7]">System Diagnostics</h1>
          </div>
        </div>
      </header>

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
          <div className={`p-3 rounded-xl border font-mono text-[11px] space-y-1 ${proxyTestResult.status === 200 || proxyTestResult.success ? 'bg-[#0a0a0a] border-emerald-500/30 text-emerald-300' : 'bg-rose-950/20 border-rose-500/30 text-rose-300'}`}>
            <div className="flex items-center justify-between font-semibold pb-1 border-b border-white/10">
              <span>Status: {proxyTestResult.status}</span>
              <span>Success: {String(proxyTestResult.success)}</span>
            </div>
            <p>Resolved Key: {proxyTestResult.symbol}</p>
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
            <h2 className="text-base font-semibold">Module 5: Snapshot Engine</h2>
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
                  <span>All Snapshot Rules Passed</span>
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
  );
};
