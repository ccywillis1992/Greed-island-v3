import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { storage, STORAGE_ERROR_EVENT } from '../lib/storage';
import { computePositions } from '../lib/calc';
import { refreshPrice, batchFetchPrices } from '../lib/priceApi';
import {
  BrokerFilter,
  MarketFilter,
  Position,
  Trade,
  PriceCacheEntry,
  Broker,
  Market,
} from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import {
  TrendingUp,
  PlusCircle,
  RefreshCw,
  Filter,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Zap,
  ZapOff,
  Trash2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const StockDetail: React.FC = () => {
  const { ticker: urlTicker } = useParams<{ ticker?: string }>();
  const navigate = useNavigate();

  // Filter States
  const [selectedBroker, setSelectedBroker] = useState<BrokerFilter>('ALL');
  const [selectedMarket, setSelectedMarket] = useState<MarketFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>(urlTicker || '');

  // UI States
  const [refreshingTickers, setRefreshingTickers] = useState<Record<string, boolean>>({});
  const [isRefreshingAll, setIsRefreshingAll] = useState<boolean>(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(urlTicker ? urlTicker.toUpperCase() : null);
  const [storageVersion, setStorageVersion] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Sync storage events
  useEffect(() => {
    const handleStorageError = () => {
      setStorageVersion((v) => v + 1);
    };
    window.addEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    return () => {
      window.removeEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    };
  }, []);

  // Show Toast notification helper
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Load storage data
  const trades = useMemo(() => {
    // Read trades triggering re-evaluation on storageVersion change
    return storage.getTrades();
  }, [storageVersion]);

  const priceCache = useMemo(() => {
    return storage.getPriceCache();
  }, [storageVersion]);

  // Compute positions using Module 4 calc engine
  const positions = useMemo(() => {
    return computePositions(trades, priceCache, selectedBroker);
  }, [trades, priceCache, selectedBroker]);

  // Filter positions by search query and market filter
  const filteredPositions = useMemo(() => {
    return positions.filter((pos) => {
      const matchSearch =
        !searchQuery.trim() ||
        pos.ticker.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchMarket =
        selectedMarket === 'ALL' ||
        pos.market === selectedMarket ||
        (selectedMarket === 'US+HK' && (pos.market === 'US' || pos.market === 'HK'));
      return matchSearch && matchMarket;
    });
  }, [positions, searchQuery, selectedMarket]);

  // Totals calculation
  const totals = useMemo(() => {
    const totalValue = filteredPositions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalCost = filteredPositions.reduce((sum, p) => sum + p.totalCost, 0);
    const gainLoss = totalValue - totalCost;
    const returnPct = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;
    return { totalValue, totalCost, gainLoss, returnPct };
  }, [filteredPositions]);

  // Individual Price Refresh Handler (Module 3 Manual Retry requirement)
  const handleRefreshSinglePrice = async (ticker: string, market: Market) => {
    const cacheKey = `${market}:${ticker}`;
    setRefreshingTickers((prev) => ({ ...prev, [cacheKey]: true }));

    try {
      const result = await refreshPrice(ticker, market);
      setStorageVersion((v) => v + 1);

      if (result.success) {
        showToast(`Refreshed ${ticker}: $${result.price?.toFixed(2)} USD`, 'success');
      } else {
        showToast(
          `Fetch failed for ${ticker}. Using fallback cached price ($${result.price?.toFixed(2) || 'N/A'}).`,
          'error'
        );
      }
    } catch (err) {
      showToast(`Error refreshing ${ticker}`, 'error');
    } finally {
      setRefreshingTickers((prev) => ({ ...prev, [cacheKey]: false }));
    }
  };

  // Refresh All Prices Handler
  const handleRefreshAllPrices = async () => {
    if (positions.length === 0) return;
    setIsRefreshingAll(true);

    try {
      const itemsToFetch = Array.from(
        new Set<string>(positions.map((p) => `${p.market}:${p.ticker}`))
      ).map((key) => {
        const [market, ticker] = key.split(':') as [Market, string];
        return { ticker, market };
      });

      const results = await batchFetchPrices(itemsToFetch, 3, 200);
      setStorageVersion((v) => v + 1);

      const successCount = results.filter((r) => r.success).length;
      showToast(`Refreshed ${successCount}/${results.length} prices successfully`, 'success');
    } catch (err) {
      showToast('Error during batch price refresh', 'error');
    } finally {
      setIsRefreshingAll(false);
    }
  };

  // Toggle Price Cache Status simulator (Allows testing acceptance criterion: "Manually killing a price fetch shows red light + fallback")
  const handleSimulateStatusFail = (ticker: string, market: Market) => {
    const cacheKey = `${market}:${ticker}`;
    const currentEntry = priceCache[cacheKey] || priceCache[ticker];

    if (!currentEntry) {
      // Create a mock fallback price entry with status fail
      const mockEntry: PriceCacheEntry = {
        ticker,
        market,
        price: 150.0,
        lastFetchedAt: new Date().toISOString(),
        lastFetchStatus: 'fail',
      };
      storage.setPriceCacheEntry(cacheKey, mockEntry);
      showToast(`Simulated FAIL status for ${ticker} (Fallback price: $150.00)`, 'error');
    } else {
      const updatedStatus = currentEntry.lastFetchStatus === 'fail' ? 'success' : 'fail';
      storage.setPriceCacheEntry(cacheKey, {
        ...currentEntry,
        lastFetchStatus: updatedStatus,
      });
      showToast(
        `Set ${ticker} price status to ${updatedStatus.toUpperCase()} (Price: $${currentEntry.price.toFixed(2)})`,
        updatedStatus === 'fail' ? 'error' : 'success'
      );
    }
    setStorageVersion((v) => v + 1);
  };

  // Seed Sample Multi-Broker Trades for testing merged vs per-broker views
  const handleSeedSampleTrades = () => {
    const now = new Date().toISOString().split('T')[0];
    const sampleTrades: Trade[] = [
      {
        id: `sample-1-${Date.now()}`,
        date: now,
        ticker: 'MSFT',
        market: 'US',
        broker: 'FUTU',
        action: 'BUY',
        quantity: 10,
        price: 400.0,
        totalAmount: 4000.0,
      },
      {
        id: `sample-2-${Date.now()}`,
        date: now,
        ticker: 'MSFT',
        market: 'US',
        broker: 'IBKR',
        action: 'BUY',
        quantity: 5,
        price: 420.0,
        totalAmount: 2100.0,
      },
      {
        id: `sample-3-${Date.now()}`,
        date: now,
        ticker: '1810',
        market: 'HK',
        broker: 'HSBC',
        action: 'BUY',
        quantity: 1000,
        price: 2.5,
        totalAmount: 2500.0,
      },
      {
        id: `sample-4-${Date.now()}`,
        date: now,
        ticker: 'BTC',
        market: 'CRYPTO',
        broker: 'Binance',
        action: 'BUY',
        quantity: 0.05,
        price: 60000.0,
        totalAmount: 3000.0,
      },
    ];

    for (const t of sampleTrades) {
      storage.addTrade(t);
    }

    // Add initial price cache entries with success status
    storage.setPriceCacheEntry('US:MSFT', {
      ticker: 'MSFT',
      market: 'US',
      price: 430.0,
      lastFetchedAt: new Date().toISOString(),
      lastFetchStatus: 'success',
    });
    storage.setPriceCacheEntry('HK:1810', {
      ticker: '1810',
      market: 'HK',
      price: 2.7,
      lastFetchedAt: new Date().toISOString(),
      lastFetchStatus: 'success',
    });
    storage.setPriceCacheEntry('CRYPTO:BTC', {
      ticker: 'BTC',
      market: 'CRYPTO',
      price: 64000.0,
      lastFetchedAt: new Date().toISOString(),
      lastFetchStatus: 'success',
    });

    setStorageVersion((v) => v + 1);
    showToast('Loaded sample holdings across multiple brokers!', 'success');
  };

  // Delete trade handler
  const handleDeleteTrade = (tradeId: string) => {
    storage.deleteTrade(tradeId);
    setStorageVersion((v) => v + 1);
    showToast('Trade record deleted', 'info');
  };

  const formatUSD = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-5 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-medium border shadow-2xl backdrop-blur-md flex items-center gap-2 transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/30'
              : 'bg-slate-900/90 text-slate-200 border-slate-700'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toastMessage.type === 'error' && <XCircle className="w-4 h-4 text-rose-400" />}
          {toastMessage.type === 'info' && <Sparkles className="w-4 h-4 text-[#007AFF]" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <Link
            to="/"
            className="p-2 text-[#86868b] hover:text-white bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-xl border border-white/5 transition-colors"
            title="Back to Summary"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-[#f5f5f7]">
            Stock Holdings
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshAllPrices}
            disabled={isRefreshingAll || positions.length === 0}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
            <span>{isRefreshingAll ? 'Refreshing...' : 'Refresh Prices'}</span>
          </Button>

          <Link to="/stock-form">
            <Button variant="primary" size="sm" className="gap-1.5 text-xs">
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Trade</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* SUMMARY OVERVIEW CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 bg-[#121214] border-white/5 space-y-1">
          <span className="text-[10px] font-medium uppercase text-[#86868b] block">Total Value</span>
          <div className="text-lg font-bold font-mono text-white">
            {formatUSD(totals.totalValue)}
          </div>
          <span className="text-[9px] text-[#86868b] block">Current Market Value</span>
        </Card>

        <Card className="p-3 bg-[#121214] border-white/5 space-y-1">
          <span className="text-[10px] font-medium uppercase text-[#86868b] block">Total Cost Basis</span>
          <div className="text-lg font-bold font-mono text-[#f5f5f7]">
            {formatUSD(totals.totalCost)}
          </div>
          <span className="text-[9px] text-[#86868b] block">Sum of Buy Costs</span>
        </Card>

        <Card className="p-3 bg-[#121214] border-white/5 space-y-1">
          <span className="text-[10px] font-medium uppercase text-[#86868b] block">Unrealized G/L</span>
          <div
            className={`text-lg font-bold font-mono flex items-center gap-1 ${
              totals.gainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totals.gainLoss >= 0 ? '+' : ''}
            {formatUSD(totals.gainLoss)}
          </div>
          <span className="text-[9px] text-[#86868b] block">Market vs Cost</span>
        </Card>

        <Card className="p-3 bg-[#121214] border-white/5 space-y-1">
          <span className="text-[10px] font-medium uppercase text-[#86868b] block">Total Return %</span>
          <div
            className={`text-lg font-bold font-mono flex items-center gap-1 ${
              totals.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totals.returnPct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {totals.returnPct >= 0 ? '+' : ''}
            {totals.returnPct.toFixed(2)}%
          </div>
          <span className="text-[9px] text-[#86868b] block">Overall Weighted %</span>
        </Card>
      </div>

      {/* FILTER & SEARCH BAR */}
      <section id="stock-detail-filters" className="space-y-3 bg-[#1c1c1e] p-3.5 rounded-2xl border border-white/5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-2 border-b border-white/5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticker (e.g. MSFT, 1810, BTC)..."
              className="w-full bg-[#121214] border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#86868b] hover:text-white"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#86868b]">
            <Filter className="w-3.5 h-3.5 text-[#007AFF]" />
            <span>Showing {filteredPositions.length} position(s)</span>
          </div>
        </div>

        {/* Broker Filter Chips (Requirement 2) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider">
              Broker Filter (Merged vs Single)
            </span>
            {selectedBroker === 'ALL' ? (
              <span className="text-[10px] font-mono text-[#007AFF]">
                * ALL merges same-ticker positions across brokers
              </span>
            ) : (
              <span className="text-[10px] font-mono text-amber-400">
                * Viewing unmerged rows for {selectedBroker}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'FUTU', 'IBKR', 'HSBC', 'Binance'] as BrokerFilter[]).map((b) => (
              <button
                key={b}
                id={`stock-broker-filter-${b.toLowerCase()}`}
                onClick={() => setSelectedBroker(b)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                  selectedBroker === b
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'bg-[#2c2c2e] text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#3a3a3c]'
                }`}
              >
                {b === 'ALL' ? 'ALL (Merged)' : b}
              </button>
            ))}
          </div>
        </div>

        {/* Market Filter Chips */}
        <div className="space-y-1 pt-1">
          <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider">
            Market Filter
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'US', 'HK', 'US+HK', 'CRYPTO'] as MarketFilter[]).map((m) => (
              <button
                key={m}
                id={`stock-market-filter-${m.toLowerCase().replace('+', '-')}`}
                onClick={() => setSelectedMarket(m)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                  selectedMarket === m
                    ? 'bg-[#2c2c2e] text-white border border-white/20'
                    : 'bg-[#121214] text-[#86868b] hover:text-[#f5f5f7]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* HOLDINGS LIST / DATA-GRID */}
      {filteredPositions.length === 0 ? (
        <Card className="p-8 text-center space-y-4 bg-[#121214] border-dashed border-white/10">
          <div className="w-12 h-12 rounded-full bg-[#1c1c1e] text-[#86868b] flex items-center justify-center mx-auto">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">No Stock Positions Found</h3>
            <p className="text-xs text-[#86868b] max-w-xs mx-auto">
              {trades.length === 0
                ? 'You haven’t recorded any stock or crypto trades yet.'
                : 'No positions match the selected filters.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
            <Link to="/stock-form">
              <Button variant="primary" size="sm" className="gap-1.5">
                <PlusCircle className="w-4 h-4" />
                <span>Record New Trade</span>
              </Button>
            </Link>

            {trades.length === 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSeedSampleTrades}
                className="gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-[#007AFF]" />
                <span>Load Sample Multi-Broker Holdings</span>
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div id="holdings-list-container" className="space-y-3">
          {filteredPositions.map((pos) => {
            const cacheKey = `${pos.market}:${pos.ticker}`;
            const cacheEntry = priceCache[cacheKey] || priceCache[pos.ticker];
            const isRefreshing = !!refreshingTickers[cacheKey];

            // Determine status light status
            const status: 'success' | 'fail' = cacheEntry?.lastFetchStatus || 'fail';

            const isExpanded = expandedTicker === pos.ticker;
            const positionTrades = trades.filter(
              (t) =>
                t.ticker.toUpperCase() === pos.ticker.toUpperCase() &&
                t.market === pos.market &&
                (pos.broker === 'ALL' || t.broker === pos.broker)
            );

            const isGain = pos.returnPct >= 0;

            return (
              <Card
                key={`${pos.market}-${pos.ticker}-${pos.broker}`}
                id={`holding-card-${pos.ticker.toLowerCase()}-${pos.broker.toLowerCase()}`}
                className="p-4 bg-[#121214] border-white/10 space-y-3.5 hover:border-white/20 transition-all shadow-lg"
              >
                {/* Row Header: Ticker, Market/Broker Badges, Current Value & Return % */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold tracking-tight text-white font-mono">
                        {pos.ticker}
                      </span>

                      {/* Market Badge */}
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold ${
                          pos.market === 'US'
                            ? 'bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30'
                            : pos.market === 'HK'
                            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            : pos.market === 'CRYPTO'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {pos.market}
                      </span>

                      {/* Broker Badge */}
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#2c2c2e] text-[#86868b] border border-white/5">
                        {pos.broker === 'ALL' ? 'ALL (Merged)' : pos.broker}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#86868b]">
                      Quantity: <span className="text-white font-mono font-medium">{pos.quantity}</span>
                    </p>
                  </div>

                  {/* Market Value & Return % Pill */}
                  <div className="text-right space-y-1">
                    <div className="text-lg font-extrabold font-mono text-white">
                      {formatUSD(pos.currentValue)}
                    </div>

                    <div className="flex items-center justify-end">
                      <span
                        className={`inline-flex items-center gap-0.5 text-xs font-mono px-2 py-0.5 rounded-lg font-bold border ${
                          isGain
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {isGain ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {isGain ? '+' : ''}
                        {pos.returnPct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                {/* Metrics Grid (Avg Cost, Total Cost, Current Price with Status Light & Retry) */}
                <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-[#1c1c1e] p-2.5 rounded-xl border border-white/5">
                  <div>
                    <span className="text-[10px] text-[#86868b] block uppercase">Avg Cost</span>
                    <span className="text-white font-semibold">{formatUSD(pos.avgCost)}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#86868b] block uppercase">Total Cost</span>
                    <span className="text-[#f5f5f7] font-semibold">{formatUSD(pos.totalCost)}</span>
                  </div>

                  {/* CURRENT PRICE WITH STATUS LIGHT (Requirement 3) */}
                  <div className="text-right space-y-0.5">
                    <span className="text-[10px] text-[#86868b] block uppercase">Live Price</span>

                    <div className="flex items-center justify-end gap-1.5">
                      {/* Price Display */}
                      <span className="text-white font-bold">{formatUSD(pos.currentPrice)}</span>

                      {/* Status Light Dot (Requirement 3) */}
                      <button
                        id={`status-light-${pos.ticker.toLowerCase()}`}
                        onClick={() => handleRefreshSinglePrice(pos.ticker, pos.market)}
                        disabled={isRefreshing}
                        title={
                          status === 'success'
                            ? 'Price status: SUCCESS (Live). Click to refresh.'
                            : 'Price status: FAIL (Stale/Fallback). Click to retry refresh.'
                        }
                        className="relative flex items-center justify-center p-1 rounded-full hover:bg-white/10 transition-colors group cursor-pointer"
                      >
                        {isRefreshing ? (
                          <RefreshCw className="w-3.5 h-3.5 text-[#007AFF] animate-spin" />
                        ) : status === 'success' ? (
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                          </span>
                        ) : (
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
                          </span>
                        )}
                      </button>
                    </div>

                    <span className="text-[9px] text-[#86868b] block font-mono">
                      {status === 'success' ? (
                        <span className="text-emerald-400">Live API</span>
                      ) : (
                        <span className="text-rose-400">Fallback Price</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Card Controls Bar */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  {/* Simulate Fail Status button (for testing fallback + red light) */}
                  <button
                    onClick={() => handleSimulateStatusFail(pos.ticker, pos.market)}
                    className="flex items-center gap-1 text-[10px] text-[#86868b] hover:text-amber-400 font-mono transition-colors"
                    title="Toggle Price Status to FAIL to test red status light & fallback behavior"
                  >
                    {status === 'success' ? (
                      <>
                        <ZapOff className="w-3 h-3 text-amber-500" />
                        <span>Simulate Fail Light</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span>Reset Success Light</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedTicker(isExpanded ? null : pos.ticker)}
                      className="flex items-center gap-1 text-xs font-medium text-[#007AFF] hover:underline"
                    >
                      <span>Trades ({positionTrades.length})</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* EXPANDABLE TRADES DRAWER */}
                {isExpanded && (
                  <div className="pt-3 border-t border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
                      <span>Trade Records for {pos.ticker}</span>
                      <Link
                        to="/stock-form"
                        className="text-[10px] text-[#007AFF] hover:underline flex items-center gap-0.5"
                      >
                        <PlusCircle className="w-3 h-3" />
                        <span>Add Trade</span>
                      </Link>
                    </div>

                    {positionTrades.length === 0 ? (
                      <p className="text-xs text-[#86868b]">No trade records found for this view.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {positionTrades.map((trade) => (
                          <div
                            key={trade.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-[#1c1c1e] text-xs font-mono border border-white/5"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  trade.action === 'BUY'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-rose-500/15 text-rose-400'
                                }`}
                              >
                                {trade.action}
                              </span>
                              <span className="text-[#86868b]">{trade.date}</span>
                              <span className="text-white font-medium">{trade.broker}</span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-white">
                                {trade.quantity} @ ${trade.price.toFixed(2)}
                              </span>
                              <span className="text-[#86868b]">
                                (${trade.totalAmount.toFixed(2)})
                              </span>

                              <button
                                onClick={() => handleDeleteTrade(trade.id)}
                                className="text-[#86868b] hover:text-rose-400 transition-colors p-0.5"
                                title="Delete Trade"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
