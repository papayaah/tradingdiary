'use client';

import { useRef, useState } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { clearAllData, deleteAccount, deleteAccountTrades, deleteTradesByDateRange } from '@/lib/db/trades';
import { Trash2, AlertTriangle, Calendar, RefreshCw, ShieldAlert, Download, Upload, Database } from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { downloadJournalBackup, downloadExecutionsCsv, restoreJournalBackup } from '@/lib/journal/export';
import { setCursor } from '@/lib/journal/client-sync';

export default function DataManagementSettings() {
  const { accounts, selectedAccountId, refreshAccounts, setSelectedAccountId } = useAccount();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Date range delete states
  const now = new Date();
  const firstDayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = now.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [targetAccountScope, setTargetAccountScope] = useState<string>('all');
  const [isDeletingRange, setIsDeletingRange] = useState(false);

  // General action states
  const [isDeletingAccountTrades, setIsDeletingAccountTrades] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);

  const activeAccount = accounts.find((a) => a.accountId === selectedAccountId);

  const handleDeleteDateRange = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    if (startDate > endDate) {
      toast.error('Start date must be before or equal to end date');
      return;
    }

    const confirmMsg = targetAccountScope === 'all'
      ? `Are you sure you want to delete all trade data between ${startDate} and ${endDate} across ALL accounts?`
      : `Are you sure you want to delete trade data between ${startDate} and ${endDate} for ${activeAccount?.name || 'this account'}?`;

    if (!window.confirm(confirmMsg)) return;

    setIsDeletingRange(true);
    try {
      const deletedCount = await deleteTradesByDateRange(startDate, endDate, targetAccountScope);
      await refreshAccounts(selectedAccountId ?? undefined);
      toast.success(`Deleted ${deletedCount} trades from ${startDate} to ${endDate}`);
    } catch (err) {
      console.error('Failed to delete trades by date range:', err);
      toast.error('Failed to delete trades in specified date range');
    } finally {
      setIsDeletingRange(false);
    }
  };

  const handleDeleteActiveAccountTrades = async () => {
    if (!activeAccount) return;

    if (!window.confirm(`Are you sure you want to clear all trades for "${activeAccount.name}"? The account entity will remain.`)) {
      return;
    }

    setIsDeletingAccountTrades(true);
    try {
      await deleteAccountTrades(activeAccount.accountId);
      await refreshAccounts(activeAccount.accountId);
      toast.success(`Cleared all trades for ${activeAccount.name}`);
    } catch (err) {
      console.error('Failed to clear account trades:', err);
      toast.error('Failed to clear account trades');
    } finally {
      setIsDeletingAccountTrades(false);
    }
  };

  const handleDeleteActiveAccount = async () => {
    if (!activeAccount) return;

    if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE the account "${activeAccount.name}" and all its trades? This action cannot be undone.`)) {
      return;
    }

    setIsDeletingAccount(true);
    try {
      await deleteAccount(activeAccount.accountId);
      const remaining = accounts.filter(a => a.accountId !== activeAccount.accountId);
      const nextId = remaining.length > 0 ? remaining[0].accountId : '';
      await refreshAccounts(nextId);
      if (nextId) setSelectedAccountId(nextId);
      toast.success(`Deleted account "${activeAccount.name}"`);
    } catch (err) {
      console.error('Failed to delete account:', err);
      toast.error('Failed to delete account');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      await downloadJournalBackup();
      toast.success('Backup downloaded');
    } catch (err) {
      console.error('Failed to export backup:', err);
      toast.error('Failed to export backup');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await downloadExecutionsCsv();
      toast.success('Executions CSV downloaded');
    } catch (err) {
      console.error('Failed to export CSV:', err);
      toast.error('Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsRestoring(true);
      try {
        const text = await file.text();
        const result = await restoreJournalBackup(text);
        await refreshAccounts(selectedAccountId ?? undefined);
        toast.success(`Restored ${result.transactions} trades across ${result.accounts} account(s)`);
      } catch (err) {
        console.error('Failed to restore backup:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to restore backup');
      } finally {
        setIsRestoring(false);
      }
    }
    if (restoreInputRef.current) restoreInputRef.current.value = '';
  };

  const handleConfirmClearAll = async () => {
    setIsClearingAll(true);
    try {
      // For a signed-in user, also delete server data — otherwise the next sync
      // would re-hydrate the cleared local store from the server.
      if (userId) {
        const res = await fetch('/api/journal', { method: 'DELETE' });
        if (!res.ok) throw new Error(`Server delete failed: ${res.status}`);
        setCursor(userId, 0);
      }
      await clearAllData();
      await refreshAccounts('');
      setSelectedAccountId('');
      setShowClearAllModal(false);
      toast.success(userId ? 'Cleared all local and account data' : 'Successfully cleared all application data');
    } catch (err) {
      console.error('Failed to clear all data:', err);
      toast.error('Failed to clear application data');
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <div className="bg-card-bg border border-card-border p-6 rounded-2xl shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-loss/10 flex items-center justify-center text-loss">
          <Trash2 size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Data Management & Reset</h2>
          <p className="text-xs text-muted font-medium">Manage, prune, or completely reset your imported trading data</p>
        </div>
      </div>

      {/* Backup & Export */}
      <div className="bg-muted-bg/30 border border-card-border p-5 rounded-xl space-y-4">
        <div className="flex items-center gap-2 text-foreground font-bold text-sm">
          <Database size={16} className="text-accent" />
          <span>Backup &amp; Export</span>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Download a full backup of your accounts, trades, notes, and reviews, or export
          executions as CSV. Restore re-imports a backup file into this browser
          {userId ? ' and syncs it to your account.' : '.'}
        </p>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            onClick={handleExportBackup}
            disabled={isExporting}
            className="py-2.5 px-4 bg-card-bg border border-card-border hover:border-accent/40 hover:bg-accent/10 text-foreground rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Download size={14} />
            Download Backup (JSON)
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="py-2.5 px-4 bg-card-bg border border-card-border hover:border-accent/40 hover:bg-accent/10 text-foreground rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Download size={14} />
            Export Executions (CSV)
          </button>
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={isRestoring}
            className="py-2.5 px-4 bg-card-bg border border-card-border hover:border-accent/40 hover:bg-accent/10 text-foreground rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isRestoring ? (
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            Restore from Backup
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleRestoreFile}
            className="hidden"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Date Range / Monthly Data Pruning */}
        <div className="bg-muted-bg/30 border border-card-border p-5 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-foreground font-bold text-sm">
            <Calendar size={16} className="text-accent" />
            <span>Prune Data by Date Range (e.g. Month)</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Delete a specific month or custom timeframe of trades without affecting trades outside this window.
          </p>

          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-card-bg border border-card-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-card-bg border border-card-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Scope</label>
              <select
                value={targetAccountScope}
                onChange={(e) => setTargetAccountScope(e.target.value)}
                className="w-full bg-card-bg border border-card-border rounded-xl px-3 py-2 text-xs text-foreground focus:border-accent outline-none"
              >
                <option value="all">All Accounts</option>
                {accounts.map(a => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleDeleteDateRange}
              disabled={isDeletingRange}
              className="w-full py-2.5 px-4 bg-card-bg border border-card-border hover:border-loss/40 hover:bg-loss/10 text-loss rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isDeletingRange ? (
                <div className="w-4 h-4 border-2 border-loss/30 border-t-loss rounded-full animate-spin" />
              ) : (
                <>
                  <Trash2 size={14} />
                  Delete Selected Date Range
                </>
              )}
            </button>
          </div>
        </div>

        {/* Account Specific Deletion */}
        <div className="bg-muted-bg/30 border border-card-border p-5 rounded-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-foreground font-bold text-sm">
              <RefreshCw size={16} className="text-accent" />
              <span>Account-Specific Actions</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Target active account: <strong className="text-foreground">{activeAccount ? activeAccount.name : 'None Selected'}</strong>
            </p>

            {activeAccount && (
              <div className="space-y-2.5 pt-2">
                <button
                  onClick={handleDeleteActiveAccountTrades}
                  disabled={isDeletingAccountTrades}
                  className="w-full py-2.5 px-4 bg-card-bg border border-card-border hover:border-amber-500/40 hover:bg-amber-500/10 text-amber-400 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeletingAccountTrades ? (
                    <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      Clear All Trades for &quot;{activeAccount.name}&quot;
                    </>
                  )}
                </button>

                <button
                  onClick={handleDeleteActiveAccount}
                  disabled={isDeletingAccount}
                  className="w-full py-2.5 px-4 bg-card-bg border border-card-border hover:border-loss/40 hover:bg-loss/10 text-loss rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeletingAccount ? (
                    <div className="w-4 h-4 border-2 border-loss/30 border-t-loss rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 size={14} />
                      Delete Entire Account &quot;{activeAccount.name}&quot;
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {!activeAccount && (
            <div className="p-3 bg-card-bg rounded-xl border border-card-border text-xs text-muted text-center">
              No account currently selected. Select an account in the top sidebar to enable account actions.
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone: Clear All Application Data */}
      <div className="pt-4 border-t border-card-border">
        <div className="p-5 rounded-xl bg-loss/5 border border-loss/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-loss font-bold text-sm">
              <ShieldAlert size={18} />
              <span>Reset Entire Application</span>
            </div>
            <p className="text-xs text-muted">
              Permanently wipe all accounts, imported transactions, position logs, and custom notes stored locally
              {userId ? ' and delete your synced account data on the server.' : '.'}
            </p>
          </div>
          <button
            onClick={() => setShowClearAllModal(true)}
            className="px-5 py-2.5 bg-loss text-white rounded-xl text-xs font-bold shadow-md hover:bg-loss/90 active:scale-[0.98] transition-all shrink-0"
          >
            Clear All Data
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Resetting All Data */}
      {showClearAllModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-loss">
              <div className="w-12 h-12 rounded-xl bg-loss/10 flex items-center justify-center">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Confirm App Reset</h3>
                <p className="text-xs text-muted">This action is permanent and irreversible</p>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to delete <strong>ALL accounts, trades, positions, and journal notes</strong>
              {userId ? ', both on this device and in your synced account' : ''}? This will restore your trading diary to a completely clean slate.
            </p>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowClearAllModal(false)}
                disabled={isClearingAll}
                className="px-4 py-2 border border-card-border rounded-xl bg-card-bg hover:bg-muted-bg text-foreground text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClearAll}
                disabled={isClearingAll}
                className="px-5 py-2 bg-loss text-white rounded-xl text-xs font-bold hover:bg-loss/90 transition-all flex items-center gap-2"
              >
                {isClearingAll ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Yes, Reset All Data'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
