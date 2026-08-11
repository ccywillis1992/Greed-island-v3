import React, { useState, useEffect, useMemo } from 'react';
import { storage, STORAGE_ERROR_EVENT } from '../lib/storage';
import { OtherProductRecord, Broker } from '../types';
import { computeCashTotal } from '../lib/calc';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DateInput } from '../components/DateInput';
import {
  Layers,
  PlusCircle,
  Edit3,
  Trash2,
  Copy,
  Calendar,
  DollarSign,
  TrendingUp,
  X,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Sparkles,
  Search,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Filter,
  Tag,
  AlertTriangle,
  Landmark,
} from 'lucide-react';

export const OtherProductDetail: React.FC = () => {
  // Helper for today's ISO date string YYYY-MM-DD
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // Form Field States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(getTodayStr());
  const [productType, setProductType] = useState<string>('Mutual Funds');
  const [broker, setBroker] = useState<Broker>('IBKR');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [unrealizedGainLoss, setUnrealizedGainLoss] = useState<string>('');

  // UI & Storage state
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [storageVersion, setStorageVersion] = useState<number>(0);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  // Listen to storage events
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

  // Load all other product records from storage sorted by asOfDate desc
  const allRecords = useMemo(() => {
    const list = storage.getOtherProducts();
    return [...list].sort((a, b) => {
      if (a.asOfDate !== b.asOfDate) {
        return b.asOfDate.localeCompare(a.asOfDate);
      }
      return b.id.localeCompare(a.id);
    });
  }, [storageVersion]);

  // Distinct product types across all stored records for datalist & filter
  const existingProductTypes = useMemo(() => {
    const set = new Set<string>();
    allRecords.forEach((r) => {
      if (r.productType && r.productType.trim()) {
        set.add(r.productType.trim());
      }
    });
    // Add standard presets if empty
    if (!set.has('Mutual Funds')) set.add('Mutual Funds');
    if (!set.has('Bonds')) set.add('Bonds');
    return Array.from(set);
  }, [allRecords]);

  // Current latest record for each productType (A4)
  const latestRecordsPerType = useMemo(() => {
    const explicitLatest = allRecords.filter((r) => r.isLatest);
    if (explicitLatest.length > 0) return explicitLatest;

    // Fallback if none flagged
    const map = new Map<string, OtherProductRecord>();
    allRecords.forEach((r) => {
      const type = r.productType || 'Other';
      if (!map.has(type) || r.asOfDate > map.get(type)!.asOfDate) {
        map.set(type, r);
      }
    });
    return Array.from(map.values());
  }, [allRecords]);

  // Summed portfolio numbers across all product types' latest records (A4)
  const dashboardSummary = useMemo(() => {
    const totalVal = latestRecordsPerType.reduce((acc, r) => acc + (Number(r.totalAmount) || 0), 0);
    const totalGL = latestRecordsPerType.reduce((acc, r) => acc + (Number(r.unrealizedGainLoss) || 0), 0);
    const denom = totalVal - totalGL;
    const perfPct = denom !== 0 ? (totalGL / denom) * 100 : 0;
    
    // Find latest as-of date among all product types
    let maxDate = '';
    latestRecordsPerType.forEach((r) => {
      if (!maxDate || r.asOfDate > maxDate) {
        maxDate = r.asOfDate;
      }
    });

    return {
      totalVal: Math.round(totalVal * 100) / 100,
      totalGL: Math.round(totalGL * 100) / 100,
      perfPct: Math.round(perfPct * 100) / 100,
      maxDate,
      typeCount: latestRecordsPerType.length,
    };
  }, [latestRecordsPerType]);

  // Filtered list for historical valuation log (A6)
  const historyRecords = useMemo(() => {
    return allRecords.filter((r) => {
      const matchesType =
        selectedTypeFilter === 'ALL' ||
        r.productType.toLowerCase() === selectedTypeFilter.toLowerCase();
      
      if (!matchesType) return false;

      if (!historySearch.trim()) return true;
      const query = historySearch.trim().toLowerCase();
      return (
        r.asOfDate.includes(query) ||
        r.productType.toLowerCase().includes(query) ||
        r.totalAmount.toString().includes(query) ||
        r.unrealizedGainLoss.toString().includes(query)
      );
    });
  }, [allRecords, selectedTypeFilter, historySearch]);

  // Live performance % calculation preview as user types (A2, A6)
  const liveCalculatedPerf = useMemo(() => {
    const parsedTotal = parseFloat(totalAmount);
    const parsedGL = parseFloat(unrealizedGainLoss);
    if (isNaN(parsedTotal) || isNaN(parsedGL)) return null;

    const denom = parsedTotal - parsedGL;
    if (denom === 0) return '-';

    const pct = (parsedGL / denom) * 100;
    const rounded = Math.round(pct * 100) / 100;
    return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}%`;
  }, [totalAmount, unrealizedGainLoss]);

  // Reset form
  const resetForm = () => {
    setEditingId(null);
    setAsOfDate(getTodayStr());
    setProductType('Mutual Funds');
    setBroker('IBKR');
    setTotalAmount('');
    setUnrealizedGainLoss('');
    setFormError(null);
  };

  // Pre-fill form for updating valuation or editing record
  const handlePrepareUpdate = (record?: OtherProductRecord) => {
    if (record) {
      setEditingId(record.id);
      setAsOfDate(record.asOfDate);
      setProductType(record.productType || 'Mutual Funds');
      setBroker(record.broker || 'IBKR');
      setTotalAmount(record.totalAmount.toString());
      setUnrealizedGainLoss(record.unrealizedGainLoss.toString());
    } else {
      setEditingId(null);
      setAsOfDate(getTodayStr());
      setBroker('IBKR');
      setTotalAmount('');
      setUnrealizedGainLoss('');
    }
    setFormError(null);

    const el = document.getElementById('other-product-form-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Duplicate record handler
  const handleDuplicateRecord = (record: OtherProductRecord) => {
    setEditingId(null);
    setAsOfDate(getTodayStr());
    setProductType(record.productType || 'Mutual Funds');
    setBroker(record.broker || 'IBKR');
    setTotalAmount(record.totalAmount.toString());
    setUnrealizedGainLoss(record.unrealizedGainLoss.toString());
    setFormError(null);
    showToast(`Duplicated valuation record form for ${record.productType}. Click save to record.`, 'info');

    const el = document.getElementById('other-product-form-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Form Submit Handler (A2, A3, C1-C5)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const typeClean = productType.trim() || 'Other';

    const parsedTotal = parseFloat(totalAmount);
    if (isNaN(parsedTotal) || parsedTotal < 0) {
      setFormError('Total Amount must be a valid non-negative number.');
      return;
    }

    const parsedGainLoss = parseFloat(unrealizedGainLoss);
    if (isNaN(parsedGainLoss)) {
      setFormError('Unrealized Gain/Loss must be a valid number (e.g. 500 or -250).');
      return;
    }

    if (!asOfDate) {
      setFormError('Please select a valid "as of" date.');
      return;
    }

    const roundedTotal = Math.round(parsedTotal * 100) / 100;
    const roundedGainLoss = Math.round(parsedGainLoss * 100) / 100;
    
    // Calculate performance %: unrealizedGainLoss / (totalAmount - unrealizedGainLoss) * 100
    const denom = roundedTotal - roundedGainLoss;
    const calculatedPerfPct = denom !== 0 ? Math.round(((roundedGainLoss / denom) * 100) * 100) / 100 : 0;

    const currentList = storage.getOtherProducts();

    if (editingId) {
      const target = currentList.find((r) => r.id === editingId);
      if (target) {
        const updatedRecord: OtherProductRecord = {
          ...target,
          asOfDate,
          productType: typeClean,
          broker,
          totalAmount: roundedTotal,
          unrealizedGainLoss: roundedGainLoss,
          performancePct: calculatedPerfPct,
        };
        const res = storage.updateOtherProduct(updatedRecord);
        if (!res.success) {
          setFormError(res.error || 'Failed to update record.');
          return;
        }
      }
    } else {
      const newRecord: OtherProductRecord = {
        id: `other-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        asOfDate,
        productType: typeClean,
        broker,
        totalAmount: roundedTotal,
        unrealizedGainLoss: roundedGainLoss,
        performancePct: calculatedPerfPct,
        isLatest: true,
      };

      const res = storage.addOtherProduct(newRecord);
      if (!res.success) {
        setFormError(res.error || 'Failed to save new record.');
        return;
      }
    }

    // C5. Negative Cash Balance Warning Handling
    const postSaveBrokerBal = computeCashTotal(storage.getCashEntries(), broker);
    if (postSaveBrokerBal < 0) {
      showToast(
        `${broker} cash balance is now negative: -$${Math.abs(postSaveBrokerBal).toFixed(2)}`,
        'error'
      );
    } else if (editingId) {
      showToast(`Updated ${typeClean} record as of ${asOfDate}!`, 'success');
    } else {
      showToast(`Recorded new valuation for ${typeClean} as of ${asOfDate}!`, 'success');
    }

    setStorageVersion((v) => v + 1);
    resetForm();
  };

  // Delete Record Handler
  const handleDelete = (id: string, recordDate: string, typeName: string) => {
    storage.deleteOtherProduct(id);
    setStorageVersion((v) => v + 1);
    showToast(`Deleted ${typeName} record as of ${recordDate}.`, 'info');

    if (editingId === id) {
      resetForm();
    }
  };

  // Seed Sample Data (Multi-Product Type)
  const handleSeedSampleData = () => {
    const today = getTodayStr();
    const prevDate1 = '2026-06-30';
    const prevDate2 = '2026-03-31';

    const sampleRecords: OtherProductRecord[] = [
      {
        id: `sample-mf-1-${Date.now()}`,
        asOfDate: today,
        productType: 'Mutual Funds',
        broker: 'HSBC',
        totalAmount: 25000.0,
        unrealizedGainLoss: 2500.0,
        performancePct: 11.11,
        isLatest: true,
      },
      {
        id: `sample-mf-2-${Date.now()}`,
        asOfDate: prevDate1,
        productType: 'Mutual Funds',
        broker: 'HSBC',
        totalAmount: 22000.0,
        unrealizedGainLoss: 1800.0,
        performancePct: 8.91,
        isLatest: false,
      },
      {
        id: `sample-bond-1-${Date.now()}`,
        asOfDate: today,
        productType: 'Bonds',
        broker: 'IBKR',
        totalAmount: 15000.0,
        unrealizedGainLoss: 600.0,
        performancePct: 4.17,
        isLatest: true,
      },
      {
        id: `sample-bond-2-${Date.now()}`,
        asOfDate: prevDate2,
        productType: 'Bonds',
        broker: 'IBKR',
        totalAmount: 14500.0,
        unrealizedGainLoss: 300.0,
        performancePct: 2.11,
        isLatest: false,
      },
    ];

    storage.saveOtherProducts(sampleRecords);
    setStorageVersion((v) => v + 1);
    showToast('Loaded multi-product-type sample valuation records!', 'success');
  };

  const formatUSD = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatGainLossUSD = (val: number) => {
    const formatted = formatUSD(Math.abs(val));
    if (val > 0) return `+${formatted}`;
    if (val < 0) return `-${formatted}`;
    return formatted;
  };

  const formatPct = (val: number) => {
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification Banner */}
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
      <header className="pb-3 border-b border-white/5">
        <h1 className="text-xl font-bold tracking-tight text-[#f5f5f7]">Other Product Portfolio</h1>
      </header>

      {/* SECTION 1 (TOP): SUMMED DASHBOARD ACROSS ALL PRODUCT TYPES (A4 & Addendum) */}
      <section id="other-product-summary-dashboard">
        {latestRecordsPerType.length > 0 ? (
          <Card className="p-5 bg-[#121214] border-white/10 space-y-4 shadow-xl">
            {/* Header / Caption */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2 flex-wrap">
                <Layers className="w-4 h-4 text-purple-400" />
                <h2 className="text-xs uppercase font-semibold text-[#86868b] tracking-wider">
                  Portfolio Summary (Sum Across Types)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  {dashboardSummary.typeCount} Active Product Type{dashboardSummary.typeCount > 1 ? 's' : ''}
                </span>
              </div>

              {/* As Of Caption */}
              <div className="flex items-center gap-1.5 text-xs text-[#86868b] font-mono">
                <Calendar className="w-3.5 h-3.5 text-[#86868b]" />
                <span>
                  Last updated <strong className="text-white">{dashboardSummary.maxDate || 'N/A'}</strong>
                </span>
              </div>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Metric 1: Total Amount (Summed) -> Feeds Number A */}
              <div className="p-3.5 rounded-xl bg-[#1c1c1e] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                  Total Amount (USD)
                </span>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-white tracking-tight">
                  {formatUSD(dashboardSummary.totalVal)}
                </div>
                <span className="text-[10px] text-[#86868b] block font-mono">
                  Feeds Number A on Summary Dashboard
                </span>
              </div>

              {/* Metric 2: Total Unrealized Gain/Loss (Summed) */}
              <div className="p-3.5 rounded-xl bg-[#1c1c1e] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                  Unrealized Gain / Loss
                </span>
                <div
                  className={`text-xl sm:text-2xl font-extrabold font-mono tracking-tight flex items-center gap-1 ${
                    dashboardSummary.totalGL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {dashboardSummary.totalGL >= 0 ? (
                    <ArrowUpRight className="w-5 h-5 shrink-0" />
                  ) : (
                    <ArrowDownRight className="w-5 h-5 shrink-0" />
                  )}
                  <span>{formatGainLossUSD(dashboardSummary.totalGL)}</span>
                </div>
                <span className="text-[10px] text-[#86868b] block font-mono">
                  Summed across active types
                </span>
              </div>

              {/* Metric 3: Total Performance % (Calculated from sums) */}
              <div className="p-3.5 rounded-xl bg-[#1c1c1e] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                  Total Performance %
                </span>
                <div
                  className={`text-xl sm:text-2xl font-extrabold font-mono tracking-tight ${
                    dashboardSummary.perfPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatPct(dashboardSummary.perfPct)}
                </div>
                <span className="text-[10px] text-[#86868b] block font-mono">
                  Calculated from summed totals
                </span>
              </div>
            </div>

            {/* Individual Product Type Breakdown (A4) */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Latest Valuation per Product Type
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {latestRecordsPerType.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-2.5 rounded-xl bg-[#1c1c1e] border border-white/5 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-purple-400" />
                        <span className="font-bold text-white">{rec.productType}</span>
                      </div>
                      <span className="text-[10px] text-[#86868b] block">as of {rec.asOfDate}</span>
                    </div>

                    <div className="text-right space-y-0.5">
                      <span className="font-bold text-white block">{formatUSD(rec.totalAmount)}</span>
                      <span className={`text-[10px] font-semibold block ${rec.unrealizedGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatGainLossUSD(rec.unrealizedGainLoss)} ({formatPct(rec.performancePct)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-[11px] text-[#86868b]">
                Record a new valuation update for any product type below.
              </span>

              <Button
                id="update-valuation-action-btn"
                variant="primary"
                size="sm"
                onClick={() => handlePrepareUpdate()}
                className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 border-none text-white shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New Valuation Entry</span>
              </Button>
            </div>
          </Card>
        ) : (
          /* Empty State if no records exist yet */
          <Card className="p-8 text-center space-y-4 bg-[#121214] border-dashed border-white/10 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-[#1c1c1e] text-purple-400 flex items-center justify-center mx-auto border border-purple-500/20">
              <Layers className="w-6 h-6" />
            </div>

            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-semibold text-white">No Other Product Records Yet</h3>
              <p className="text-xs text-[#86868b]">
                Track mutual funds, bonds, or other holdings by adding your initial valuation record below.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSeedSampleData}
                className="gap-1.5 text-xs"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Load Sample Valuation Records</span>
              </Button>
            </div>
          </Card>
        )}
      </section>

      {/* SECTION 2 (MIDDLE): VALUATION FORM (A2, A6 & Addendum) */}
      <Card
        id="other-product-form-card"
        className="p-5 bg-[#121214] border-white/10 space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            {editingId ? (
              <Edit3 className="w-4 h-4 text-amber-400" />
            ) : (
              <PlusCircle className="w-4 h-4 text-purple-400" />
            )}
            <h2 className="text-sm font-semibold text-white">
              {editingId ? 'Edit Valuation Record' : 'Record Valuation Entry'}
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

        {/* Global Error Message */}
        {formError && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 font-mono">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <datalist id="product-type-suggestions">
            {existingProductTypes.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Field 1: Product Type (Free text with datalist) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Product Type
              </label>
              <div className="relative">
                <Tag className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  list="product-type-suggestions"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  placeholder="e.g. Mutual Funds, Bonds..."
                  className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>
            </div>

            {/* Field 2: Broker */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Broker
              </label>
              <div className="relative">
                <Landmark className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={broker}
                  onChange={(e) => setBroker(e.target.value as Broker)}
                  className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono appearance-none"
                  required
                >
                  <option value="FUTU">FUTU</option>
                  <option value="IBKR">IBKR</option>
                  <option value="HSBC">HSBC</option>
                  <option value="Binance">Binance</option>
                </select>
              </div>
            </div>

            {/* Field 3: As Of Date */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                As Of Date
              </label>
              <DateInput
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                required
                focusColorClass="focus:border-purple-500"
              />
            </div>

            {/* Field 4: Total Amount (USD) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Total Amount (USD)
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="e.g. 25000.00"
                  className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>
            </div>

            {/* Field 4: Unrealized Gain/Loss (USD) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Unrealized Gain / Loss (USD)
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  value={unrealizedGainLoss}
                  onChange={(e) => setUnrealizedGainLoss(e.target.value)}
                  placeholder="e.g. 2500.00 or -500.00"
                  className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>
            </div>
          </div>

          {/* Computed Performance % Preview (A2, A6) */}
          <div className="p-2.5 rounded-xl bg-[#1c1c1e] border border-white/5 flex items-center justify-between text-xs font-mono">
            <span className="text-[#86868b] flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
              <span>Calculated Performance %:</span>
            </span>
            <span className={`font-bold ${liveCalculatedPerf && !liveCalculatedPerf.startsWith('-') ? 'text-emerald-400' : 'text-rose-400'}`}>
              {liveCalculatedPerf !== null ? liveCalculatedPerf : '-'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="text-xs">
                Cancel
              </Button>
            )}

            <Button
              type="submit"
              id="save-other-product-submit-btn"
              variant="primary"
              size="sm"
              className="gap-1.5 w-full sm:w-auto bg-purple-600 hover:bg-purple-500 border-none text-white"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{editingId ? 'Update Record' : 'Save Valuation Entry'}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* SECTION 3 (BOTTOM): VALUATION HISTORY LIST (A6 & C2) */}
      <section id="other-product-history-section" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-white/5">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Valuation History</h2>
            <span className="text-xs font-mono text-[#86868b]">({historyRecords.length} entries)</span>
          </div>

          {/* Search and Filter */}
          <div className="flex items-center gap-2">
            {/* Filter by Product Type */}
            {existingProductTypes.length > 0 && (
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="bg-[#1c1c1e] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-purple-500 font-mono"
              >
                <option value="ALL">All Types</option>
                {existingProductTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}

            {/* Search Bar */}
            <div className="relative w-full sm:w-40">
              <Search className="w-3 h-3 text-[#86868b] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
          </div>
        </div>

        {historyRecords.length === 0 ? (
          <Card className="p-6 text-center space-y-2 bg-[#121214] border-dashed border-white/10">
            <Clock className="w-5 h-5 text-[#86868b] mx-auto" />
            <p className="text-xs text-[#86868b]">No valuation records found matching your filters.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {historyRecords.map((record) => (
              <Card
                key={record.id}
                id={`other-product-row-${record.id}`}
                className="p-3 bg-[#121214] border-white/5 hover:border-white/15 transition-all space-y-2 font-mono text-xs"
              >
                {/* Header with product type, latest badge, as-of date, and total amount */}
                <div className="flex items-center justify-between gap-2 font-mono">
                  <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 truncate max-w-[100px] sm:max-w-[160px] shrink">
                      {record.productType}
                    </span>

                    {record.broker ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#1c1c1e] text-slate-300 border border-white/10 shrink-0">
                        {record.broker}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0" title="Broker missing. Edit this record to assign a broker.">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Broker needed
                      </span>
                    )}

                    {record.isLatest && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                        LATEST
                      </span>
                    )}

                    <span className="text-xs text-[#86868b] whitespace-nowrap shrink-0">
                      as of <strong className="text-white">{record.asOfDate}</strong>
                    </span>
                  </div>

                  <span className="text-xs font-bold text-white shrink-0 ml-auto">
                    {formatUSD(record.totalAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="text-[#86868b]">
                      G/L:{' '}
                      <strong className={record.unrealizedGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatGainLossUSD(record.unrealizedGainLoss)}
                      </strong>
                    </span>

                    <span className="text-[#86868b]">
                      Perf:{' '}
                      <strong className={record.performancePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatPct(record.performancePct)}
                      </strong>
                    </span>
                  </div>

                  {/* Actions (Edit / Duplicate / Delete) */}
                  <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                    <button
                      id={`edit-other-btn-${record.id}`}
                      onClick={() => handlePrepareUpdate(record)}
                      className="p-1.5 text-[#86868b] hover:text-[#007AFF] transition-colors rounded-lg hover:bg-white/5"
                      title="Edit valuation record"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      id={`duplicate-other-btn-${record.id}`}
                      onClick={() => handleDuplicateRecord(record)}
                      className="p-1.5 text-[#86868b] hover:text-purple-400 transition-colors rounded-lg hover:bg-white/5"
                      title="Duplicate record form"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      id={`delete-other-btn-${record.id}`}
                      onClick={() => handleDelete(record.id, record.asOfDate, record.productType)}
                      className="p-1.5 text-[#86868b] hover:text-rose-400 transition-colors rounded-lg hover:bg-white/5"
                      title="Delete valuation record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
