import React, { useState, useRef } from 'react';
import {
  exportBackupJSON,
  parseAndValidateBackup,
  importBackupData,
  getCurrentStorageSummary,
  BackupValidationResult,
  CurrentStorageSummary,
} from '../lib/backup';
import { Card } from './Card';
import { Button } from './Button';
import {
  Download,
  Upload,
  AlertTriangle,
  FileJson,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  ShieldAlert,
  Database,
  ArrowRight,
  HardDrive,
} from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess?: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [currentSummary, setCurrentSummary] = useState<CurrentStorageSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  if (!isOpen) return null;

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // 1. Export Handler
  const handleExport = () => {
    const res = exportBackupJSON();
    if (res.success) {
      showToast(`Exported ${res.filename} successfully!`, 'success');
    } else {
      showToast(`Export failed: ${res.error || 'Unknown error'}`, 'error');
    }
  };

  // 2. File Selection Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setIsProcessing(true);
    setValidationResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = parseAndValidateBackup(content);
      setValidationResult(result);
      setCurrentSummary(getCurrentStorageSummary());
      setIsProcessing(false);
    };

    reader.onerror = () => {
      setValidationResult({
        valid: false,
        error: 'Failed to read file from disk.',
      });
      setIsProcessing(false);
    };

    reader.readAsText(file);
  };

  // 3. Confirm Full-Replace Import Handler
  const handleConfirmImport = async () => {
    if (!validationResult?.data) {
      showToast('No valid backup data to restore.', 'error');
      return;
    }

    setIsProcessing(true);
    const res = await importBackupData(validationResult.data);
    setIsProcessing(false);

    if (res.success) {
      showToast('Backup restored successfully! Application reloaded.', 'success');
      setTimeout(() => {
        if (onRestoreSuccess) onRestoreSuccess();
        onClose();
        // Trigger window location reload to guarantee clean state across all views
        window.location.reload();
      }, 1000);
    } else {
      showToast(`Restore failed: ${res.error}`, 'error');
    }
  };

  // Reset file selection
  const resetFileSelection = () => {
    setSelectedFileName(null);
    setValidationResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
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
          {toastMessage.type === 'info' && <HardDrive className="w-4 h-4 text-[#007AFF]" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      <Card
        id="backup-restore-modal"
        className="w-full max-w-lg bg-[#121214] border-white/10 p-5 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">JSON Backup & Restore</h2>
              <p className="text-[11px] text-[#86868b]">
                Local browser storage persistence engine (Module 12)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#86868b] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SECTION 1: EXPORT */}
        <div className="p-4 rounded-xl bg-[#1c1c1e] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[#007AFF]" />
              <h3 className="text-xs font-semibold text-white">1. Export JSON Backup</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Full Download
            </span>
          </div>

          <p className="text-[11px] text-[#86868b] leading-relaxed">
            Saves a complete JSON snapshot of all trades, cash log, unquoted products, and snapshot history to your device.
          </p>

          <Button
            id="backup-export-json-btn"
            variant="secondary"
            size="sm"
            onClick={handleExport}
            className="w-full gap-2 text-xs bg-[#2c2c2e] hover:bg-[#3c3c3e] text-white border-white/10"
          >
            <Download className="w-3.5 h-3.5 text-[#007AFF]" />
            <span>Export Data to JSON File</span>
          </Button>
        </div>

        {/* SECTION 2: IMPORT / RESTORE */}
        <div className="p-4 rounded-xl bg-[#1c1c1e] border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-semibold text-white">2. Import / Restore Backup</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Full Replace
            </span>
          </div>

          {!validationResult ? (
            /* File Picker Zone */
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
                id="backup-file-input"
              />

              <label
                htmlFor="backup-file-input"
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/15 hover:border-purple-500/50 rounded-xl cursor-pointer bg-[#121214] hover:bg-purple-950/10 transition-all space-y-2 text-center"
              >
                <FileJson className="w-8 h-8 text-purple-400/80" />
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-white block">
                    Click to select or drag backup JSON file
                  </span>
                  <span className="text-[10px] text-[#86868b] block font-mono">
                    Accepts .json exported from Greed Island
                  </span>
                </div>
              </label>

              {isProcessing && (
                <div className="flex items-center justify-center gap-2 text-xs text-purple-400 font-mono py-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validating backup JSON file structure...</span>
                </div>
              )}
            </div>
          ) : !validationResult.valid ? (
            /* Validation Error State */
            <div className="space-y-3 p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl">
              <div className="flex items-center gap-2 text-rose-300 text-xs font-semibold">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Backup Validation Rejected</span>
              </div>

              <p className="text-[11px] text-rose-200/90 font-mono leading-relaxed">
                {validationResult.error}
              </p>

              <Button
                variant="ghost"
                size="sm"
                onClick={resetFileSelection}
                className="text-xs text-rose-300 hover:text-white"
              >
                Choose a different file
              </Button>
            </div>
          ) : (
            /* Validation Passed: Comparison & Confirmation Screen */
            <div className="space-y-4">
              {/* File Info */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#121214] border border-white/5 font-mono text-xs">
                <div className="flex items-center gap-2 text-purple-300 truncate">
                  <FileJson className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="truncate">{selectedFileName}</span>
                </div>
                <button
                  onClick={resetFileSelection}
                  className="text-[11px] text-[#86868b] hover:text-white underline shrink-0"
                >
                  Change
                </button>
              </div>

              {/* Comparison Summary Table */}
              <div className="p-3 rounded-xl bg-[#121214] border border-white/5 space-y-2">
                <span className="text-[10px] uppercase font-semibold text-[#86868b] tracking-wider block">
                  Data Change Breakdown
                </span>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-1">
                  <div className="text-left text-[#86868b] text-[11px]">Collection</div>
                  <div className="text-[#86868b] text-[11px]">Current Local</div>
                  <div className="text-purple-400 font-bold text-[11px]">Backup File</div>

                  <div className="text-left text-white">Trades</div>
                  <div className="text-[#86868b]">{currentSummary?.tradeCount ?? 0}</div>
                  <div className="text-purple-300 font-bold">
                    {validationResult.summary?.tradeCount ?? 0}
                  </div>

                  <div className="text-left text-white">Cash Entries</div>
                  <div className="text-[#86868b]">{currentSummary?.cashCount ?? 0}</div>
                  <div className="text-purple-300 font-bold">
                    {validationResult.summary?.cashCount ?? 0}
                  </div>

                  <div className="text-left text-white">Other Products</div>
                  <div className="text-[#86868b]">{currentSummary?.otherCount ?? 0}</div>
                  <div className="text-purple-300 font-bold">
                    {validationResult.summary?.otherCount ?? 0}
                  </div>

                  <div className="text-left text-white">Snapshots</div>
                  <div className="text-[#86868b]">{currentSummary?.snapshotCount ?? 0}</div>
                  <div className="text-purple-300 font-bold">
                    {validationResult.summary?.snapshotCount ?? 0}
                  </div>
                </div>
              </div>

              {/* Full-Replace Warning Banner */}
              <div className="p-3.5 bg-amber-950/50 border border-amber-500/40 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>FULL REPLACE IMPORT (NOT A MERGE)</span>
                </div>

                <p className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
                  This action will <strong className="text-amber-200">completely overwrite and replace</strong> all current data in this browser. Existing trades, cash entries, and snapshots will be permanently replaced by the backup contents.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFileSelection}
                  className="text-xs text-[#86868b] hover:text-white"
                >
                  Cancel
                </Button>

                <Button
                  id="confirm-restore-backup-btn"
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmImport}
                  disabled={isProcessing}
                  className="gap-2 text-xs bg-amber-600 hover:bg-amber-500 text-white border-none"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Confirm Overwrite & Restore</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
