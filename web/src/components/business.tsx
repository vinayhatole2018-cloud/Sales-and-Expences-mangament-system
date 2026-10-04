import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText, History, Paperclip, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { ATTACHMENT_CATEGORIES, PAYMENT_TYPES, todayYMD } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useDebounced, useEmployeeOptions, useSettings } from '../lib/hooks';
import { dateTime, fileSize, money, timeAgo } from '../lib/format';
import { Badge, Button, Empty, Field, Input, Modal, MoneyInput, Select, Spinner, Textarea, useConfirm } from './ui';

// ---------------------------------------------------------- Customer picker ---

export interface CustomerChoice {
  customerId?: string;
  newCustomer?: { name: string; mobile: string; email: string };
  label?: string;
}

export function CustomerPicker({ value, onChange, error }: { value: CustomerChoice; onChange: (v: CustomerChoice) => void; error?: string }) {
  const [mode, setMode] = useState<'find' | 'new'>(value.newCustomer ? 'new' : 'find');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q, 250);
  const box = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useQuery({
    queryKey: ['customer-search', debounced],
    queryFn: () => api.get('/customers', { search: debounced, pageSize: 8, sort: 'name', dir: 'asc' }),
    enabled: mode === 'find' && open,
  });
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (value.customerId) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
        <span className="min-w-0 truncate text-sm font-medium text-brand-900">{value.label}</span>
        <button type="button" onClick={() => onChange({})} className="rounded p-0.5 text-brand-700 hover:bg-brand-100" aria-label="Change customer">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  if (mode === 'new') {
    const nc = value.newCustomer ?? { name: '', mobile: '', email: '' };
    const set = (patch: Partial<typeof nc>) => onChange({ newCustomer: { ...nc, ...patch } });
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600">New customer</p>
          <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => { setMode('find'); onChange({}); }}>
            Pick existing instead
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Full name *" value={nc.name} onChange={(e) => set({ name: e.target.value })} />
          <Input placeholder="Mobile *" inputMode="tel" value={nc.mobile} onChange={(e) => set({ mobile: e.target.value })} />
          <Input placeholder="Email" type="email" value={nc.email} onChange={(e) => set({ email: e.target.value })} />
        </div>
        <p className="text-[11px] text-slate-500">If this mobile number already exists, the existing customer is used.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <div className="flex gap-2">
        <Input placeholder="Search name, mobile or customer ID…" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} invalid={Boolean(error)} />
        <Button type="button" variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => { setMode('new'); onChange({ newCustomer: { name: q && !/\d/.test(q) ? q : '', mobile: /^\+?\d+$/.test(q) ? q : '', email: '' } }); }}>
          New
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {isFetching && !data && <p className="p-2 text-sm text-slate-500">Searching…</p>}
          {data?.items.length === 0 && <p className="p-2 text-sm text-slate-500">No customer found. Use “New” to add one.</p>}
          {data?.items.map((c: any) => (
            <button
              type="button"
              key={c.id}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
              onClick={() => {
                onChange({ customerId: c.id, label: `${c.name} • ${c.mobile}` });
                setOpen(false);
                setQ('');
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block truncate text-xs text-slate-500">{[c.customerNo, c.mobile, c.collegeName].filter(Boolean).join(' • ')}</span>
              </span>
              {c.balance > 0 && <Badge tone="amber">Due {money(c.balance)}</Badge>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmployeeSelect({ value, onChange, allowEmpty }: { value: string; onChange: (v: string) => void; allowEmpty?: string }) {
  const { data } = useEmployeeOptions();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {(data ?? [])
        .filter((e) => e.status === 'Active' || e.id === value)
        .map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} ({e.employeeId})
          </option>
        ))}
    </Select>
  );
}

export function PaymentModeSelect({ value, onChange, allowEmpty }: { value: string; onChange: (v: string) => void; allowEmpty?: string }) {
  const { data } = useSettings();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {(data?.paymentModes ?? []).map((m) => (
        <option key={m}>{m}</option>
      ))}
    </Select>
  );
}

// ------------------------------------------------------------ Payment modal ---

export interface PayableOrder {
  id: string;
  orderNo: string;
  customerName: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: string;
}

export function PaymentModal({ order, open, onClose, refund }: { order: PayableOrder | null; open: boolean; onClose: () => void; refund?: boolean }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayYMD());
  const [mode, setMode] = useState('');
  const [txn, setTxn] = useState('');
  const [type, setType] = useState('');
  const [remarks, setRemarks] = useState('');
  const { data: settings } = useSettings();

  useEffect(() => {
    if (open && order) {
      setAmount(String(refund ? order.paidAmount : order.balance || ''));
      setDate(todayYMD());
      setMode(settings?.paymentModes[0] ?? 'Cash');
      setTxn('');
      setType(refund ? 'Refund' : '');
      setRemarks('');
    }
  }, [open, order, refund, settings]);

  const save = useAction(
    () => api.post('/payments', { orderId: order!.id, amount: Number(amount), date, mode, txnNumber: txn, type: type || undefined, remarks }),
    (r: any) => `${refund ? 'Refund' : 'Payment'} ${r.payment.paymentNo} recorded. New balance ${money(r.order.balance)}.`,
  );
  if (!order) return null;
  const amt = Number(amount) || 0;
  const limit = refund ? order.paidAmount : order.balance;
  const over = amt > limit && !(settings?.allowOverpayment && !refund);
  const after = refund ? order.balance + amt : Math.max(order.balance - amt, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={refund ? `Record refund — ${order.orderNo}` : `Record payment — ${order.orderNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={refund ? 'danger' : 'success'}
            loading={save.isPending}
            disabled={amt <= 0 || over || !mode}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            {refund ? 'Record refund' : `Record ${money(amt)}`}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center">
        <div>
          <p className="text-[11px] uppercase text-slate-500">Total</p>
          <p className="font-semibold tabular">{money(order.totalAmount)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-slate-500">Paid</p>
          <p className="font-semibold tabular text-emerald-700">{money(order.paidAmount)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-slate-500">Balance</p>
          <p className="font-semibold tabular text-amber-700">{money(order.balance)}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" required error={over ? `Cannot exceed ${refund ? 'the amount paid' : 'the outstanding balance'} (${money(limit)}).` : undefined} hint={!over && amt > 0 ? `Balance after: ${money(after)}` : undefined}>
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        <Field label="Payment date" required>
          <Input type="date" value={date} max={todayYMD()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Payment mode" required>
          <PaymentModeSelect value={mode} onChange={setMode} />
        </Field>
        <Field label="Transaction number" hint={mode === 'Cash' ? 'Optional for cash' : 'UPI / bank reference'}>
          <Input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="e.g. 4312XXXX" />
        </Field>
        {!refund && (
          <Field label="Payment type" hint="Leave on Auto to detect advance / partial / final.">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Auto</option>
              {PAYMENT_TYPES.filter((t) => t !== 'Refund').map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Remarks" className={refund ? 'sm:col-span-2' : ''}>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- Attachments ---

export function AttachmentsPanel({ entityType, entityId, defaultCategory = 'Other', canUpload = true }: { entityType: string; entityId: string; defaultCategory?: string; canUpload?: boolean }) {
  const { can, profile } = useAuth();
  const confirm = useConfirm();
  const [category, setCategory] = useState(defaultCategory);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['attachments', entityType, entityId], queryFn: () => api.get<any[]>('/attachments', { entityType, entityId }) });

  const upload = useAction(async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    fd.append('category', category);
    return api.upload('/attachments', fd);
  }, 'File uploaded.');
  const remove = useAction((id: string) => api.del(`/attachments/${id}`), 'File removed.');

  const open = async (a: any) => {
    const { blob } = await api.blob(`/attachments/${a.id}/download`, { inline: 1 });
    setPreview({ url: URL.createObjectURL(blob), type: a.contentType, name: a.fileName });
  };

  return (
    <div>
      {canUpload && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-auto">
            {ATTACHMENT_CATEGORIES.filter((c) => c !== 'Logo' && c !== 'Profile Photo').map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f, { onSettled: () => refetch() });
              e.target.value = '';
            }}
          />
          <Button variant="secondary" size="sm" icon={<Upload className="size-3.5" />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            Upload file
          </Button>
          <span className="text-[11px] text-slate-500">PDF, images, Word, Excel • max 10 MB</span>
        </div>
      )}
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <p className="py-3 text-sm text-slate-500">No files attached.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{a.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {a.category} • {fileSize(a.size)} • {a.uploadedByName} • {timeAgo(a.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {/^(image\/|application\/pdf)/.test(a.contentType) && (
                  <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => open(a)} aria-label="Preview">
                    <Eye className="size-4" />
                  </button>
                )}
                <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => api.download(`/attachments/${a.id}/download`)} aria-label="Download">
                  <Download className="size-4" />
                </button>
                {(can('records.restore') || a.uploadedBy === profile?.id) && (
                  <button
                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove"
                    onClick={async () => {
                      if (await confirm({ title: 'Remove file?', message: `“${a.fileName}” will be hidden. It stays in storage for the audit trail.`, danger: true, confirmLabel: 'Remove' })) remove.mutate(a.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={Boolean(preview)} onClose={() => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); }} title={preview?.name ?? ''} size="xl">
        {preview && (preview.type.startsWith('image/') ? <img src={preview.url} alt={preview.name} className="mx-auto max-h-[70vh]" /> : <iframe src={preview.url} title={preview.name} className="h-[70vh] w-full rounded" />)}
      </Modal>
    </div>
  );
}

export function AttachIcon() {
  return <Paperclip className="size-4" />;
}

// -------------------------------------------------------------- Audit trail ---

const ACTION_LABEL: Record<string, string> = {
  create: 'Created', update: 'Updated', amount_change: 'Amount changed', status_change: 'Status changed', delete: 'Deleted', restore: 'Restored',
  void: 'Voided', refund: 'Refund', approve: 'Approved', reject: 'Rejected', cancel: 'Cancelled', upload: 'File', invoice_create: 'Invoice', invoice_refresh: 'Invoice',
};

export function AuditTrail({ recordId }: { recordId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['audit', recordId], queryFn: () => api.get('/audit-logs', { recordId, pageSize: 100, dir: 'desc' }) });
  if (isLoading) return <Spinner />;
  if (!data?.items.length) return <Empty title="No history yet" />;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {data.items.map((a: any) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[25px] top-1 grid size-3 place-items-center rounded-full border-2 border-white bg-brand-600" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={a.action === 'delete' || a.action === 'void' ? 'red' : a.action === 'amount_change' ? 'amber' : 'gray'}>{ACTION_LABEL[a.action] ?? a.action}</Badge>
            <span className="text-xs text-slate-500">
              {dateTime(a.at)} • {a.userName} ({a.userRole}){a.ip ? ` • ${a.ip}` : ''}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-800">{a.message}</p>
          {a.reason && <p className="mt-0.5 text-xs text-slate-600">Reason: {a.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

export function HistoryIcon() {
  return <History className="size-4" />;
}

export function ReasonField({ value, onChange, label = 'Reason for change', required }: { value: string; onChange: (v: string) => void; label?: string; required?: boolean }) {
  return (
    <Field label={label} required={required} hint="Saved in the audit log with the old and new values.">
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
