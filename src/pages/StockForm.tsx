import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { storage, STORAGE_ERROR_EVENT } from '../lib/storage';
import { refreshPrice, getUsdHkdRate, convertHkdToUsd } from '../lib/priceApi';
import { Trade, Broker, Market, Action } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DateInput } from '../components/DateInput';
import {
  PlusCircle,
  Edit3,
  Trash2,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Sparkles,
  Search,
  X,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeft,
} from 'lucide-react';

export const StockForm: React.FC = () => {
  const navigate = useNavigate();

  // Today's date helper (YYYY-MM-DD)
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(getTodayStr());
  const [ticker, setTicker] = useState<string>('');
  const [market, setMarket] = useState<Market>('US');
  const [broker, setBroker] = useState<Broker>('IBKR');
  const [action, setAction] = useState<Action>('BUY');
  const [quantity, setQuantity] = useState<string>('');
  const [price, setPrice] = useState<string>('');

  // FX Rate State (HKD per USD)
  const [usdHkdRate, setUsdHkdRate] = useState<number>(7.81);

  // Validation & Error States
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Storage and UI Refresh
  const [storageVersion, setStorageVersion] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [tradesSearch, setTradesSearch] = useState<string>('');

  // Fetch live FX rate on mount
  useEffect(() => {
    getUsdHkdRate().then((rate) => setUsdHkdRate(rate));
  }, []);

  // Listen to storage error events
  useEffect(() => {
    const handleStorageError = () => setStorageVersion((v) => v + 1);
    window.addEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, handleStorageError);
  }, []);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Load past trades
  const trades = useMemo(() => {
    const list = storage.getTrades();
    // Sort most recent first by date, then id
    return [...list].sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return b.id.localeCompare(a.id);
    });
  }, [storageVersion]);

  // Filtered trades list
  const filteredTrades = useMemo(() => {
    if (!tradesSearch.trim()) return trades;
    const query = tradesSearch.trim().toLowerCase();
    return trades.filter(
      (t) =>
        t.ticker.toLowerCase().includes(query) ||
        t.broker.toLowerCase().includes(query) ||
        t.market.toLowerCase().includes(query) ||
        t.action.toLowerCase().includes(query)
    );
  }, [trades, tradesSearch]);

  // Auto-calculate Total Amount in USD
  const computedTotal = useMemo(() => {
    const q = parseFloat(quantity);
    const p = parseFloat(price);
    if (isNaN(q) || isNaN(p) || q <= 0 || p <= 0) return 0;

    // If market is HK, price is entered in HKD, so convert to USD for Total Amount
    const priceUsd = market === 'HK' ? p / usdHkdRate : p;
    return Math.round(q * priceUsd * 100) / 100;
  }, [quantity, price, market, usdHkdRate]);

  // Smart Market Suggestion based on Ticker Input
  const handleTickerChange = (raw: string) => {
    const clean = raw.toUpperCase().trim();
    setTicker(clean);
    setTickerError(null);

    // Auto-select market heuristics if user hasn't manually customized
    if (/^\d{4,5}$/.test(clean)) {
      setMarket('HK');
    } else if (['BTC', 'ETH', 'SOL', 'USDT', 'BNB'].includes(clean)) {
      setMarket('CRYPTO');
      setBroker('Binance');
    } else if (clean.length > 0 && market === 'HK' && !/^\d+$/.test(clean)) {
      setMarket('US');
    }
  };

  // Basic Ticker Sanity Validation
  const validateTicker = (value: string): boolean => {
    if (!value.trim()) {
      setTickerError('Ticker symbol cannot be empty.');
      return false;
    }
    const validPattern = /^[A-Z0-9.\-]+$/i;
    if (!validPattern.test(value.trim())) {
      setTickerError('Invalid ticker. Only letters, numbers, dots (.), and hyphens (-) allowed.');
      return false;
    }
    setTickerError(null);
    return true;
  };

  // Handle Form Reset
  const resetForm = () => {
    setEditingId(null);
    setDate(getTodayStr());
    setTicker('');
    setMarket('US');
    setBroker('IBKR');
    setAction('BUY');
    setQuantity('');
    setPrice('');
    setTickerError(null);
    setFormError(null);
  };

  // Handle Form Submit (Add or Update Trade)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTicker = ticker.trim().toUpperCase();

    // Validations
    if (!validateTicker(cleanTicker)) return;

    const parsedQty = parseFloat(quantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setFormError('Quantity must be a positive number greater than 0.');
      return;
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setFormError('Price must be a positive number greater than 0.');
      return;
    }

    if (!date) {
      setFormError('Please select a valid date.');
      return;
    }

    // Convert HKD price to USD if market === 'HK'
    let finalPriceUsd = parsedPrice;
    if (market === 'HK') {
      finalPriceUsd = await convertHkdToUsd(parsedPrice);
    } else {
      finalPriceUsd = Math.round(parsedPrice * 100) / 100;
    }

    const totalAmount = Math.round(parsedQty * finalPriceUsd * 100) / 100;

    const tradeData: Trade = {
      id: editingId || `trade-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      date,
      ticker: cleanTicker,
      market,
      broker,
      action,
      quantity: Math.round(parsedQty * 1000) / 1000, // 3 decimals
      price: finalPriceUsd,                           // Always USD stored
      totalAmount,
    };

    let result;
    if (editingId) {
      result = storage.updateTrade(tradeData);
      showToast(`Trade for ${cleanTicker} updated successfully!`, 'success');
    } else {
      result = storage.addTrade(tradeData);
      showToast(`Recorded ${action} trade for ${cleanTicker}!`, 'success');
    }

    if (!result.success) {
      setFormError(result.error || 'Failed to save trade to storage.');
      return;
    }

    // Refresh state immediately
    setStorageVersion((v) => v + 1);

    // Trigger price fetch in background to ensure price cache is populated/fresh
    refreshPrice(cleanTicker, market).then(() => {
      setStorageVersion((v) => v + 1);
    });

    // Reset Form
    resetForm();
  };

  // Populate Form for Editing
  const handleEditTrade = (trade: Trade) => {
    setEditingId(trade.id);
    setDate(trade.date);
    setTicker(trade.ticker);
    setMarket(trade.market);
    setBroker(trade.broker);
    setAction(trade.action);
    setQuantity(trade.quantity.toString());

    // If market is HK, display price in HKD
    if (trade.market === 'HK') {
      const hkdPrice = Math.round(trade.price * usdHkdRate * 100) / 100;
      setPrice(hkdPrice.toString());
    } else {
      setPrice(trade.price.toString());
    }

    setTickerError(null);
    setFormError(null);

    // Scroll to top form smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Delete Trade
  const handleDeleteTrade = (id: string, tickerName: string) => {
    const res = storage.deleteTrade(id);
    if (res.success) {
      setStorageVersion((v) => v + 1);
      showToast(`Deleted trade record for ${tickerName}.`, 'info');
      if (editingId === id) {
        resetForm();
      }
    } else {
      showToast('Failed to delete trade record.', 'error');
    }
  };

  const formatUSD = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Banner */}
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
      <header className="flex items-center justify-between pb-3 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <Link
            to="/stocks"
            className="p-2 text-[#86868b] hover:text-white bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-xl border border-white/5 transition-colors"
            title="Back to Stock Holdings"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-[#f5f5f7]">Stock Trade Form</h1>
        </div>
      </header>

      {/* SECTION 1: TOP NEW / EDIT TRADE ENTRY FORM */}
      <Card
        id="trade-form-card"
        className="p-5 bg-[#121214] border-white/10 space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            {editingId ? (
              <Edit3 className="w-4 h-4 text-amber-400" />
            ) : (
              <PlusCircle className="w-4 h-4 text-[#007AFF]" />
            )}
            <h2 className="text-sm font-semibold text-white">
              {editingId ? 'Edit Trade Record' : 'Record New Stock/Crypto Trade'}
            </h2>
          </div>

          {editingId && (
            <button
              onClick={resetForm}
              className="text-[11px] text-[#86868b] hover:text-white flex items-center gap-1 font-mono"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel Edit</span>
            </button>
          )}
        </div>

        {/* Global Error Banner */}
        {formError && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 font-mono">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Action Toggle (BUY vs SELL) */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
              Action
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[#1c1c1e] p-1 rounded-xl border border-white/5">
              <button
                type="button"
                id="trade-action-buy-btn"
                onClick={() => setAction('BUY')}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  action === 'BUY'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-[#86868b] hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>BUY</span>
              </button>

              <button
                type="button"
                id="trade-action-sell-btn"
                onClick={() => setAction('SELL')}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  action === 'SELL'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'text-[#86868b] hover:text-white'
                }`}
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>SELL</span>
              </button>
            </div>
          </div>

          {/* Row 1: Date & Ticker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Date Field */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Trade Date
              </label>
              <DateInput
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Ticker Field */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Ticker Symbol
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => handleTickerChange(e.target.value)}
                onBlur={() => validateTicker(ticker)}
                placeholder="e.g. MSFT, 1810, BTC"
                className={`w-full bg-[#1c1c1e] border rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none ${
                  tickerError
                    ? 'border-rose-500 focus:border-rose-400'
                    : 'border-white/10 focus:border-[#007AFF]'
                }`}
                required
              />
              {tickerError && (
                <span className="text-[10px] text-rose-400 block font-mono">{tickerError}</span>
              )}
            </div>
          </div>

          {/* Row 2: Market & Broker Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Market Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Market
              </label>
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value as Market)}
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#007AFF] font-mono"
              >
                <option value="US">US (US Stocks / ETFs)</option>
                <option value="HK">HK (Hong Kong Stocks)</option>
                <option value="CRYPTO">CRYPTO (Crypto Tokens)</option>
                <option value="OTHER">OTHER (Other Securities)</option>
              </select>
            </div>

            {/* Broker Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Broker
              </label>
              <select
                value={broker}
                onChange={(e) => setBroker(e.target.value as Broker)}
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#007AFF] font-mono"
              >
                <option value="IBKR">IBKR (Interactive Brokers)</option>
                <option value="FUTU">FUTU (Futu / MooMoo)</option>
                <option value="HSBC">HSBC (HSBC Investment)</option>
                <option value="Binance">Binance (Crypto Exchange)</option>
              </select>
            </div>
          </div>

          {/* Row 3: Quantity, Price, Total Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Quantity */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Quantity (Units)
              </label>
              <input
                type="number"
                step="any"
                min="0.0001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10 or 0.05"
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#007AFF] font-mono"
                required
              />
            </div>

            {/* Price (USD or HKD) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                {market === 'HK' ? 'PRICE PER UNIT (HKD)' : 'PRICE PER UNIT (USD)'}
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={market === 'HK' ? 'e.g. 25.50' : 'e.g. 420.50'}
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#007AFF] font-mono"
                required
              />
            </div>

            {/* Total Amount (Auto-Calculated ReadOnly USD) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Total Amount (Auto USD)
              </label>
              <div className="w-full bg-[#18181a] border border-white/5 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold flex items-center justify-between text-[#007AFF]">
                <span>{formatUSD(computedTotal)}</span>
                <span className="text-[9px] text-[#86868b] font-normal uppercase">
                  {market === 'HK' ? 'HKD Converted → USD' : 'Price × Qty'}
                </span>
              </div>
            </div>
          </div>

          {/* Submit Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="text-xs">
                Cancel
              </Button>
            )}

            <Button
              type="submit"
              id="save-trade-submit-btn"
              variant="primary"
              size="sm"
              className="gap-1.5 w-full sm:w-auto"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{editingId ? 'Update Trade Record' : 'Save Trade Record'}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* SECTION 2: BOTTOM LIST OF PAST TRADES */}
      <section id="past-trades-list-section" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-white/5">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[#007AFF]" />
            <h2 className="text-sm font-semibold text-white">Past Trade History</h2>
            <span className="text-xs font-mono text-[#86868b]">({trades.length} total)</span>
          </div>

          {/* Search filter for trades */}
          {trades.length > 0 && (
            <div className="relative w-full sm:w-48">
              <Search className="w-3 h-3 text-[#86868b] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tradesSearch}
                onChange={(e) => setTradesSearch(e.target.value)}
                placeholder="Search trades..."
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#007AFF] font-mono"
              />
            </div>
          )}
        </div>

        {filteredTrades.length === 0 ? (
          <Card className="p-8 text-center space-y-2 bg-[#121214] border-dashed border-white/10">
            <div className="w-10 h-10 rounded-full bg-[#1c1c1e] text-[#86868b] flex items-center justify-center mx-auto">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <p className="text-xs text-[#86868b]">
              {trades.length === 0
                ? 'No past trades recorded yet. Fill out the form above to record your first trade.'
                : 'No trades match your search query.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {filteredTrades.map((trade) => {
              const isBuy = trade.action === 'BUY';

              return (
                <Card
                  key={trade.id}
                  id={`trade-row-${trade.id}`}
                  className="p-3 bg-[#121214] border-white/5 hover:border-white/15 transition-all space-y-2 font-mono text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {/* BUY/SELL Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                          isBuy
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {trade.action}
                      </span>

                      {/* Ticker */}
                      <span className="text-sm font-extrabold text-white">{trade.ticker}</span>

                      {/* Market & Broker Badges */}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1e] text-[#86868b] border border-white/5">
                        {trade.market}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1e] text-[#86868b] border border-white/5">
                        {trade.broker}
                      </span>
                    </div>

                    {/* Date */}
                    <span className="text-[11px] text-[#86868b]">{trade.date}</span>
                  </div>

                  {/* Quantity, Price & Total Row */}
                  <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-white/5 whitespace-nowrap gap-2">
                    <div className="flex items-center gap-3 text-[#86868b]">
                      <span>
                        Qty: <strong className="text-white">{trade.quantity}</strong>
                      </span>
                      <span>
                        Price: <strong className="text-white">${trade.price.toFixed(2)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-white font-bold text-xs">
                        {formatUSD(trade.totalAmount)}
                      </span>

                      {/* Controls (✏ Edit, 🗑 Delete) */}
                      <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                        <button
                          id={`edit-trade-btn-${trade.id}`}
                          onClick={() => handleEditTrade(trade)}
                          className="p-1 text-[#86868b] hover:text-[#007AFF] transition-colors rounded-lg hover:bg-white/5"
                          title="Edit trade record"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          id={`delete-trade-btn-${trade.id}`}
                          onClick={() => handleDeleteTrade(trade.id, trade.ticker)}
                          className="p-1 text-[#86868b] hover:text-rose-400 transition-colors rounded-lg hover:bg-white/5"
                          title="Delete trade record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

