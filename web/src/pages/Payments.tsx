import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { PAYMENT_TYPES, SERVICE_CATEGORIES } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced, useList, useListState, useSettings } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Badge, Button, Card, Checkbox, Input, Modal, PageHeader, StatCard } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';
import { PaymentModal, type PayableOrder } from '../components/business';

/** Pick an open order to record a payment against. */
export function OrderPickerModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (o: PayableOrder) => void }) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 250);
  const { data, isFetching } = useQuery({
    queryKey: ['pick-order', debounced],
    queryFn: () => api.get('/reports/pending-payments', { search: debounced, pageSize: 15, sort: 'orderDate', dir: 'desc' }),
    enabled: open,
  });
  return (
    <Modal open={open} onClose={onClose} title="Record payment — choose order" size="lg">
      <Input autoFocus placeholder="Search customer, mobile or order ID…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 divide-y divide-slate-100">
        {isFetching && !data && <li className="py-4 text-sm text-slate-500">Loading…</li>}
        {data?.items.length === 0 && <li className="py-4 text-sm text-slate-500">No open orders with a balance match your search.</li>}
        {data?.items.map((o: any) => (
          <li key={o.id}>
            <button className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50" onClick={() => onPick(o)}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{o.customerName} — {o.orderNo}</span>
                <span className="block truncate text-xs text-slate-500">{o.serviceSummary} • {o.customerMobile}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold text-amber-700">{money(o.balance)}</span>
                <span className="block text-[11px] text-slate-500">of {money(o.totalAmount)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function Payments() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: settings } = useSettings();
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'createdAt', dir: 'desc' });
  const { data, isLoading } = useList('payments', '/payments', params);
  const [picking, setPicking] = useState(false);
  const [order, setOrder] = useState<PayableOrder | null>(null);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Advances, part payments, final payments and refunds."
        actions={
          <>
            {can('reports.export') && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => api.download('/reports/collections/export', { format: 'xlsx', from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId, paymentMode: params.mode })}>
                Export
              </Button>
            )}
            {can('payments.create') && <Button variant="success" icon={<Plus className="size-4" />} onClick={() => setPicking(true)}>Record payment</Button>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Received" value={money(data?.totals?.received)} tone="green" />
        <StatCard label="Refunded" value={money(data?.totals?.refunded)} tone="violet" />
        <StatCard label="Net collection" value={money((data?.totals?.received ?? 0) - (data?.totals?.refunded ?? 0))} tone="blue" />
      </div>
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Payment / order ID, customer, txn no…" />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <FilterSelect label="Mode" value={params.mode ?? ''} onChange={(v) => set({ mode: v })} options={settings?.paymentModes ?? []} />
          <FilterSelect label="Type" value={params.type ?? ''} onChange={(v) => set({ type: v })} options={PAYMENT_TYPES} />
          <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          <div className="flex items-end pb-2">
            <Checkbox label="Show voided" checked={params.showVoided === 'true'} onChange={(v) => set({ showVoided: v ? 'true' : '' })} />
          </div>
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          onRowClick={(r) => navigate(`/orders/${r.orderId}`)}
          rowClass={(r) => (r.voided ? 'opacity-50 line-through' : '')}
          columns={[
            { key: 'paymentNo', header: 'Payment', primary: true, sortable: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.paymentNo}</p><p className="text-xs text-slate-500">{r.orderNo}</p></div> },
            { key: 'date', header: 'Date', sortable: true, cell: (r) => date(r.date) },
            { key: 'customerName', header: 'Customer', sortable: true },
            { key: 'serviceName', header: 'Service', hideOnMobile: true, cell: (r) => <span className="line-clamp-1 max-w-[180px]">{r.serviceName}</span> },
            { key: 'type', header: 'Type', cell: (r) => <Badge tone={r.type === 'Refund' ? 'violet' : r.voided ? 'gray' : 'green'}>{r.voided ? 'Voided' : r.type}</Badge> },
            { key: 'mode', header: 'Mode' },
            { key: 'txnNumber', header: 'Txn No.', hideOnMobile: true },
            { key: 'employeeName', header: 'Received by', hideOnMobile: true },
            { key: 'amount', header: 'Amount', align: 'right', sortable: true, cell: (r) => <span className="font-semibold">{money(r.type === 'Refund' ? -r.amount : r.amount)}</span> },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <OrderPickerModal open={picking} onClose={() => setPicking(false)} onPick={(o) => { setPicking(false); setOrder(o); }} />
      <PaymentModal open={Boolean(order)} order={order} onClose={() => setOrder(null)} />
    </>
  );
}
