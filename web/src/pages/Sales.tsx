import { useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { PAYMENT_STATUSES, SERVICE_CATEGORIES } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useList, useListState, useSettings } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Badge, Button, Card, LinkButton, PageHeader, StatCard } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';

export default function Sales() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: settings } = useSettings();
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'createdAt', dir: 'desc' });
  const { data, isLoading } = useList('sales', '/sales', params);
  const t = data?.totals ?? {};

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="Every order creates a sale record. Amounts update automatically as payments come in."
        actions={
          <>
            {can('reports.export') && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => api.download('/reports/daily-sales/export', { format: 'xlsx', from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId, category: params.category })}>
                Export
              </Button>
            )}
            {can('orders.create') && <LinkButton to="/orders/new" variant="primary" icon={<Plus className="size-4" />}>Record sale</LinkButton>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total sales" value={money(t.total)} tone="blue" />
        <StatCard label="Discounts given" value={money(t.discount)} tone="slate" />
        <StatCard label="Paid" value={money(t.paid)} tone="green" />
        <StatCard label="Balance" value={money(t.balance)} tone="amber" />
      </div>
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Sale / order ID, customer, txn no…" />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
          <FilterSelect label="Payment status" value={params.paymentStatus ?? ''} onChange={(v) => set({ paymentStatus: v })} options={PAYMENT_STATUSES} />
          <FilterSelect label="Payment mode" value={params.paymentMode ?? ''} onChange={(v) => set({ paymentMode: v })} options={settings?.paymentModes ?? []} />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          onRowClick={(r) => navigate(`/orders/${r.orderId}`)}
          columns={[
            { key: 'saleNo', header: 'Sale', primary: true, sortable: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.saleNo}</p><p className="text-xs text-slate-500">{r.orderNo} • {date(r.date)}</p></div> },
            { key: 'customerName', header: 'Customer', sortable: true },
            { key: 'serviceName', header: 'Service', hideOnMobile: true, cell: (r) => <span className="line-clamp-1 max-w-[200px]">{r.serviceName}</span> },
            { key: 'employeeName', header: 'Employee', hideOnMobile: true },
            { key: 'quantity', header: 'Qty', align: 'right', hideOnMobile: true },
            { key: 'discount', header: 'Discount', align: 'right', hideOnMobile: true, cell: (r) => (r.discount ? money(r.discount) : '—') },
            { key: 'billedAmount', header: 'Total', align: 'right', sortable: true, cell: (r) => money(r.billedAmount) },
            { key: 'advanceAmount', header: 'Advance', align: 'right', hideOnMobile: true, cell: (r) => money(r.advanceAmount) },
            { key: 'paidAmount', header: 'Paid', align: 'right', sortable: true, cell: (r) => money(r.paidAmount) },
            { key: 'balance', header: 'Balance', align: 'right', sortable: true, cell: (r) => <span className={r.balance > 0 ? 'font-semibold text-amber-700' : 'text-slate-500'}>{money(r.balance)}</span> },
            { key: 'paymentMode', header: 'Mode', hideOnMobile: true },
            { key: 'paymentStatus', header: 'Status', hideOnMobile: true, cell: (r) => <Badge>{r.orderStatus === 'Cancelled' ? 'Cancelled' : r.paymentStatus}</Badge> },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}
