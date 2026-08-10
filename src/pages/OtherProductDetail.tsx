import React, { useState, useEffect, useMemo } from 'react';
import { storage, STORAGE_ERROR_EVENT } from '../lib/storage';
import { OtherProductRecord } from '../types';
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
  TrendingDown,
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
} from 'lucide-react';

export const OtherProductDetail: React.FC = () => {
  // Helper for today's ISO date string YYYY-MM-DD
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // Form Field States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(getTodayStr());
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [unrealizedGainLoss, setUnrealizedGainLoss] = useState<string>('');
  const [performancePct, setPerformancePct] = useState<string>('');

  // UI & Storage state
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [storageVersion, setStorageVersion] = useState<number>(0);
  const [historySearch, setHistorySearch] = useState<string>('');

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

  // Identify latest record (Requirement 1 & 3)
  const latestRecord = useMemo(() => {
    const explicitLatest = allRecords.find((r) => r.isLatest);
    if (explicitLatest) return explicitLatest;
    return allRecords.length > 0 ? allRecords[0] : null;
  }, [allRecords]);

  // Past (non-latest) historical records (Requirement 4)
  const pastRecords = useMemo(() => {
    if (!latestRecord) return [];
    const list = allRecords.filter((r) => r.id !== latestRecord.id);
    if (!historySearch.trim()) return list;

    const query = historySearch.trim().toLowerCase();
    return list.filter(
      (r) =>
        r.asOfDate.includes(query) ||
        r.totalAmount.toString().includes(query) ||
        r.unrealizedGainLoss.toString().includes(query) ||
        r.performancePct.toString().includes(query)
    );
  }, [allRecords, latestRecord, historySearch]);

  // Reset form
  const resetForm = () => {
    setEditingId(null);
    setAsOfDate(getTodayStr());
    setTotalAmount('');
    setUnrealizedGainLoss('');
    setPerformancePct('');
    setFormError(null);
  };

  // Pre-fill form for updating valuation or editing record
  const handlePrepareUpdate = (record?: OtherProductRecord) => {
    if (record) {
      setEditingId(record.id);
      setAsOfDate(record.asOfDate);
      setTotalAmount(record.totalAmount.toString());
      setUnrealizedGainLoss(record.unrealizedGainLoss.toString());
      setPerformancePct(record.performancePct.toString());
    } else if (latestRecord) {
      // Prepare new update entry pre-filled with current totalAmount for convenience
      setEditingId(null);
      setAsOfDate(getTodayStr());
      setTotalAmount(latestRecord.totalAmount.toString());
      setUnrealizedGainLoss(latestRecord.unrealizedGainLoss.toString());
      setPerformancePct(latestRecord.performancePct.toString());
    }
    setFormError(null);

    // Scroll to form card
    const el = document.getElementById('other-product-form-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Duplicate record handler
  const handleDuplicateRecord = (record: OtherProductRecord) => {
    setEditingId(null);
    setAsOfDate(getTodayStr());
    setTotalAmount(record.totalAmount.toString());
    setUnrealizedGainLoss(record.unrealizedGainLoss.toString());
    setPerformancePct(record.performancePct.toString());
    setFormError(null);
    showToast(`Duplicated valuation record form. Click save to record.`, 'info');

    const el = document.getElementById('other-product-form-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Form Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

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

    const parsedPerfPct = parseFloat(performancePct);
    if (isNaN(parsedPerfPct)) {
      setFormError('Performance % must be a valid number (e.g. 10.5 or -3.2).');
      return;
    }

    if (!asOfDate) {
      setFormError('Please select a valid "as of" date.');
      return;
    }

    const roundedTotal = Math.round(parsedTotal * 100) / 100;
    const roundedGainLoss = Math.round(parsedGainLoss * 100) / 100;
    const roundedPerfPct = Math.round(parsedPerfPct * 100) / 100;

    const currentList = storage.getOtherProducts();

    if (editingId) {
      // Editing an existing record in place
      const target = currentList.find((r) => r.id === editingId);
      if (target) {
        const updatedRecord: OtherProductRecord = {
          ...target,
          asOfDate,
          totalAmount: roundedTotal,
          unrealizedGainLoss: roundedGainLoss,
          performancePct: roundedPerfPct,
        };
        const res = storage.updateOtherProduct(updatedRecord);
        if (!res.success) {
          setFormError(res.error || 'Failed to update record.');
          return;
        }
        showToast(`Updated record as of ${asOfDate}!`, 'success');
      }
    } else {
      // Creating a NEW valuation update: Demote all existing records so isLatest = false (Requirement 3)
      const demotedList = currentList.map((r) => ({ ...r, isLatest: false }));

      const newRecord: OtherProductRecord = {
        id: `other-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        asOfDate,
        totalAmount: roundedTotal,
        unrealizedGainLoss: roundedGainLoss,
        performancePct: roundedPerfPct,
        isLatest: true, // Promoted as current latest record
      };

      const res = storage.saveOtherProducts([...demotedList, newRecord]);
      if (!res.success) {
        setFormError(res.error || 'Failed to save new record.');
        return;
      }
      showToast(`Recorded new latest valuation update as of ${asOfDate}!`, 'success');
    }

    // Refresh UI
    setStorageVersion((v) => v + 1);
    resetForm();
  };

  // Delete Record Handler
  const handleDelete = (id: string, recordDate: string) => {
    const currentList = storage.getOtherProducts();
    const target = currentList.find((r) => r.id === id);
    const remaining = currentList.filter((r) => r.id !== id);

    if (target?.isLatest && remaining.length > 0) {
      // Demote deleted record, promote remaining most recent record to isLatest: true
      const sorted = [...remaining].sort((a, b) => b.asOfDate.localeCompare(a.asOfDate));
      sorted[0].isLatest = true;
      storage.saveOtherProducts(sorted);
    } else {
      storage.deleteOtherProduct(id);
    }

    setStorageVersion((v) => v + 1);
    showToast(`Deleted valuation record as of ${recordDate}.`, 'info');

    if (editingId === id) {
      resetForm();
    }
  };

  // Seed Sample Data
  const handleSeedSampleData = () => {
    const today = getTodayStr();
    const prevDate1 = '2026-06-30';
    const prevDate2 = '2026-03-31';

    const sampleRecords: OtherProductRecord[] = [
      {
        id: `sample-other-1-${Date.now()}`,
        asOfDate: today,
        totalAmount: 25000.0,
        unrealizedGainLoss: 2500.0,
        performancePct: 11.11,
        isLatest: true,
      },
      {
        id: `sample-other-2-${Date.now()}`,
        asOfDate: prevDate1,
        totalAmount: 22000.0,
        unrealizedGainLoss: 1800.0,
        performancePct: 8.91,
        isLatest: false,
      },
      {
        id: `sample-other-3-${Date.now()}`,
        asOfDate: prevDate2,
        totalAmount: 20000.0,
        unrealizedGainLoss: 1000.0,
        performancePct: 5.26,
        isLatest: false,
      },
    ];

    storage.saveOtherProducts(sampleRecords);
    setStorageVersion((v) => v + 1);
    showToast('Loaded sample Other Product valuation records!', 'success');
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

      {/* SECTION 1 (TOP): LATEST RECORD ONLY SUMMARY CARD (Requirement 1, 2, 3 & 5) */}
      <section id="latest-other-product-summary-section">
        {latestRecord ? (
          <Card className="p-5 bg-[#121214] border-white/10 space-y-4 shadow-xl">
            {/* Title & Status Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <h2 className="text-xs uppercase font-semibold text-[#86868b] tracking-wider">
                  Latest Active Valuation Record
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-purple-400" />
                  <span>isLatest = true</span>
                </span>
              </div>

              {/* "as of" Date Banner */}
              <div className="flex items-center gap-1.5 text-xs text-[#86868b] font-mono">
                <Calendar className="w-3.5 h-3.5 text-[#86868b]" />
                <span>as of <strong className="text-white">{latestRecord.asOfDate}</strong></span>
              </div>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Metric 1: Total Amount (USD) -> Feeds Number A */}
              <div className="p-3.5 rounded-xl bg-[#1c1c1e] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                  Total Amount (USD)
                </span>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-white tracking-tight">
                  {formatUSD(latestRecord.totalAmount)}
                </div>
                <span className="text-[10px] text-[#86868b] block font-mono">
                  Feeds Number A on Summary Dashboard
                </span>
              </div>

              {/* Metric 2: Total Unrealized Gain/Loss (USD) */}
              <div className="p-3.5 rounded-xl bg-[#1c1c1e] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                  Unrealized Gain / Loss
                </span>
                <div
                  className={`text-xl sm:text-2xl font-extrabold font-mono tracking-tight flex items-center gap-1 ${
                    latestRecord.unrealizedGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {latestRecord.unrealizedGainLoss >= 0 ? (
                    <ArrowUpRight className="w-5 h-5 shrink-0" />
                  ) : (
                    <ArrowDownRight className="w-5 h-5 shrink-0" />
                  )}
                  <span>{formatGainLossUSD(latestRecord.unrealizedGainLoss)}</span>
                </div>
                <span className="text-[10px] text-[#86868b] block font-mono">
                  Tracked separately per record
                </span>
              </div>

              {/* Metric 3: Total Performance % */}
              <div className="p-3.5 rounded-xl bg-[#1c1c1e] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                  Total Performance %
                </span>
                <div
                  className={`text-xl sm:text-2xl font-extrabold font-mono tracking-tight ${
                    latestRecord.performancePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatPct(latestRecord.performancePct)}
                </div>
                <span className="text-[10px] text-[#86868b] block font-mono">
                  Manual percentage entry
                </span>
              </div>
            </div>

            {/* Quick Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-[11px] text-[#86868b]">
                Need to record a new valuation update? Click update to create a new entry.
              </span>

              <Button
                id="update-valuation-action-btn"
                variant="primary"
                size="sm"
                onClick={() => handlePrepareUpdate()}
                className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 border-none text-white shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Update Valuation</span>
              </Button>
            </div>
          </Card>
        ) : (
          /* Empty State if no records exist yet (Requirement 2) */
          <Card className="p-8 text-center space-y-4 bg-[#121214] border-dashed border-white/10 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-[#1c1c1e] text-purple-400 flex items-center justify-center mx-auto border border-purple-500/20">
              <Layers className="w-6 h-6" />
            </div>

            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-semibold text-white">No Other Product Valuation Recorded Yet</h3>
              <p className="text-xs text-[#86868b]">
                Add your initial valuation record below to track unquoted funds or bonds and include them in Homepage Number A.
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

      {/* SECTION 2 (MIDDLE): NEW / UPDATE VALUATION ENTRY FORM (Requirement 1, 2, 3) */}
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
              {editingId
                ? 'Edit Valuation Record'
                : latestRecord
                ? 'Update Valuation Record (Will become new latest)'
                : 'Add Initial Other Product Record'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Field 1: As Of Date */}
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

            {/* Field 2: Total Amount (USD) */}
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

            {/* Field 3: Unrealized Gain/Loss (USD) */}
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

            {/* Field 4: Total Performance % */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Total Performance %
              </label>
              <div className="relative">
                <TrendingUp className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  value={performancePct}
                  onChange={(e) => setPerformancePct(e.target.value)}
                  placeholder="e.g. 11.11 or -2.50"
                  className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>
            </div>
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
              <span>
                {editingId
                  ? 'Update Record'
                  : latestRecord
                  ? 'Save New Valuation Update'
                  : 'Add Initial Valuation Record'}
              </span>
            </Button>
          </div>
        </form>
      </Card>

      {/* SECTION 3 (BOTTOM): PAST (NON-LATEST) READ-ONLY HISTORICAL RECORDS (Requirement 1 & 4) */}
      <section id="past-other-product-history-section" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-white/5">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Past Valuation History</h2>
            <span className="text-xs font-mono text-[#86868b]">({pastRecords.length} historical entries)</span>
          </div>

          {/* Search Bar */}
          {pastRecords.length > 0 && (
            <div className="relative w-full sm:w-48">
              <Search className="w-3 h-3 text-[#86868b] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history..."
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
          )}
        </div>

        {pastRecords.length === 0 ? (
          <Card className="p-6 text-center space-y-2 bg-[#121214] border-dashed border-white/10">
            <Clock className="w-5 h-5 text-[#86868b] mx-auto" />
            <p className="text-xs text-[#86868b]">
              {allRecords.length <= 1
                ? 'No past historical records yet. When you update the valuation, previous records will automatically demote into this read-only history list.'
                : 'No past valuation records match your search query.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {pastRecords.map((record) => (
              <Card
                key={record.id}
                id={`other-product-row-${record.id}`}
                className="p-3.5 bg-[#121214] border-white/5 hover:border-white/15 transition-all space-y-2 font-mono text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-[#1c1c1e] text-[#86868b] border border-white/5">
                      HISTORICAL RECORD
                    </span>
                    <span className="text-xs text-[#86868b]">
                      as of <strong className="text-white">{record.asOfDate}</strong>
                    </span>
                  </div>

                  <span className="text-xs font-bold text-white">
                    {formatUSD(record.totalAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                  <div className="flex items-center gap-4">
                    <span className="text-[#86868b]">
                      Gain/Loss:{' '}
                      <strong
                        className={
                          record.unrealizedGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {formatGainLossUSD(record.unrealizedGainLoss)}
                      </strong>
                    </span>

                    <span className="text-[#86868b]">
                      Perf %:{' '}
                      <strong
                        className={
                          record.performancePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
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
                      title="Edit historical record"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      id={`duplicate-other-btn-${record.id}`}
                      onClick={() => handleDuplicateRecord(record)}
                      className="p-1.5 text-[#86868b] hover:text-purple-400 transition-colors rounded-lg hover:bg-white/5"
                      title="Duplicate historical record"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      id={`delete-other-btn-${record.id}`}
                      onClick={() => handleDelete(record.id, record.asOfDate)}
                      className="p-1.5 text-[#86868b] hover:text-rose-400 transition-colors rounded-lg hover:bg-white/5"
                      title="Delete historical record"
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
