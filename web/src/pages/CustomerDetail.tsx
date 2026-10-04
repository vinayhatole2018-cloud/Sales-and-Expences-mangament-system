import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, Pencil, Phone, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Badge, Button, Card, DefinitionList, ErrorBox, LinkButton, PageHeader, Spinner, StatCard, Tabs, useConfirm } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { AttachmentsPanel, AuditTrail, PaymentModal } from '../components/business';
import { CustomerFormModal } from './Customers';

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'orders' | 'payments' | 'services' | 'files' | 'history'>('orders');
  const [edit, setEdit] = useState(false);
  const [payFor, setPayFor] = useState<any>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['customer', id], queryFn: () => api.get(`/customers/${id}`) });
  const del = useAction((reason: string) => api.del(`/customers/${id}`, { reason }), 'Customer deleted.');
  const restore = useAction(() => api.post(`/customers/${id}/restore`), 'Customer restored.');

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  const { customer: c, orders, payments, services, summary } = data;

  return (
    <>
      <PageHeader
        back="/customers"
        title={<span className="flex items-center gap-2">{c.name} {c.deleted && <Badge tone="red">Deleted</Badge>}</span>}
        subtitle={`${c.customerNo} • ${c.customerType}${c.collegeName ? ` • ${c.collegeName}` : ''}`}
        actions={
          <>
            {c.deleted && can('records.restore') && <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => restore.mutate()}>Restore</Button>}
            {!c.deleted && can('customers.delete') && (
              <Button
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  const reason = await confirm({ title: 'Delete customer?', message: 'The customer is hidden from lists. Orders and payments stay in reports.', danger: true, reason: true, confirmLabel: 'Delete' });
                  if (reason) del.mutate(reason);
                }}
              >
                Delete
              </Button>
            )}
            {!c.deleted && can('customers.edit') && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>}
            {!c.deleted && can('orders.create') && <LinkButton variant="primary" to={`/orders/new?customerId=${c.id}&label=${encodeURIComponent(`${c.name} • ${c.mobile}`)}`} icon={<Plus className="size-4" />}>New order</LinkButton>}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total billed" value={money(summary.totalBilled)} tone="blue" />
        <StatCard label="Total paid" value={money(summary.totalPaid)} tone="green" />
        <StatCard label="Outstanding balance" value={money(summary.balance)} tone={summary.balance > 0 ? 'amber' : 'slate'} />
        <StatCard label="Orders" value={summary.orderCount} tone="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Customer information" className="lg:col-span-1">
          <div className="mb-4 flex flex-wrap gap-2">
            <a href={`tel:${c.mobile}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700"><Phone className="size-4" /> {c.mobile}</a>
            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"><Mail className="size-4" /> Email</a>}
          </div>
          <DefinitionList
            cols={2}
            items={[
              ['Alternate mobile', c.altMobile],
              ['Email', c.email],
              ['Department', c.department],
              ['Designation', c.designation],
              ['City', c.city],
              ['State', c.state],
              ['Address', c.address],
              ['Assigned employee', c.assignedEmployeeName],
              ['Date added', date(c.dateAdded)],
              ['Status', <Badge key="s">{c.status}</Badge>],
              ['Added by', c.createdByName],
              ['Notes', c.notes],
            ]}
          />
        </Card>

        <Card className="lg:col-span-2" bodyClass="p-3 sm:p-4">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'orders', label: `Orders (${orders.length})` },
              { key: 'payments', label: `Payments (${payments.length})` },
              { key: 'services', label: 'Services purchased' },
              { key: 'files', label: 'Documents' },
              { key: 'history', label: 'History' },
            ]}
          />
          {tab === 'orders' && (
            <DataTable
              rows={orders}
              onRowClick={(r) => navigate(`/orders/${r.id}`)}
              columns={[
                { key: 'orderNo', header: 'Order', primary: true, cell: (r) => <div><p className="font-medium">{r.orderNo}</p><p className="text-xs text-slate-500">{r.serviceSummary}</p></div> },
                { key: 'orderDate', header: 'Date', cell: (r) => date(r.orderDate) },
                { key: 'status', header: 'Status', cell: (r) => <Badge>{r.status}</Badge> },
                { key: 'totalAmount', header: 'Total', align: 'right', cell: (r) => money(r.totalAmount) },
                { key: 'balance', header: 'Balance', align: 'right', cell: (r) => <span className={r.balance > 0 ? 'font-medium text-amber-700' : ''}>{money(r.balance)}</span> },
                {
                  key: 'pay',
                  header: '',
                  align: 'right',
                  cell: (r) =>
                    r.balance > 0 && can('payments.create') ? (
                      <Button size="sm" variant="success" onClick={(e) => { e.stopPropagation(); setPayFor(r); }}>Record payment</Button>
                    ) : null,
                },
              ]}
            />
          )}
          {tab === 'payments' && (
            <DataTable
              rows={payments}
              rowClass={(r) => (r.voided ? 'opacity-50 line-through' : '')}
              onRowClick={(r) => navigate(`/orders/${r.orderId}`)}
              columns={[
                { key: 'paymentNo', header: 'Payment', primary: true, cell: (r) => <div><p className="font-medium">{r.paymentNo}</p><p className="text-xs text-slate-500">{r.orderNo}</p></div> },
                { key: 'date', header: 'Date', cell: (r) => date(r.date) },
                { key: 'type', header: 'Type', cell: (r) => <Badge tone={r.type === 'Refund' ? 'violet' : 'green'}>{r.type}</Badge> },
                { key: 'mode', header: 'Mode' },
                { key: 'txnNumber', header: 'Txn No.', hideOnMobile: true },
                { key: 'amount', header: 'Amount', align: 'right', cell: (r) => money(r.type === 'Refund' ? -r.amount : r.amount) },
              ]}
            />
          )}
          {tab === 'services' && (
            <DataTable
              rows={services}
              rowKey={(r) => r.name}
              columns={[
                { key: 'name', header: 'Service', primary: true },
                { key: 'count', header: 'Quantity', align: 'right' },
                { key: 'amount', header: 'Amount', align: 'right', cell: (r) => money(r.amount) },
              ]}
            />
          )}
          {tab === 'files' && <AttachmentsPanel entityType="customer" entityId={c.id} defaultCategory="Customer Document" canUpload={!c.deleted} />}
          {tab === 'history' && <AuditTrail recordId={c.id} />}
        </Card>
      </div>

      <CustomerFormModal open={edit} onClose={() => setEdit(false)} customer={c} />
      <PaymentModal open={Boolean(payFor)} order={payFor} onClose={() => setPayFor(null)} />
    </>
  );
}
