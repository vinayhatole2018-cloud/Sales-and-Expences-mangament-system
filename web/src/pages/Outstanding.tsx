import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Phone } from 'lucide-react';
import { SERVICE_CATEGORIES } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useList, useListState } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Button, Card, Input, PageHeader, Select, StatCard } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';
import { PaymentModal } from '../components/business';

const SORTS = [
  { value: 'balance:desc', label: 'Highest balance' },
  { value: 'orderDate:asc', label: 'Oldest pending' },
  { value: 'orderDate:desc', label: 'Latest order' },
  { value: 'daysPending:desc', label: 'Longest without payment' },
];

export default function Outstanding() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'balance', dir: 'desc' });
  const { data, isLoading } = useList('outstanding', '/reports/pending-payments', params);
  const [pay, setPay] = useState<any>(null);

  return (
    <>
      <PageHeader
        title="Outstanding payments"
        subtitle="Every open order with money still due."
        actions={
          can('reports.export') && (
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => api.download('/reports/outstanding/export', { format: 'pdf', from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId, category: params.category })}>
              Export PDF
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Total outstanding" value={money(data?.totals?.balance)} tone="amber" />
        <StatCard label="Orders" value={data?.totals?.orders ?? '—'} tone="slate" />
        <StatCard label="Customers" value={data?.totals?.customers ?? '—'} tone="slate" />
      </div>
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Customer, mobile, order ID…" />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <label className="block">
            <span className="label">Min balance</span>
            <Input inputMode="numeric" value={params.minAmount ?? ''} onChange={(e) => set({ minAmount: e.target.value.replace(/\D/g, '') })} placeholder="₹" />
          </label>
          <label className="block">
            <span className="label">Max balance</span>
            <Input inputMode="numeric" value={params.maxAmount ?? ''} onChange={(e) => set({ maxAmount: e.target.value.replace(/\D/g, '') })} placeholder="₹" />
          </label>
          <label className="block">
            <span className="label">Sort by</span>
            <Select value={`${params.sort}:${params.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); set({ sort, dir }); }}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </label>
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          onRowClick={(r) => navigate(`/orders/${r.id}`)}
          empty={<p className="py-10 text-center text-sm text-slate-500">No outstanding payments. Everything is collected.</p>}
          columns={[
            { key: 'customerName', header: 'Customer', primary: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.customerName}</p><p className="text-xs text-slate-500">{r.collegeName}</p></div> },
            { key: 'customerMobile', header: 'Mobile', cell: (r) => <a href={`tel:${r.customerMobile}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Phone className="size-3" />{r.customerMobile}</a> },
            { key: 'orderNo', header: 'Order', cell: (r) => <div><p>{r.orderNo}</p><p className="text-xs text-slate-500">{date(r.orderDate)}</p></div> },
            { key: 'serviceSummary', header: 'Service', hideOnMobile: true, cell: (r) => <span className="line-clamp-1 max-w-[180px]">{r.serviceSummary}</span> },
            { key: 'totalAmount', header: 'Total', align: 'right', hideOnMobile: true, cell: (r) => money(r.totalAmount) },
            { key: 'paidAmount', header: 'Paid', align: 'right', hideOnMobile: true, cell: (r) => money(r.paidAmount) },
            { key: 'balance', header: 'Balance', align: 'right', cell: (r) => <span className="font-semibold text-amber-700">{money(r.balance)}</span> },
            { key: 'lastPaymentDate', header: 'Last payment', cell: (r) => <div><p>{date(r.lastPaymentDate)}</p><p className={`text-xs ${r.daysPending > 30 ? 'font-medium text-red-600' : 'text-slate-500'}`}>{r.daysPending} days ago</p></div> },
            { key: 'employeeName', header: 'Employee', hideOnMobile: true },
            {
              key: 'action',
              header: '',
              align: 'right',
              cell: (r) => can('payments.create') && <Button size="sm" variant="success" onClick={(e) => { e.stopPropagation(); setPay(r); }}>Record payment</Button>,
            },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <PaymentModal open={Boolean(pay)} order={pay} onClose={() => setPay(null)} />
    </>
  );
}
