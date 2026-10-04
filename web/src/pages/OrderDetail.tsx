import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Ban, FileText, Pencil, Printer, RotateCcw, Trash2, Undo2, Wallet } from 'lucide-react';
import { MODULES, ORDER_STATUSES, PRIORITIES, type ModuleKey } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useSettings } from '../lib/hooks';
import { date, dateTime, money } from '../lib/format';
import { Badge, Button, Card, DefinitionList, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Tabs, Textarea, useConfirm } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { AttachmentsPanel, AuditTrail, EmployeeSelect, PaymentModal, ReasonField } from '../components/business';
import { OrderItemsEditor, fromOrderItems, toPayload, type ItemRow } from '../components/OrderItemsEditor';

function EditOrderModal({ order, open, onClose }: { order: any; open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const { data: settings } = useSettings();
  const [f, setF] = useState({ status: '', priority: '', expectedDate: '', notes: '', employeeId: '' });
  const [items, setItems] = useState<ItemRow[]>([]);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) {
      setF({ status: order.status, priority: order.priority, expectedDate: order.expectedDate, notes: order.notes, employeeId: order.employeeId });
      setItems(fromOrderItems(order.items));
      setReason('');
    }
  }, [open, order]);
  const itemsChanged = JSON.stringify(toPayload(items)) !== JSON.stringify(toPayload(fromOrderItems(order.items)));
  const needsReason = itemsChanged || (f.status === 'Cancelled' && order.status !== 'Cancelled');
  const save = useAction(
    () => api.put(`/orders/${order.id}`, { ...f, items: itemsChanged ? toPayload(items) : undefined, reason }),
    'Order updated.',
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Edit ${order.orderNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={needsReason && reason.trim().length < 3} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Save changes</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Order status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Expected completion"><Input type="date" value={f.expectedDate} onChange={(e) => setF({ ...f, expectedDate: e.target.value })} /></Field>
        {can('orders.view_all') && <Field label="Assigned employee"><EmployeeSelect value={f.employeeId} onChange={(v) => setF({ ...f, employeeId: v })} /></Field>}
        <Field label="Notes" className="sm:col-span-4"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {can('orders.edit_amount') && !order.module && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">Services & amounts</p>
          <OrderItemsEditor items={items} onChange={setItems} showTax={settings?.gstEnabled} />
        </div>
      )}
      {needsReason && (
        <div className="mt-4">
          <ReasonField value={reason} onChange={setReason} required label={itemsChanged ? 'Reason for changing the amount' : 'Reason for cancelling'} />
        </div>
      )}
    </Modal>
  );
}

export default function OrderDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'payments' | 'ledger' | 'files' | 'history'>('payments');
  const [pay, setPay] = useState<'pay' | 'refund' | null>(null);
  const [edit, setEdit] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['order', id], queryFn: () => api.get(`/orders/${id}`) });

  const invoice = useAction(() => api.post(`/orders/${id}/invoice`), (inv: any) => `Invoice ${inv.invoiceNo} ready.`);
  const voidPayment = useAction(({ pid, reason }: { pid: string; reason: string }) => api.post(`/payments/${pid}/void`, { reason }), 'Payment voided.');
  const del = useAction((reason: string) => api.del(`/orders/${id}`, { reason }), 'Order deleted.');
  const restore = useAction(() => api.post(`/orders/${id}/restore`), 'Order restored.');
  const cancel = useAction((reason: string) => api.put(`/orders/${id}`, { status: 'Cancelled', reason }), 'Order cancelled.');

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  const { order: o, payments, transactions } = data;
  const mod = o.module ? MODULES[o.module as ModuleKey] : null;
  const closed = o.deleted;

  const openInvoice = () => invoice.mutate(undefined, { onSuccess: (inv: any) => navigate(`/invoices/${inv.id}`) });

  return (
    <>
      <PageHeader
        back="/orders"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.orderNo} <Badge>{o.status}</Badge> <Badge>{o.paymentStatus}</Badge> {o.deleted && <Badge tone="red">Deleted</Badge>}
          </span>
        }
        subtitle={
          <>
            <Link to={`/customers/${o.customerId}`} className="font-medium text-brand-700 hover:underline">{o.customerName}</Link> • {o.customerMobile} • {date(o.orderDate)}
            {mod && <> • <Link className="text-brand-700 hover:underline" to={`/m/${o.module}/${o.moduleRecordId}`}>{mod.singular} {o.moduleRecordNo}</Link></>}
          </>
        }
        actions={
          <>
            {!closed && o.balance > 0 && can('payments.create') && (
              <Button variant="success" icon={<Wallet className="size-4" />} onClick={() => setPay('pay')}>Record payment</Button>
            )}
            {!closed && o.status !== 'Cancelled' && (
              <Button variant="secondary" icon={<FileText className="size-4" />} loading={invoice.isPending} onClick={openInvoice}>
                {o.invoiceId ? 'Invoice' : 'Generate invoice'}
              </Button>
            )}
            {!closed && can('orders.edit') && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4"><p className="text-xs text-slate-500">Total amount</p><p className="text-xl font-semibold tabular">{money(o.totalAmount)}</p>{o.discountTotal > 0 && <p className="text-xs text-slate-500">after {money(o.discountTotal)} discount</p>}</div>
        <div className="card p-4"><p className="text-xs text-slate-500">Advance</p><p className="text-xl font-semibold tabular">{money(o.advanceAmount)}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Paid</p><p className="text-xl font-semibold tabular text-emerald-700">{money(o.paidAmount)}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">{o.refundDue > 0 ? 'Refund due' : 'Balance'}</p><p className={`text-xl font-semibold tabular ${o.balance > 0 || o.refundDue > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{money(o.refundDue > 0 ? o.refundDue : o.balance)}</p></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <Card title="Order details">
            <DefinitionList
              items={[
                ['Customer', o.customerName],
                ['College', o.collegeName],
                ['Employee', o.employeeName],
                ['Priority', <Badge key="p">{o.priority}</Badge>],
                ['Order date', date(o.orderDate)],
                ['Expected', date(o.expectedDate)],
                ['Sale ID', o.saleNo],
                ['Last payment', date(o.lastPaymentDate)],
                ['Created by', `${o.createdByName}, ${dateTime(o.createdAt)}`],
                ['Completed', o.completedAt ? dateTime(o.completedAt) : ''],
                ['Notes', o.notes],
              ]}
            />
          </Card>
          <Card title="Actions">
            <div className="flex flex-col gap-2">
              <Button variant="secondary" icon={<Printer className="size-4" />} onClick={openInvoice} disabled={closed || o.status === 'Cancelled'}>Print / download invoice</Button>
              {!closed && o.paidAmount > 0 && can('payments.create') && (
                <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => setPay('refund')}>Record refund</Button>
              )}
              {!closed && o.status !== 'Cancelled' && can('orders.edit') && (
                <Button
                  variant="secondary"
                  icon={<Ban className="size-4" />}
                  onClick={async () => {
                    const r = await confirm({ title: `Cancel ${o.orderNo}?`, message: o.paidAmount > 0 ? `The customer has paid ${money(o.paidAmount)}. The order will show as Refund Pending until you record a refund.` : 'The order is kept for the record but removed from sales totals.', reason: true, danger: true, confirmLabel: 'Cancel order' });
                    if (r) cancel.mutate(r);
                  }}
                >
                  Cancel order
                </Button>
              )}
              {!closed && can('orders.delete') && (
                <Button
                  variant="ghost"
                  className="text-red-600"
                  icon={<Trash2 className="size-4" />}
                  onClick={async () => {
                    const r = await confirm({ title: `Delete ${o.orderNo}?`, message: 'Only orders without payments can be deleted. It can be restored later.', reason: true, danger: true, confirmLabel: 'Delete' });
                    if (r) del.mutate(r);
                  }}
                >
                  Delete order
                </Button>
              )}
              {closed && can('records.restore') && <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => restore.mutate()}>Restore order</Button>}
            </div>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card title="Services" bodyClass="p-2 sm:p-3">
            <DataTable
              rows={o.items}
              rowKey={(r: any) => r.serviceName + r.description}
              columns={[
                { key: 'serviceName', header: 'Service', primary: true, cell: (r: any) => <div><p className="font-medium">{r.serviceName}</p>{r.description && <p className="text-xs text-slate-500">{r.description}</p>}</div> },
                { key: 'category', header: 'Category', hideOnMobile: true },
                { key: 'quantity', header: 'Qty', align: 'right' },
                { key: 'unitPrice', header: 'Price', align: 'right', cell: (r: any) => money(r.unitPrice) },
                { key: 'discount', header: 'Discount', align: 'right', cell: (r: any) => (r.discount ? money(r.discount) : '—') },
                ...(o.taxTotal ? [{ key: 'taxAmount', header: 'Tax', align: 'right' as const, cell: (r: any) => money(r.taxAmount) }] : []),
                { key: 'amount', header: 'Amount', align: 'right', cell: (r: any) => <span className="font-semibold">{money(r.amount)}</span> },
              ]}
            />
          </Card>

          <Card bodyClass="p-3 sm:p-4">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'payments', label: `Payments (${payments.filter((p: any) => !p.voided).length})` },
                { key: 'ledger', label: 'Transactions' },
                { key: 'files', label: 'Files' },
                { key: 'history', label: 'History' },
              ]}
            />
            {tab === 'payments' && (
              <DataTable
                rows={payments}
                rowClass={(r) => (r.voided ? 'opacity-50' : '')}
                empty={<p className="py-6 text-center text-sm text-slate-500">No payments yet.</p>}
                columns={[
                  { key: 'paymentNo', header: 'Payment', primary: true, cell: (r) => <div><p className={`font-medium ${r.voided ? 'line-through' : ''}`}>{r.paymentNo}</p>{r.voided && <p className="text-xs text-red-600">Voided: {r.voidReason}</p>}</div> },
                  { key: 'date', header: 'Date', cell: (r) => date(r.date) },
                  { key: 'type', header: 'Type', cell: (r) => <Badge tone={r.type === 'Refund' ? 'violet' : 'green'}>{r.type}</Badge> },
                  { key: 'mode', header: 'Mode' },
                  { key: 'txnNumber', header: 'Txn No.' },
                  { key: 'employeeName', header: 'Received by', hideOnMobile: true },
                  { key: 'amount', header: 'Amount', align: 'right', cell: (r) => <span className="font-semibold">{money(r.type === 'Refund' ? -r.amount : r.amount)}</span> },
                  {
                    key: 'void',
                    header: '',
                    align: 'right',
                    cell: (r) =>
                      !r.voided && can('payments.void') ? (
                        <button
                          className="text-xs font-medium text-red-600 hover:underline"
                          onClick={async () => {
                            const reason = await confirm({ title: `Void ${r.paymentNo}?`, message: `${money(r.amount)} will be removed from collections and the balance restored. The payment stays visible as voided.`, reason: true, danger: true, confirmLabel: 'Void payment' });
                            if (reason) voidPayment.mutate({ pid: r.id, reason });
                          }}
                        >
                          Void
                        </button>
                      ) : null,
                  },
                ]}
              />
            )}
            {tab === 'ledger' && (
              <DataTable
                rows={transactions}
                columns={[
                  { key: 'txnNo', header: 'Transaction', primary: true, cell: (r) => <div><p className="font-medium">{r.txnNo}</p><p className="text-xs text-slate-500">{r.description}</p></div> },
                  { key: 'date', header: 'Date', cell: (r) => date(r.date) },
                  { key: 'type', header: 'Type', cell: (r) => <Badge>{r.type}</Badge> },
                  { key: 'createdByName', header: 'By', hideOnMobile: true },
                  { key: 'amount', header: 'Amount', align: 'right', cell: (r) => money(r.amount) },
                ]}
              />
            )}
            {tab === 'files' && <AttachmentsPanel entityType="order" entityId={o.id} defaultCategory="Payment Receipt" canUpload={!closed} />}
            {tab === 'history' && <AuditTrail recordId={o.id} />}
          </Card>
        </div>
      </div>

      <EditOrderModal order={o} open={edit} onClose={() => setEdit(false)} />
      <PaymentModal open={pay !== null} refund={pay === 'refund'} order={o} onClose={() => setPay(null)} />
    </>
  );
}
