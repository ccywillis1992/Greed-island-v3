import React, { useState, useEffect } from 'react';
import { storage } from '../lib/storage';
import { computePositions, computeSummaryNumbers } from '../lib/calc';
import { exportToExcel } from '../lib/export';
import {
  syncDailySnapshot,
  editSnapshot,
  deleteSnapshot,
  runSnapshotSanitySuite,
  getHongKongDateAndCutoff,
} from '../lib/snapshot';
import { DailySnapshot } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import {
  Clock,
  Calendar,
  Edit2,
  Trash2,
  Plus,
  Check,
  X,
  Flag,
  Wand2,
  Play,
  ShieldAlert,
  RefreshCw,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';

export const History: React.FC = () => {
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editNumberA, setEditNumberA] = useState<string>('');
  const [editNumberD, setEditNumberD] = useState<string>('');

  // New manual entry modal state
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [newDate, setNewDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [newNumberA, setNewNumberA] = useState<string>('');
  const [newNumberD, setNewNumberD] = useState<string>('');

  // Sanity Test Suite state
  const [sanityResult, setSanityResult] = useState<{ success: boolean; logs: string[] } | null>(null);

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAndSyncSnapshots = () => {
    // 1. Calculate current live numbers
    const trades = storage.getTrades();
    const priceCache = storage.getPriceCache();
    const otherProducts = storage.getOtherProducts();
    const cashEntries = storage.getCashEntries();

    const positions = computePositions(trades, priceCache, 'ALL');
    const summary = computeSummaryNumbers(positions, otherProducts, cashEntries, 'ALL', 'ALL');

    // 2. Sync daily snapshot with cutoff & backfill rules
    const syncRes = syncDailySnapshot(summary.numberA, summary.numberD);
    setSnapshots(syncRes.updatedSnapshots);
  };

  useEffect(() => {
    loadAndSyncSnapshots();
  }, []);

  const handleStartEdit = (snap: DailySnapshot) => {
    setEditingDate(snap.date);
    setEditNumberA(snap.totalAssetsExCash.toFixed(2));
    setEditNumberD(snap.totalAssetsWithCash.toFixed(2));
  };

  const handleSaveEdit = (dateStr: string) => {
    const numA = parseFloat(editNumberA);
    const numD = parseFloat(editNumberD);

    if (isNaN(numA) || isNaN(numD)) {
      setStatusMessage({ type: 'error', text: 'Please enter valid numerical values for Assets and NAV.' });
      return;
    }

    const res = editSnapshot(dateStr, numA, numD);
    if (res.success) {
      setSnapshots(res.snapshots);
      setEditingDate(null);
      setStatusMessage({ type: 'success', text: `Snapshot for ${dateStr} updated successfully.` });
    } else {
      setStatusMessage({ type: 'error', text: 'Failed to update snapshot in storage.' });
    }
  };

  const handleDelete = (dateStr: string) => {
    if (window.confirm(`Are you sure you want to delete the snapshot for ${dateStr}?`)) {
      const res = deleteSnapshot(dateStr);
      if (res.success) {
        setSnapshots(res.snapshots);
        setStatusMessage({ type: 'success', text: `Snapshot for ${dateStr} deleted.` });
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to delete snapshot.' });
      }
    }
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    const numA = parseFloat(newNumberA);
    const numD = parseFloat(newNumberD);

    if (!newDate) {
      setStatusMessage({ type: 'error', text: 'Please select a valid date.' });
      return;
    }
    if (isNaN(numA) || isNaN(numD)) {
      setStatusMessage({ type: 'error', text: 'Please enter valid numbers for Assets and NAV.' });
      return;
    }

    const res = editSnapshot(newDate, numA, numD);
    if (res.success) {
      setSnapshots(res.snapshots);
      setIsAddingNew(false);
      setNewNumberA('');
      setNewNumberD('');
      setStatusMessage({ type: 'success', text: `Historic snapshot for ${newDate} added.` });
    } else {
      setStatusMessage({ type: 'error', text: 'Failed to add historic snapshot.' });
    }
  };

  const handleRunSanitySuite = () => {
    const result = runSnapshotSanitySuite();
    setSanityResult(result);
    loadAndSyncSnapshots();
  };

  const hkInfo = getHongKongDateAndCutoff();

  // Reverse sort for table display (newest first)
  const displaySnapshots = [...snapshots].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <header className="flex items-center justify-between pb-3 border-b border-white/5">
        <div>
          <h1 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#86868b]">
            Module 5 Engine
          </h1>
          <span className="text-xl font-medium tracking-tight text-[#f5f5f7]">Snapshot History</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            id="history-export-excel-btn"
            variant="secondary"
            size="sm"
            onClick={() => {
              const res = exportToExcel();
              if (res.success) {
                setStatusMessage({ type: 'success', text: `Exported ${res.filename} with 6 sheets!` });
              } else {
                setStatusMessage({ type: 'error', text: `Export failed: ${res.error}` });
              }
            }}
            className="gap-1.5 text-xs bg-[#1c1c1e] text-emerald-400 border border-emerald-500/20 hover:bg-[#2c2c2e]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Excel</span>
          </Button>

          <Button
            id="add-historic-snapshot-btn"
            variant="secondary"
            size="sm"
            onClick={() => setIsAddingNew(true)}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Entry</span>
          </Button>
        </div>
      </header>

      {/* HK Cutoff Status Card */}
      <Card id="hk-cutoff-info-card" className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#86868b]">
            <Clock className="w-4 h-4 text-[#007AFF]" />
            <span>Hong Kong Time (Asia/Hong_Kong)</span>
          </div>
          <span className="font-mono text-[#f5f5f7]">
            {String(hkInfo.hkHour).padStart(2, '0')}:{String(hkInfo.hkMinute).padStart(2, '0')} HK
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
          <span className="text-[#86868b]">Target Bucket Date:</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium text-emerald-400">{hkInfo.bucketDateStr}</span>
            {hkInfo.isAfterCutoff ? (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                ≥ 16:30 HK (Tomorrow Bucket)
              </span>
            ) : (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                &lt; 16:30 HK (Today Bucket)
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Notification status message */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modal / Form to add new historic entry */}
      {isAddingNew && (
        <Card id="add-new-snapshot-card" className="space-y-4 border-emerald-500/30 bg-[#1c1c1e]">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Add Historic Snapshot</span>
            </h3>
            <button
              onClick={() => setIsAddingNew(false)}
              className="text-[#86868b] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleAddNew} className="space-y-3">
            <div>
              <label className="text-[10px] font-medium uppercase text-[#86868b] block mb-1">
                Trading Bucket Date
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-[#2c2c2e] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#007AFF]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium uppercase text-[#86868b] block mb-1">
                  Number A (Assets Ex Cash)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newNumberA}
                  onChange={(e) => setNewNumberA(e.target.value)}
                  className="w-full bg-[#2c2c2e] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#007AFF]"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase text-[#86868b] block mb-1">
                  Number D (NAV with Cash)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newNumberD}
                  onChange={(e) => setNewNumberD(e.target.value)}
                  className="w-full bg-[#2c2c2e] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#007AFF]"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAddingNew(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Historic Snapshot
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Snapshots List */}
      <Card id="snapshot-history-list-card" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#f5f5f7]">
            <Calendar className="w-4 h-4 text-[#007AFF]" />
            <h2 className="text-sm font-semibold">Snapshot Logs ({snapshots.length})</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadAndSyncSnapshots}
            className="gap-1 text-[11px] h-7 px-2"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Sync Live</span>
          </Button>
        </div>

        {displaySnapshots.length === 0 ? (
          <p className="text-xs text-[#86868b] text-center py-6">
            No snapshots stored yet. Visit the homepage or add an entry above to create the first snapshot.
          </p>
        ) : (
          <div className="space-y-2.5">
            {displaySnapshots.map((snap) => {
              const isEditing = editingDate === snap.date;

              if (isEditing) {
                return (
                  <div
                    key={snap.date}
                    className="p-3 bg-[#2c2c2e] border border-[#007AFF]/40 rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono text-emerald-400 font-semibold">
                      <span>Edit {snap.date}</span>
                      <span className="text-[10px] text-[#86868b]">Sets isManuallyEdited = true</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-[#86868b]">Assets Ex Cash (A)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editNumberA}
                          onChange={(e) => setEditNumberA(e.target.value)}
                          className="w-full bg-[#1c1c1e] border border-white/10 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#86868b]">NAV with Cash (D)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editNumberD}
                          onChange={(e) => setEditNumberD(e.target.value)}
                          className="w-full bg-[#1c1c1e] border border-white/10 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingDate(null)}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSaveEdit(snap.date)}
                        className="h-7 text-xs gap-1"
                      >
                        <Check className="w-3 h-3" />
                        <span>Save</span>
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={snap.date}
                  className="p-3 bg-[#1c1c1e] border border-white/5 rounded-xl flex items-center justify-between hover:border-white/10 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-xs text-white">{snap.date}</span>

                      {/* Flags */}
                      {snap.isBackfilled && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Wand2 className="w-2.5 h-2.5" />
                          <span>Backfilled</span>
                        </span>
                      )}

                      {snap.isManuallyEdited && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          <Edit2 className="w-2.5 h-2.5" />
                          <span>Edited</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-[#86868b] mr-1">Assets (A):</span>
                        <span className="text-[#f5f5f7] font-medium">
                          ${snap.totalAssetsExCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#86868b] mr-1">NAV (D):</span>
                        <span className="text-[#007AFF] font-medium">
                          ${snap.totalAssetsWithCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStartEdit(snap)}
                      className="p-1.5 text-[#86868b] hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                      title="Edit snapshot"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(snap.date)}
                      className="p-1.5 text-[#86868b] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Delete snapshot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Module 5 Sanity Test Inspector */}
      <Card id="module5-sanity-inspector-card" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#f5f5f7]">
            <TrendingUp className="w-4 h-4 text-[#007AFF]" />
            <h2 className="text-sm font-semibold">Module 5 Rules Inspector</h2>
          </div>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/5 text-[#86868b]">
            src/lib/snapshot.ts
          </span>
        </div>

        <p className="text-xs text-[#86868b] leading-relaxed">
          Verifies 16:30 HK Cutoff Rule, same-day upserting, 3-day gap backfill generation, and manual edit preservation during syncs.
        </p>

        <div className="flex items-center justify-between pt-1 border-t border-white/5">
          <span className="text-xs text-[#f5f5f7] font-medium">Run Module 5 Rule Suite</span>
          <Button
            id="run-snapshot-suite-btn"
            variant="primary"
            size="sm"
            onClick={handleRunSanitySuite}
            className="gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Verify Engine</span>
          </Button>
        </div>

        {sanityResult && (
          <div
            className={`p-3 rounded-xl border font-mono text-[11px] space-y-2 ${
              sanityResult.success
                ? 'bg-[#0a0a0a] border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold text-xs pb-1 border-b border-white/10">
              {sanityResult.success ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>All Module 5 Cutoff, Upsert, Backfill, & Manual Rules Passed</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Module 5 Engine Suite Failed</span>
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
    </div>
  );
};
