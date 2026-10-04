import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { getModule } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { date, dateTime, money } from '../lib/format';
import { Badge, Button, Card, DefinitionList, Empty, ErrorBox, LinkButton, PageHeader, Spinner, StatCard, Tabs, useConfirm } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { AttachmentsPanel, AuditTrail, PaymentModal } from '../components/business';
import { fieldValue } from './ModuleList';

const DEFAULT_ATTACHMENT: Record<string, string> = {
  'research-papers': 'Research Paper',
  conferences: 'Research Paper',
  books: 'Manuscript',
  phd: 'Manuscript',
  awards: 'Certificate',
  certificates: 'Certificate',
};

export default function ModuleDetail() {
  const { moduleKey = '', id = '' } = useParams();
  const def = getModule(moduleKey);
  const { can } = useAuth();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'payments' | 'files' | 'history'>('payments');
  const [pay, setPay] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['module-record', moduleKey, id], queryFn: () => api.get(`/modules/${moduleKey}/${id}`), enabled: Boolean(def) });
  const del = useAction((reason: string) => api.del(`/modules/${moduleKey}/${id}`, { reason }), 'Deleted.');
  const restore = useAction(() => api.post(`/modules/${moduleKey}/${id}/restore`), 'Restored.');
  const setStatus = useAction((status: string) => api.put(`/modules/${moduleKey}/${id}`, { ...pickFields(data.record), status }), (r: any) => `Status changed to ${r.status}.`);

  if (!def) return <Empty title="Unknown module" />;
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  const { record: r, order, payments } = data;

  function pickFields(rec: any) {
    return Object.fromEntries(def!.fields.map((f) => [f.name, rec[f.name]]));
  }

  const idx = def.statuses.indexOf(r.status);
  const next = def.statuses.slice(idx + 1).filter((s) => s !== 'Cancelled')[0];

  return (
    <>
      <PageHeader
        back={`/m/${moduleKey}`}
        title={<span className="flex flex-wrap items-center gap-2">{r.recordNo} <Badge>{r.status}</Badge> <Badge>{r.paymentStatus}</Badge> {r.deleted && <Badge tone="red">Deleted</Badge>}</span>}
        subtitle={<span className="line-clamp-1">{r[def.titleField]}</span>}
        actions={
          <>
            {!r.deleted && r.balance > 0 && can('payments.create') && <Button variant="success" icon={<Wallet className="size-4" />} onClick={() => setPay(true)}>Record payment</Button>}
            {!r.deleted && next && can('orders.edit') && r.status !== 'Cancelled' && (
              <Button variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate(next)}>Move to “{next}”</Button>
            )}
            {!r.deleted && can('orders.edit') && <LinkButton to={`/m/${moduleKey}/${id}/edit`} icon={<Pencil className="size-4" />}>Edit</LinkButton>}
            {!r.deleted && can('orders.delete') && (
              <Button
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  const reason = await confirm({ title: `Delete ${r.recordNo}?`, message: 'Only records without payments can be deleted. Its order is deleted too and can be restored.', reason: true, danger: true, confirmLabel: 'Delete' });
                  if (reason) del.mutate(reason);
                }}
              />
            )}
            {r.deleted && can('records.restore') && <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => restore.mutate()}>Restore</Button>}
          </>
        }
      />

      {/* Workflow progress */}
      <div className="card mb-5 overflow-x-auto p-3">
        <ol className="flex min-w-max items-center gap-1">
          {def.statuses.filter((s) => s !== 'Cancelled').map((s, i) => {
            const done = r.status !== 'Cancelled' && i <= idx;
            return (
              <li key={s} className="flex items-center gap-1">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${s === r.status ? 'bg-brand-700 text-white' : done ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-500'}`}>{s}</span>
                {i < def.statuses.length - 2 && <span className={`h-px w-4 ${done ? 'bg-brand-300' : 'bg-slate-200'}`} />}
              </li>
            );
          })}
          {r.status === 'Cancelled' && <li><Badge tone="gray">Cancelled</Badge></li>}
        </ol>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={money(r.totalAmount)} tone="blue" />
        <StatCard label="Advance" value={money(r.advanceAmount)} tone="slate" />
        <StatCard label="Paid" value={money(r.paidAmount)} tone="green" />
        <StatCard label="Balance" value={money(r.balance)} tone={r.balance > 0 ? 'amber' : 'slate'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <Card title="Customer">
            <DefinitionList
              items={[
                ['Name', <Link key="c" to={`/customers/${r.customerId}`} className="text-brand-700 hover:underline">{r.customerName}</Link>],
                ['Mobile', <a key="m" href={`tel:${r.mobile}`} className="text-brand-700">{r.mobile}</a>],
                ['Email', r.email],
                ['Employee', r.employeeName],
              ]}
            />
          </Card>
          <Card title="Record">
            <DefinitionList
              items={[
                [def.idLabel, r.recordNo],
                ['Order', order ? <Link key="o" to={`/orders/${order.id}`} className="text-brand-700 hover:underline">{order.orderNo}</Link> : '—'],
                ['Date', date(r.date)],
                ['Expected', date(r.expectedDate)],
                ['Payment mode (advance)', r.paymentMode],
                ['Transaction no. (advance)', r.txnNumber],
                ['Created', `${r.createdByName}, ${dateTime(r.createdAt)}`],
                ['Remarks', r.remarks],
              ]}
            />
          </Card>
        </div>
        <div className="space-y-5 lg:col-span-2">
          <Card title={`${def.singular} details`}>
            <DefinitionList
              cols={2}
              items={def.fields
                .filter((f) => f.type !== 'authors' && f.name !== 'conferenceName')
                .map((f) => [
                  f.label,
                  f.type === 'conference' ? (
                    r.conferenceEventId ? <Link key="ev" to={`/conferences/${r.conferenceEventId}`} className="text-brand-700 hover:underline">{r.conferenceName}</Link> : r.conferenceName || '—'
                  ) : (
                    fieldValue(f, r[f.name])
                  ),
                ])}
            />
            {def.fields.some((f) => f.type === 'authors') && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-slate-500">Authors ({(r.authors ?? []).length})</p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {(r.authors ?? []).map((a: any, i: number) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-slate-500">{[a.mobile, a.email].filter(Boolean).join(' • ') || '—'}</span>
                    </li>
                  ))}
                  {!(r.authors ?? []).length && <li className="px-3 py-2 text-sm text-slate-500">No authors listed.</li>}
                </ul>
              </div>
            )}
          </Card>
          <Card bodyClass="p-3 sm:p-4">
            <Tabs value={tab} onChange={setTab} tabs={[{ key: 'payments', label: `Payments (${payments.filter((p: any) => !p.voided).length})` }, { key: 'files', label: 'Files' }, { key: 'history', label: 'History' }]} />
            {tab === 'payments' && (
              <DataTable
                rows={payments}
                rowClass={(p) => (p.voided ? 'opacity-50 line-through' : '')}
                empty={<p className="py-6 text-center text-sm text-slate-500">No payments yet.</p>}
                columns={[
                  { key: 'paymentNo', header: 'Payment', primary: true },
                  { key: 'date', header: 'Date', cell: (p) => date(p.date) },
                  { key: 'type', header: 'Type', cell: (p) => <Badge tone={p.type === 'Refund' ? 'violet' : 'green'}>{p.type}</Badge> },
                  { key: 'mode', header: 'Mode' },
                  { key: 'txnNumber', header: 'Txn No.' },
                  { key: 'amount', header: 'Amount', align: 'right', cell: (p) => money(p.type === 'Refund' ? -p.amount : p.amount) },
                ]}
              />
            )}
            {tab === 'files' && <AttachmentsPanel entityType={moduleKey} entityId={r.id} defaultCategory={DEFAULT_ATTACHMENT[moduleKey]} canUpload={!r.deleted} />}
            {tab === 'history' && (
              <div className="space-y-6">
                <AuditTrail recordId={r.id} />
                {order && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Order &amp; payment history</p>
                    <AuditTrail recordId={order.id} />
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
      {order && <PaymentModal open={pay} order={order} onClose={() => setPay(false)} />}
    </>
  );
}
