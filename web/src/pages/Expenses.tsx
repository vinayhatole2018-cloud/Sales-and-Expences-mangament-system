import { useEffect, useRef, useState } from 'react';
import { Check, Download, Paperclip, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { APPROVAL_STATUSES, todayYMD } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useList, useListState, useSettings } from '../lib/hooks';
import { date, dateTime, money } from '../lib/format';
import { Badge, Button, Card, Checkbox, Field, Input, Modal, MoneyInput, PageHeader, Select, StatCard, Textarea, useConfirm } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';
import { EmployeeSelect, PaymentModeSelect, ReasonField } from '../components/business';

function ExpenseModal({ open, onClose, expense }: { open: boolean; onClose: () => void; expense?: any }) {
  const { can, profile } = useAuth();
  const { data: settings } = useSettings();
  const [f, setF] = useState({ date: todayYMD(), category: '', description: '', amount: '', mode: '', receiptAttachmentId: '', remarks: '', employeeId: '', reason: '' });
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setFileName('');
    setF(
      expense
        ? { ...expense, amount: String(expense.amount), reason: '' }
        : { date: todayYMD(), category: settings?.expenseCategories[0] ?? '', description: '', amount: '', mode: settings?.paymentModes[0] ?? 'Cash', receiptAttachmentId: '', remarks: '', employeeId: profile?.id ?? '', reason: '' },
    );
  }, [open, expense, settings, profile]);
  const reviewed = expense && expense.approvalStatus !== 'Pending';
  const save = useAction(
    () => (expense ? api.put(`/expenses/${expense.id}`, { ...f, amount: Number(f.amount) }) : api.post('/expenses', { ...f, amount: Number(f.amount) })),
    (e: any) => (expense ? 'Expense updated.' : e.approvalStatus === 'Approved' ? `Expense ${e.expenseNo} recorded.` : `Expense ${e.expenseNo} submitted for approval.`),
  );
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entityType', 'expense');
      fd.append('entityId', expense?.id ?? '');
      fd.append('category', 'Expense Receipt');
      const a = await api.upload('/attachments', fd);
      setF((x) => ({ ...x, receiptAttachmentId: a.id }));
      setFileName(a.fileName);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? `Edit expense ${expense.expenseNo}` : 'Submit expense'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={reviewed && f.reason.trim().length < 3} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>{expense ? 'Save' : 'Submit'}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" required><Input type="date" value={f.date} max={todayYMD()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount" required><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Category" required>
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {(settings?.expenseCategories ?? []).map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Payment mode" required><PaymentModeSelect value={f.mode} onChange={(v) => setF({ ...f, mode: v })} /></Field>
        <Field label="Description" required className="sm:col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What was this for?" /></Field>
        {!expense && can('expenses.view_all') && (
          <Field label="Employee"><EmployeeSelect value={f.employeeId} onChange={(v) => setF({ ...f, employeeId: v })} /></Field>
        )}
        <Field label="Receipt / bill" hint="Photo or PDF, up to 10 MB">
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ''; }} />
          <Button type="button" variant="secondary" loading={uploading} icon={<Paperclip className="size-4" />} onClick={() => fileRef.current?.click()} className="w-full">
            {fileName || (f.receiptAttachmentId ? 'Receipt attached — replace' : 'Attach receipt')}
          </Button>
        </Field>
        <Field label="Remarks" className="sm:col-span-2"><Textarea value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
        {reviewed && <div className="sm:col-span-2"><ReasonField value={f.reason} onChange={(v) => setF({ ...f, reason: v })} required label="Reason for changing a reviewed expense" /></div>}
      </div>
    </Modal>
  );
}

export default function Expenses() {
  const { can, profile } = useAuth();
  const confirm = useConfirm();
  const { data: settings } = useSettings();
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'createdAt', dir: 'desc' });
  const { data, isLoading } = useList('expenses', '/expenses', params);
  const [modal, setModal] = useState<{ open: boolean; expense?: any }>({ open: false });

  const review = useAction(({ id, decision, remarks }: { id: string; decision: string; remarks: string }) => api.put(`/expenses/${id}/approve`, { decision, remarks }), (e: any) => `Expense ${e.expenseNo} ${e.approvalStatus.toLowerCase()}.`);
  const del = useAction(({ id, reason }: { id: string; reason: string }) => api.del(`/expenses/${id}`, { reason }), 'Expense deleted.');
  const restore = useAction((id: string) => api.post(`/expenses/${id}/restore`), 'Expense restored.');

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Submitted expenses count in reports once approved."
        actions={
          <>
            {can('reports.export') && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => api.download('/reports/expenses/export', { format: 'xlsx', from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId, status: params.status })}>
                Export
              </Button>
            )}
            {can('expenses.create') && <Button icon={<Plus className="size-4" />} onClick={() => setModal({ open: true })}>Submit expense</Button>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Approved" value={money(data?.totals?.approved)} tone="green" />
        <StatCard label="Pending approval" value={money(data?.totals?.pending)} tone="amber" to="/expenses?status=Pending" />
        <StatCard label="Rejected" value={money(data?.totals?.rejected)} tone="red" />
      </div>
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Expense ID, description…" />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <FilterSelect label="Status" value={params.status ?? ''} onChange={(v) => set({ status: v })} options={APPROVAL_STATUSES} />
          <FilterSelect label="Category" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={settings?.expenseCategories ?? []} />
          <FilterSelect label="Mode" value={params.mode ?? ''} onChange={(v) => set({ mode: v })} options={settings?.paymentModes ?? []} />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          {can('records.restore') && <div className="flex items-end pb-2"><Checkbox label="Show deleted" checked={params.includeDeleted === 'true'} onChange={(v) => set({ includeDeleted: v ? 'true' : '' })} /></div>}
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          rowClass={(r) => (r.deleted ? 'opacity-50 line-through' : '')}
          columns={[
            { key: 'expenseNo', header: 'Expense', primary: true, sortable: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.description}</p><p className="text-xs text-slate-500">{r.expenseNo} • {r.category}</p></div> },
            { key: 'date', header: 'Date', sortable: true, cell: (r) => date(r.date) },
            { key: 'employeeName', header: 'Employee', sortable: true },
            { key: 'mode', header: 'Mode', hideOnMobile: true },
            { key: 'amount', header: 'Amount', align: 'right', sortable: true, cell: (r) => <span className="font-semibold">{money(r.amount)}</span> },
            {
              key: 'approvalStatus',
              header: 'Status',
              cell: (r) => (
                <div title={r.approvedByName ? `${r.approvalStatus} by ${r.approvedByName} on ${dateTime(r.approvedAt)}${r.reviewRemarks ? ` — ${r.reviewRemarks}` : ''}` : ''}>
                  <Badge>{r.approvalStatus}</Badge>
                  {r.approvedByName && <p className="mt-0.5 text-[11px] text-slate-500">by {r.approvedByName}</p>}
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (r) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {r.receiptAttachmentId && (
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Download receipt" onClick={() => api.download(`/attachments/${r.receiptAttachmentId}/download`)}>
                      <Paperclip className="size-4" />
                    </button>
                  )}
                  {!r.deleted && r.approvalStatus === 'Pending' && can('expenses.approve') && (r.employeeId !== profile?.id || profile?.role === 'super_admin') && (
                    <>
                      <button className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50" title="Approve" onClick={() => review.mutate({ id: r.id, decision: 'Approved', remarks: '' })}>
                        <Check className="size-4" />
                      </button>
                      <button
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                        title="Reject"
                        onClick={async () => {
                          const reason = await confirm({ title: `Reject ${r.expenseNo}?`, message: `${money(r.amount)} — ${r.description}`, reason: 'Reason for rejection', danger: true, confirmLabel: 'Reject' });
                          if (reason) review.mutate({ id: r.id, decision: 'Rejected', remarks: reason });
                        }}
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  )}
                  {!r.deleted && ((r.approvalStatus === 'Pending' && (r.employeeId === profile?.id || can('expenses.approve'))) || profile?.role === 'super_admin') && (
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => setModal({ open: true, expense: r })}>
                      <Pencil className="size-4" />
                    </button>
                  )}
                  {!r.deleted && can('expenses.delete') && (
                    <button
                      className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                      onClick={async () => {
                        const reason = await confirm({ title: `Delete ${r.expenseNo}?`, message: 'The expense is removed from reports but kept in the audit trail.', reason: true, danger: true, confirmLabel: 'Delete' });
                        if (reason) del.mutate({ id: r.id, reason });
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                  {r.deleted && can('records.restore') && (
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Restore" onClick={() => restore.mutate(r.id)}>
                      <RotateCcw className="size-4" />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <ExpenseModal open={modal.open} expense={modal.expense} onClose={() => setModal({ open: false })} />
    </>
  );
}
