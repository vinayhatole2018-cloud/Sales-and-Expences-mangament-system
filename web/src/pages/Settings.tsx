import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DatabaseBackup, Download, Plus, Trash2, Upload, X } from 'lucide-react';
import { NOTIFICATION_LABELS, PERMISSIONS, type Permission } from '@pbms/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { dateTime, fileSize } from '../lib/format';
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Spinner, Tabs, Textarea, useConfirm } from '../components/ui';

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setText('');
  };
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 p-2">
        {items.map((i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {i}
            <button type="button" onClick={() => onChange(items.filter((x) => x !== i))} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${i}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input className="min-w-[120px] flex-1 px-1 text-sm outline-none" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Type and press Enter" />
      </div>
    </Field>
  );
}

function BusinessTab({ s, setS }: { s: any; setS: (p: any) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let url = '';
    if (s.logoAttachmentId) api.blob(`/attachments/${s.logoAttachmentId}/download`, { inline: 1 }).then(({ blob }) => setLogo((url = URL.createObjectURL(blob)))).catch(() => setLogo(null));
    else setLogo(null);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [s.logoAttachmentId]);
  const uploadLogo = async (f: File) => {
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('entityType', 'settings');
      fd.append('entityId', 'business');
      fd.append('category', 'Logo');
      const a = await api.upload('/attachments', fd);
      setS({ logoAttachmentId: a.id });
      toast.success('Logo uploaded. Save settings to apply.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Business name" required><Input value={s.businessName} onChange={(e) => setS({ businessName: e.target.value })} /></Field>
      <Field label="Tagline"><Input value={s.tagline} onChange={(e) => setS({ tagline: e.target.value })} /></Field>
      <Field label="Logo" hint="PNG or JPG, shown on invoices and PDF reports.">
        <div className="flex items-center gap-3">
          <div className="grid size-14 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">{logo ? <img src={logo} alt="Logo" className="max-h-full max-w-full" /> : <span className="text-xs text-slate-400">None</span>}</div>
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
          <Button variant="secondary" size="sm" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>Upload</Button>
          {s.logoAttachmentId && <Button variant="ghost" size="sm" onClick={() => setS({ logoAttachmentId: '' })}>Remove</Button>}
        </div>
      </Field>
      <Field label="Phone"><Input value={s.phone} onChange={(e) => setS({ phone: e.target.value })} /></Field>
      <Field label="Email"><Input type="email" value={s.email} onChange={(e) => setS({ email: e.target.value })} /></Field>
      <Field label="Website"><Input value={s.website} onChange={(e) => setS({ website: e.target.value })} /></Field>
      <Field label="Address" className="sm:col-span-2"><Textarea value={s.address} onChange={(e) => setS({ address: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Checkbox label="GST applicable (show GSTIN and tax on invoices)" checked={s.gstEnabled} onChange={(v) => setS({ gstEnabled: v })} /></div>
      {s.gstEnabled && (
        <>
          <Field label="GSTIN"><Input value={s.gstin} onChange={(e) => setS({ gstin: e.target.value.toUpperCase() })} maxLength={15} /></Field>
          <Field label="Default tax %"><Input inputMode="decimal" value={s.defaultTaxPercent} onChange={(e) => setS({ defaultTaxPercent: e.target.value })} /></Field>
        </>
      )}
      <Field label="Invoice prefix" hint="e.g. INV → INV-2026-00001"><Input value={s.invoicePrefix} onChange={(e) => setS({ invoicePrefix: e.target.value.toUpperCase() })} maxLength={8} /></Field>
      <Field label="Order prefix" hint="e.g. ORD → ORD-2026-00001"><Input value={s.orderPrefix} onChange={(e) => setS({ orderPrefix: e.target.value.toUpperCase() })} maxLength={8} /></Field>
      <Field label="Invoice terms & conditions" className="sm:col-span-2"><Textarea rows={4} value={s.invoiceTerms} onChange={(e) => setS({ invoiceTerms: e.target.value })} /></Field>
      <Field label="Authorized signatory"><Input value={s.authorizedSignatory} onChange={(e) => setS({ authorizedSignatory: e.target.value })} /></Field>
    </div>
  );
}

function ListsTab({ s, setS }: { s: any; setS: (p: any) => void }) {
  return (
    <div className="space-y-4">
      <ListEditor label="Payment methods" items={s.paymentModes} onChange={(v) => setS({ paymentModes: v })} />
      <ListEditor label="Expense categories" items={s.expenseCategories} onChange={(v) => setS({ expenseCategories: v })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Max employee discount %" hint="Larger discounts need a manager."><Input inputMode="decimal" value={s.maxEmployeeDiscountPercent} onChange={(e) => setS({ maxEmployeeDiscountPercent: e.target.value })} /></Field>
        <div className="flex items-end pb-2"><Checkbox label="Allow payments larger than the balance (overpayment)" checked={s.allowOverpayment} onChange={(v) => setS({ allowOverpayment: v })} /></div>
      </div>
    </div>
  );
}

function NotificationsTab({ s, setS }: { s: any; setS: (p: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(NOTIFICATION_LABELS).map(([k, label]) => (
          <Checkbox key={k} label={label} checked={s.notifications?.[k] !== false} onChange={(v) => setS({ notifications: { ...s.notifications, [k]: v } })} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Deadline reminder (days before)"><Input inputMode="numeric" value={s.deadlineReminderDays} onChange={(e) => setS({ deadlineReminderDays: e.target.value })} /></Field>
        <Field label="Pending payment reminder (days without payment)"><Input inputMode="numeric" value={s.pendingPaymentReminderDays} onChange={(e) => setS({ pendingPaymentReminderDays: e.target.value })} /></Field>
      </div>
      <p className="text-xs text-slate-500">WhatsApp, SMS and email delivery can be added later through the same notification service.</p>
    </div>
  );
}

const PERMISSION_GROUPS: Record<string, Permission[]> = {};
for (const p of Object.keys(PERMISSIONS) as Permission[]) (PERMISSION_GROUPS[p.split('.')[0]] ??= []).push(p);

function RolesTab() {
  const { data: roles, isLoading } = useQuery({ queryKey: ['roles'], queryFn: () => api.get<any[]>('/roles') });
  const [edit, setEdit] = useState<any>(null);
  const confirm = useConfirm();
  const save = useAction(() => (edit.id ? api.put(`/roles/${edit.id}`, edit) : api.post('/roles', edit)), 'Role saved.');
  const del = useAction((id: string) => api.del(`/roles/${id}`), 'Role deleted.');
  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ name: '', description: '', permissions: ['dashboard.view'] })}>New role</Button></div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {roles?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-medium">{r.name} {r.system && <Badge tone="gray">Built-in</Badge>}</p>
              <p className="text-xs text-slate-500">{r.description} • {r.permissions.length} permissions • {r.userCount} users</p>
            </div>
            <div className="flex gap-2">
              {r.id !== 'super_admin' && <Button size="sm" variant="secondary" onClick={() => setEdit({ ...r })}>Edit permissions</Button>}
              {!r.system && (
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={async () => { if (await confirm({ title: `Delete role ${r.name}?`, danger: true, confirmLabel: 'Delete' })) del.mutate(r.id); }} />
              )}
            </div>
          </li>
        ))}
      </ul>
      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        size="lg"
        title={edit?.id ? `Permissions — ${edit.name}` : 'New role'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setEdit(null) })}>Save role</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role name" required><Input value={edit.name} disabled={Boolean(edit.system)} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Description"><Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            </div>
            {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
              <div key={group}>
                <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">{group}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {perms.map((p) => (
                    <Checkbox
                      key={p}
                      label={PERMISSIONS[p]}
                      checked={edit.permissions.includes(p)}
                      onChange={(v) => setEdit({ ...edit, permissions: v ? [...edit.permissions, p] : edit.permissions.filter((x: string) => x !== p) })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function BackupsTab({ s, setS }: { s: any; setS: (p: any) => void }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['backups'], queryFn: () => api.get<any[]>('/backups') });
  const [busy, setBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const create = async () => {
    setBusy(true);
    try {
      await api.download('/backups', undefined, 'POST');
      toast.success('Backup created and downloaded.');
      refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = useAction(async () => {
    const fd = new FormData();
    fd.append('file', file!);
    fd.append('confirm', confirmText);
    return api.upload('/backups/restore', fd);
  }, (r: any) => `Restored ${r.restored} records. Safety backup: ${r.safetyBackup}.`);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-end pb-2 sm:col-span-3"><Checkbox label="Daily automatic backup" checked={s.backup.enabled} onChange={(v) => setS({ backup: { ...s.backup, enabled: v } })} /></div>
        <Field label="Run after (hour, IST)"><Input inputMode="numeric" value={s.backup.hour} onChange={(e) => setS({ backup: { ...s.backup, hour: e.target.value } })} /></Field>
        <Field label="Keep last N automatic backups"><Input inputMode="numeric" value={s.backup.keep} onChange={(e) => setS({ backup: { ...s.backup, keep: e.target.value } })} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<DatabaseBackup className="size-4" />} loading={busy} onClick={create}>Back up now & download</Button>
        <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setRestoreOpen(true)}>Restore from file</Button>
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {!data?.length && <li className="p-3 text-sm text-slate-500">No backups stored yet.</li>}
          {data?.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-slate-500">{dateTime(b.createdAt)} • {fileSize(b.size)}</p>
              </div>
              <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => api.download(`/backups/${encodeURIComponent(b.name)}`)} aria-label="Download"><Download className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Restore backup"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoreOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={!file || confirmText !== 'RESTORE'} loading={restore.isPending} onClick={() => restore.mutate(undefined, { onSuccess: () => { setRestoreOpen(false); refetch(); } })}>Restore</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">Records in the backup overwrite current versions. Records created after the backup are kept. A safety backup of the current data is taken first.</p>
          <input type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Field label="Type RESTORE to confirm"><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') });
  const [s, setState] = useState<any>(null);
  useEffect(() => { if (data) setState(data); }, [data]);
  const tabs = [
    ...(can('settings.manage') ? [{ key: 'business', label: 'Business' }, { key: 'lists', label: 'Payments & expenses' }, { key: 'notifications', label: 'Notifications' }] : []),
    ...(can('roles.manage') ? [{ key: 'roles', label: 'Roles & permissions' }] : []),
    ...(can('backup.manage') ? [{ key: 'backups', label: 'Backups' }] : []),
  ] as { key: string; label: string }[];
  const [tab, setTab] = useState(tabs[0]?.key ?? 'roles');
  const save = useAction(
    () =>
      api.put('/settings', {
        ...s,
        defaultTaxPercent: Number(s.defaultTaxPercent) || 0,
        maxEmployeeDiscountPercent: Number(s.maxEmployeeDiscountPercent) || 0,
        deadlineReminderDays: Number(s.deadlineReminderDays) || 0,
        pendingPaymentReminderDays: Number(s.pendingPaymentReminderDays) || 1,
        backup: { enabled: s.backup.enabled, hour: Number(s.backup.hour) || 0, keep: Number(s.backup.keep) || 1 },
      }),
    'Settings saved.',
  );
  if (isLoading || !s) return <Spinner />;
  const setS = (p: any) => setState((x: any) => ({ ...x, ...p }));
  const savable = ['business', 'lists', 'notifications', 'backups'].includes(tab) && can('settings.manage');

  return (
    <>
      <PageHeader title="Settings" actions={savable && <Button loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>} />
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
        {tab === 'business' && <BusinessTab s={s} setS={setS} />}
        {tab === 'lists' && <ListsTab s={s} setS={setS} />}
        {tab === 'notifications' && <NotificationsTab s={s} setS={setS} />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'backups' && <BackupsTab s={s} setS={setS} />}
      </Card>
    </>
  );
}
