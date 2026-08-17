'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from '@/contexts/AccountContext';
import type { CashFlowRecord, CashFlowType } from '@/lib/db/schema';
import { getCashFlows, saveCashFlow, deleteCashFlow } from '@/lib/db/cash-flows';
import { signedAmount, summarizeCashFlows } from '@/lib/trading/cash-flows';
import { formatCurrency } from '@/lib/currency';
import { pnlColorClass } from '@/lib/utils/format';

const TYPES: { value: CashFlowType; label: string }[] = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'interest', label: 'Interest' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'fee', label: 'Fee' },
  { value: 'adjustment', label: 'Adjustment' },
];

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export default function CashFlowSettings() {
  const { accounts, selectedAccountId } = useAccount();
  const activeAccount = accounts.find((a) => a.accountId === selectedAccountId);
  const currency = activeAccount?.currency ?? 'USD';

  const [flows, setFlows] = useState<CashFlowRecord[]>([]);
  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState<CashFlowType>('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selectedAccountId) {
      setFlows([]);
      return;
    }
    setFlows(await getCashFlows(selectedAccountId));
  }, [selectedAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeCashFlows(flows), [flows]);

  const handleAdd = async () => {
    if (!selectedAccountId) return;
    const magnitude = parseFloat(amount);
    if (!Number.isFinite(magnitude) || magnitude === 0) {
      toast.error('Enter a non-zero amount');
      return;
    }
    setSaving(true);
    try {
      await saveCashFlow({
        id: crypto.randomUUID(),
        accountId: selectedAccountId,
        date: date.replaceAll('-', ''),
        type,
        amount: signedAmount(type, magnitude),
        currency,
        note: note.trim() || undefined,
        updatedAt: Date.now(),
      });
      setAmount('');
      setNote('');
      await load();
      toast.success('Cash flow added');
    } catch (err) {
      console.error('Failed to add cash flow:', err);
      toast.error('Failed to add cash flow');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCashFlow(id);
      await load();
    } catch (err) {
      console.error('Failed to delete cash flow:', err);
      toast.error('Failed to delete cash flow');
    }
  };

  const fmtDate = (yyyymmdd: string) =>
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

  return (
    <div className="bg-card-bg border border-card-border p-6 rounded-2xl shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
          <Banknote size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Cash Flows</h2>
          <p className="text-xs text-muted font-medium">
            Record deposits, withdrawals, interest, dividends, and fees so account
            equity and return aren&apos;t mixed with trading P&amp;L
          </p>
        </div>
      </div>

      {!activeAccount ? (
        <div className="p-3 bg-muted-bg/30 rounded-xl border border-card-border text-xs text-muted text-center">
          Select an account to record cash flows.
        </div>
      ) : (
        <>
          {/* Add form */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-background/60 border border-card-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CashFlowType)}
                className="w-full bg-background/60 border border-card-border rounded-xl px-3 py-2 text-xs text-foreground focus:border-accent outline-none"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
                Amount ({currency})
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={type === 'adjustment' ? '± amount' : 'amount'}
                className="w-full bg-background/60 border border-card-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Note</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="optional"
                className="w-full bg-background/60 border border-card-border rounded-xl px-3 py-2 text-xs text-foreground focus:border-accent outline-none"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="col-span-2 sm:col-span-1 py-2.5 px-4 bg-accent/10 border border-accent/30 hover:bg-accent/20 text-accent rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          {/* Summary */}
          {flows.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted border-t border-card-border/50 pt-3">
              <span>Net contributions: <strong className={pnlColorClass(summary.contributions)}>{formatCurrency(summary.contributions, currency)}</strong></span>
              <span>Non-trading income: <strong className={pnlColorClass(summary.nonTradingIncome)}>{formatCurrency(summary.nonTradingIncome, currency)}</strong></span>
            </div>
          )}

          {/* List */}
          {flows.length > 0 && (
            <div className="divide-y divide-card-border/40 border border-card-border rounded-xl overflow-hidden">
              {flows.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <span className="font-mono text-muted w-24 shrink-0">{fmtDate(f.date)}</span>
                  <span className="capitalize text-foreground w-24 shrink-0">{f.type}</span>
                  <span className={`font-mono tabular-nums w-28 shrink-0 ${pnlColorClass(f.amount)}`}>
                    {formatCurrency(f.amount, f.currency)}
                  </span>
                  <span className="text-muted truncate flex-1">{f.note ?? ''}</span>
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="text-muted hover:text-loss transition-colors shrink-0"
                    aria-label="Delete cash flow"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
