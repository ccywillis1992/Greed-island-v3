import React, { useState, useEffect, useMemo } from 'react';
import { storage, STORAGE_ERROR_EVENT } from '../lib/storage';
import { computeCashTotal } from '../lib/calc';
import { CashEntry, Broker, CashAction } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DateInput } from '../components/DateInput';
import {
  Wallet,
  PlusCircle,
  Edit3,
  Trash2,
  Copy,
  DollarSign,
  X,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Sparkles,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Landmark,
} from 'lucide-react';

export const CashDetail: React.FC = () => {
  // Today's date helper (YYYY-MM-DD)
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // Section 2 State: Form Fields
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(getTodayStr());
  const [broker, setBroker] = useState<Broker>('IBKR');
  const [action, setAction] = useState<CashAction>('IN');
  const [amount, setAmount] = useState<string>('');

  // Form Error & Toast state
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [storageVersion, setStorageVersion] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // Load all cash entries from storage
  const cashEntries = useMemo(() => {
    const entries = storage.getCashEntries();
    // Sort most recent first by date, then id
    return [...entries].sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return b.id.localeCompare(a.id);
    });
  }, [storageVersion]);

  // Total cash calculation across all brokers
  const totalCash = useMemo(() => {
    return computeCashTotal(cashEntries, 'ALL');
  }, [cashEntries]);

  // Cash stats breakdown
  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;

    for (const entry of cashEntries) {
      const val = Number(entry.amount) || 0;
      if (entry.action === 'IN') {
        totalIn += val;
      } else {
        totalOut += val;
      }
    }

    return {
      totalIn: Math.round(totalIn * 100) / 100,
      totalOut: Math.round(totalOut * 100) / 100,
    };
  }, [cashEntries]);

  // Per-broker cash balances map
  const brokerBalances = useMemo(() => {
    const brokers: Broker[] = ['IBKR', 'FUTU', 'HSBC', 'Binance'];
    const map: Record<Broker, number> = {
      IBKR: 0,
      FUTU: 0,
      HSBC: 0,
      Binance: 0,
    };

    for (const b of brokers) {
      map[b] = computeCashTotal(cashEntries, b);
    }
    return map;
  }, [cashEntries]);

  // Filtered entries for Section 3 bottom list
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return cashEntries;
    const query = searchQuery.trim().toLowerCase();
    return cashEntries.filter(
      (entry) =>
        entry.broker.toLowerCase().includes(query) ||
        entry.action.toLowerCase().includes(query) ||
        entry.date.includes(query) ||
        entry.amount.toString().includes(query)
    );
  }, [cashEntries, searchQuery]);

  // Form Reset
  const resetForm = () => {
    setEditingId(null);
    setDate(getTodayStr());
    setBroker('IBKR');
    setAction('IN');
    setAmount('');
    setFormError(null);
  };

  // Handle Form Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Amount must be a positive number greater than 0.');
      return;
    }

    if (!date) {
      setFormError('Please select a valid date.');
      return;
    }

    const roundedAmount = Math.round(parsedAmount * 100) / 100;

    const entryData: CashEntry = {
      id: editingId || `cash-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      date,
      broker,
      action,
      amount: roundedAmount,
    };

    let result;
    if (editingId) {
      result = storage.updateCashEntry(entryData);
      showToast(`Updated cash ${action} record ($${roundedAmount.toFixed(2)} USD)`, 'success');
    } else {
      result = storage.addCashEntry(entryData);
      showToast(`Recorded cash ${action} of $${roundedAmount.toFixed(2)} USD for ${broker}`, 'success');
    }

    if (!result.success) {
      setFormError(result.error || 'Failed to save cash entry to storage.');
      return;
    }

    // Refresh state immediately so top totals and bottom list reflect instantly
    setStorageVersion((v) => v + 1);
    resetForm();
  };

  // Edit entry handler
  const handleEditEntry = (entry: CashEntry) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setBroker(entry.broker);
    setAction(entry.action);
    setAmount(entry.amount.toString());
    setFormError(null);

    // Scroll smoothly to form section
    const formEl = document.getElementById('cash-entry-form-card');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Duplicate entry handler
  const handleDuplicateEntry = (entry: CashEntry) => {
    setEditingId(null);
    setDate(getTodayStr());
    setBroker(entry.broker);
    setAction(entry.action);
    setAmount(entry.amount.toString());
    setFormError(null);
    showToast(`Duplicated ${entry.broker} ${entry.action} cash entry form. Click save to record.`, 'info');

    const formEl = document.getElementById('cash-entry-form-card');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Delete entry handler
  const handleDeleteEntry = (id: string, entryBroker: Broker, entryAction: CashAction, entryAmount: number) => {
    const res = storage.deleteCashEntry(id);
    if (res.success) {
      setStorageVersion((v) => v + 1);
      showToast(`Deleted cash ${entryAction} record ($${entryAmount.toFixed(2)} for ${entryBroker})`, 'info');
      if (editingId === id) {
        resetForm();
      }
    } else {
      showToast('Failed to delete cash entry.', 'error');
    }
  };

  // Seed Sample Cash Entries for testing/demonstration
  const handleSeedSampleCash = () => {
    const today = getTodayStr();
    const sampleEntries: CashEntry[] = [
      {
        id: `sample-cash-1-${Date.now()}`,
        date: today,
        broker: 'IBKR',
        action: 'IN',
        amount: 15000.0,
      },
      {
        id: `sample-cash-2-${Date.now()}`,
        date: today,
        broker: 'FUTU',
        action: 'IN',
        amount: 8000.0,
      },
      {
        id: `sample-cash-3-${Date.now()}`,
        date: today,
        broker: 'HSBC',
        action: 'IN',
        amount: 5000.0,
      },
      {
        id: `sample-cash-4-${Date.now()}`,
        date: today,
        broker: 'Binance',
        action: 'IN',
        amount: 3000.0,
      },
      {
        id: `sample-cash-5-${Date.now()}`,
        date: today,
        broker: 'FUTU',
        action: 'OUT',
        amount: 2000.0,
      },
    ];

    for (const entry of sampleEntries) {
      storage.addCashEntry(entry);
    }

    setStorageVersion((v) => v + 1);
    showToast('Loaded sample cash deposit & withdrawal records!', 'success');
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
      <header className="pb-3 border-b border-white/5">
        <h1 className="text-xl font-bold tracking-tight text-[#f5f5f7]">Broker Cash Balance</h1>
      </header>

      {/* SECTION 1 (TOP): TOTAL CASH SUM */}
      <section id="cash-summary-section" className="space-y-3">
        {/* Total Cash Hero Banner */}
        <Card className="p-5 bg-[#121214] border-white/10 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-[#86868b]">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold uppercase tracking-wider text-[10px]">
                  Total Cash Available (Buying Power)
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
                {formatUSD(totalCash)}
              </div>
            </div>

            {/* Quick Metrics (Sum In, Sum Out) */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-0.5">
                <span className="text-[9px] uppercase text-emerald-400 font-semibold block">Total In</span>
                <span className="text-emerald-300 font-bold">+{formatUSD(stats.totalIn)}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-0.5">
                <span className="text-[9px] uppercase text-rose-400 font-semibold block">Total Out</span>
                <span className="text-rose-300 font-bold">-{formatUSD(stats.totalOut)}</span>
              </div>
            </div>
          </div>

          {/* Per-Broker Cash Breakdown Cards Grid (Always On) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {(['IBKR', 'FUTU', 'HSBC', 'Binance'] as Broker[]).map((b) => {
              const bal = brokerBalances[b];

              return (
                <div
                  key={b}
                  className="p-2.5 rounded-xl bg-[#1c1c1e] border border-white/5 hover:border-white/15 transition-all"
                >
                  <div className="flex items-center justify-between text-[10px] text-[#86868b]">
                    <span className="font-semibold text-white">{b}</span>
                    <Landmark className="w-3 h-3 text-[#86868b]" />
                  </div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    {formatUSD(bal)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* SECTION 2 (MIDDLE): NEW / EDIT CASH ENTRY FORM (Requirement 1, 2 & 4) */}
      <Card
        id="cash-entry-form-card"
        className="p-5 bg-[#121214] border-white/10 space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            {editingId ? (
              <Edit3 className="w-4 h-4 text-amber-400" />
            ) : (
              <PlusCircle className="w-4 h-4 text-emerald-400" />
            )}
            <h2 className="text-sm font-semibold text-white">
              {editingId ? 'Edit Cash Entry' : 'Record New Cash Deposit or Withdrawal'}
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

        {/* Global Form Error */}
        {formError && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 font-mono">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Action Toggle (Deposit vs Withdraw) */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
              Action
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[#1c1c1e] p-1 rounded-xl border border-white/5">
              <button
                type="button"
                id="cash-action-in-btn"
                onClick={() => setAction('IN')}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  action === 'IN'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-[#86868b] hover:text-white'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Deposit</span>
              </button>

              <button
                type="button"
                id="cash-action-out-btn"
                onClick={() => setAction('OUT')}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  action === 'OUT'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'text-[#86868b] hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Withdraw</span>
              </button>
            </div>
          </div>

          {/* Form Fields: Date, Broker, Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Date Field */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Date
              </label>
              <DateInput
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                focusColorClass="focus:border-emerald-500"
              />
            </div>

            {/* Broker Dropdown (FUTU / IBKR / HSBC / Binance) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Broker Account
              </label>
              <select
                value={broker}
                onChange={(e) => setBroker(e.target.value as Broker)}
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value="IBKR">IBKR (Interactive Brokers)</option>
                <option value="FUTU">FUTU (Futu / MooMoo)</option>
                <option value="HSBC">HSBC (HSBC Investment)</option>
                <option value="Binance">Binance (Crypto Exchange)</option>
              </select>
            </div>

            {/* Amount Field (USD) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                Amount (USD)
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000.00"
                  className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="text-xs">
                Cancel
              </Button>
            )}

            <Button
              type="submit"
              id="save-cash-submit-btn"
              variant="primary"
              size="sm"
              className="gap-1.5 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 border-none text-white"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{editingId ? 'Update Cash Record' : 'Save Cash Entry'}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* SECTION 3 (BOTTOM): LIST OF PAST CASH ENTRIES (Requirement 1, 4 & 5) */}
      <section id="past-cash-entries-section" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Past Cash Activity History</h2>
            <span className="text-xs font-mono text-[#86868b]">({cashEntries.length} total)</span>
          </div>

          {/* Search filter input */}
          {cashEntries.length > 0 && (
            <div className="relative w-full sm:w-48">
              <Search className="w-3 h-3 text-[#86868b] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entries..."
                className="w-full bg-[#1c1c1e] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          )}
        </div>

        {filteredEntries.length === 0 ? (
          <Card className="p-8 text-center space-y-3 bg-[#121214] border-dashed border-white/10">
            <div className="w-10 h-10 rounded-full bg-[#1c1c1e] text-[#86868b] flex items-center justify-center mx-auto">
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">No Cash Entries Found</h3>
              <p className="text-xs text-[#86868b] max-w-xs mx-auto">
                {cashEntries.length === 0
                  ? 'You haven’t recorded any cash deposits or withdrawals yet.'
                  : 'No cash entries match the selected broker or search query.'}
              </p>
            </div>

            {cashEntries.length === 0 && (
              <div className="pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSeedSampleCash}
                  className="gap-1.5 text-xs"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Load Sample Cash Deposits/Withdrawals</span>
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => {
              const isIn = entry.action === 'IN';

              return (
                <Card
                  key={entry.id}
                  id={`cash-row-${entry.id}`}
                  className="p-3 bg-[#121214] border-white/5 hover:border-white/15 transition-all space-y-2 font-mono text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {/* IN / OUT Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider flex items-center gap-1 ${
                          isIn
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {isIn ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        <span>{isIn ? 'Deposit' : 'Withdraw'}</span>
                      </span>

                      {/* Broker Name */}
                      <span className="text-sm font-extrabold text-white">{entry.broker}</span>

                      <span className="text-[10px] text-[#86868b] px-1.5 py-0.5 rounded bg-[#1c1c1e] border border-white/5">
                        USD
                      </span>
                    </div>

                    {/* Date */}
                    <span className="text-[11px] text-[#86868b]">{entry.date}</span>
                  </div>

                  {/* Amount and Controls */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="text-[#86868b] text-[11px]">Amount:</span>
                      <span
                        className={`text-sm font-extrabold ${
                          isIn ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isIn ? '+' : '-'}{formatUSD(entry.amount)}
                      </span>
                    </div>

                    {/* Edit, Duplicate, and Delete Buttons */}
                    <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                      <button
                        id={`edit-cash-btn-${entry.id}`}
                        onClick={() => handleEditEntry(entry)}
                        className="p-1.5 text-[#86868b] hover:text-[#007AFF] transition-colors rounded-lg hover:bg-white/5"
                        title="Edit cash entry"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        id={`duplicate-cash-btn-${entry.id}`}
                        onClick={() => handleDuplicateEntry(entry)}
                        className="p-1.5 text-[#86868b] hover:text-purple-400 transition-colors rounded-lg hover:bg-white/5"
                        title="Duplicate cash entry"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        id={`delete-cash-btn-${entry.id}`}
                        onClick={() => handleDeleteEntry(entry.id, entry.broker, entry.action, entry.amount)}
                        className="p-1.5 text-[#86868b] hover:text-rose-400 transition-colors rounded-lg hover:bg-white/5"
                        title="Delete cash entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
