import { useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { ORDER_STATUSES, PAYMENT_STATUSES, PRIORITIES, SERVICE_CATEGORIES } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useList, useListState } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Badge, Button, Card, Checkbox, LinkButton, PageHeader } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';

export default function Orders() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'createdAt', dir: 'desc' });
  const { data, isLoading } = useList('orders', '/orders', params);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={data && `${data.total} orders • Total ${money(data.totals?.total ?? 0)} • Paid ${money(data.totals?.paid ?? 0)} • Balance ${money(data.totals?.balance ?? 0)}`}
        actions={
          <>
            {can('reports.export') && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => api.download('/reports/orders/export', { format: 'xlsx', from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId, category: params.category, status: params.status })}>
                Export
              </Button>
            )}
            {can('orders.create') && <LinkButton to="/orders/new" variant="primary" icon={<Plus className="size-4" />}>New order</LinkButton>}
          </>
        }
      />
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Order ID, customer, mobile…" />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <FilterSelect label="Order status" value={params.status ?? ''} onChange={(v) => set({ status: v })} options={ORDER_STATUSES} />
          <FilterSelect label="Payment" value={params.paymentStatus ?? ''} onChange={(v) => set({ paymentStatus: v })} options={PAYMENT_STATUSES} />
          <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
          <FilterSelect label="Priority" value={params.priority ?? ''} onChange={(v) => set({ priority: v })} options={PRIORITIES} />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          <div className="flex items-end gap-4 pb-2">
            <Checkbox label="Open only" checked={params.open === 'true'} onChange={(v) => set({ open: v ? 'true' : '' })} />
            {can('records.restore') && <Checkbox label="Show deleted" checked={params.includeDeleted === 'true'} onChange={(v) => set({ includeDeleted: v ? 'true' : '' })} />}
          </div>
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          onRowClick={(r) => navigate(`/orders/${r.id}`)}
          rowClass={(r) => (r.deleted ? 'opacity-50 line-through' : '')}
          columns={[
            { key: 'orderNo', header: 'Order', primary: true, sortable: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.orderNo}</p><p className="text-xs text-slate-500">{date(r.orderDate)}{r.moduleRecordNo ? ` • ${r.moduleRecordNo}` : ''}</p></div> },
            { key: 'customerName', header: 'Customer', sortable: true, cell: (r) => <div><p>{r.customerName}</p><p className="text-xs text-slate-500">{r.customerMobile}</p></div> },
            { key: 'serviceSummary', header: 'Service', hideOnMobile: true, cell: (r) => <span className="line-clamp-2 max-w-[240px]">{r.serviceSummary}</span> },
            { key: 'employeeName', header: 'Employee', sortable: true, hideOnMobile: true },
            { key: 'status', header: 'Status', sortable: true, cell: (r) => <Badge>{r.status}</Badge> },
            { key: 'totalAmount', header: 'Total', align: 'right', sortable: true, cell: (r) => money(r.totalAmount) },
            { key: 'paidAmount', header: 'Paid', align: 'right', sortable: true, hideOnMobile: true, cell: (r) => money(r.paidAmount) },
            { key: 'balance', header: 'Balance', align: 'right', sortable: true, cell: (r) => <span className={r.balance > 0 ? 'font-semibold text-amber-700' : 'text-slate-500'}>{money(r.balance)}</span> },
            { key: 'paymentStatus', header: 'Payment', hideOnMobile: true, cell: (r) => <Badge>{r.paymentStatus}</Badge> },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}
