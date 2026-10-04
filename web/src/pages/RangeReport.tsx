import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SERVICE_CATEGORIES, resolvePreset } from '@pbms/shared';
import { api } from '../lib/api';
import { useListState, useSettings } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Badge, Card, ErrorBox, PageHeader, StatCard, Tabs } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect } from '../components/Filters';
import { ExportButtons } from '../components/ExportButtons';
import { ChartCard, COLORS, TrendChart } from '../components/Charts';

const TAB_REPORT = { orders: 'orders', payments: 'collections', expenses: 'expenses', customers: 'customers' } as const;

export default function RangeReport() {
  const navigate = useNavigate();
  const month = resolvePreset('this_month');
  const { data: settings } = useSettings();
  const { params, set } = useListState({ from: month.from, to: month.to });
  const [tab, setTab] = useState<keyof typeof TAB_REPORT>('orders');
  const query = { from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId, category: params.category, paymentMode: params.paymentMode };
  const { data, isLoading, error } = useQuery({ queryKey: ['range', query], queryFn: () => api.get('/reports/range', query) });
  const s = data?.summary;

  return (
    <>
      <PageHeader title="Date-wise report" subtitle={data && `${date(data.range.from)} → ${date(data.range.to)} (${data.days} days)`} actions={<ExportButtons report={TAB_REPORT[tab]} params={query} />} />
      <Card bodyClass="pb-1" className="mb-4">
        <FilterBar>
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
          <FilterSelect label="Payment mode" value={params.paymentMode ?? ''} onChange={(v) => set({ paymentMode: v })} options={settings?.paymentModes ?? []} />
        </FilterBar>
      </Card>
      {error && <ErrorBox message={(error as Error).message} />}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Sales" value={money(s?.sales)} tone="blue" />
        <StatCard label="Payments" value={money(s?.payments)} tone="green" />
        <StatCard label="Expenses" value={money(s?.expenses)} tone="red" />
        <StatCard label="Pending amount" value={money(s?.pendingAmount)} tone="amber" />
        <StatCard label="Orders" value={s?.orders ?? '—'} tone="slate" />
        <StatCard label="New customers" value={s?.customers ?? '—'} tone="slate" />
      </div>
      {data && (
        <ChartCard className="mb-4" title="Sales, payments and expenses" subtitle={data.series.unit === 'day' ? 'Per day' : 'Per month'}>
          <TrendChart
            data={data.series.points}
            series={[
              { key: 'sales', label: 'Sales', color: COLORS.sales },
              { key: 'collection', label: 'Payments', color: COLORS.collection },
              { key: 'expenses', label: 'Expenses', color: COLORS.expenses },
            ]}
          />
        </ChartCard>
      )}
      <Card bodyClass="p-3 sm:p-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'orders', label: `Orders (${data?.orders.length ?? 0})` },
            { key: 'payments', label: `Payments (${data?.payments.length ?? 0})` },
            { key: 'expenses', label: `Expenses (${data?.expenses.length ?? 0})` },
            { key: 'customers', label: `New customers (${data?.customers.length ?? 0})` },
          ]}
        />
        {tab === 'orders' && (
          <DataTable
            rows={data?.orders}
            loading={isLoading}
            onRowClick={(r) => navigate(`/orders/${r.id}`)}
            columns={[
              { key: 'orderNo', header: 'Order', primary: true, cell: (r) => <div><p className="font-medium">{r.orderNo}</p><p className="text-xs text-slate-500">{date(r.orderDate)}</p></div> },
              { key: 'customerName', header: 'Customer' },
              { key: 'serviceSummary', header: 'Service', hideOnMobile: true, cell: (r) => <span className="line-clamp-1 max-w-[200px]">{r.serviceSummary}</span> },
              { key: 'employeeName', header: 'Employee', hideOnMobile: true },
              { key: 'status', header: 'Status', cell: (r) => <Badge>{r.status}</Badge> },
              { key: 'billedAmount', header: 'Total', align: 'right', cell: (r) => money(r.billedAmount) },
              { key: 'balance', header: 'Balance', align: 'right', cell: (r) => money(r.balance) },
            ]}
          />
        )}
        {tab === 'payments' && (
          <DataTable
            rows={data?.payments}
            loading={isLoading}
            onRowClick={(r) => navigate(`/orders/${r.orderId}`)}
            columns={[
              { key: 'paymentNo', header: 'Payment', primary: true, cell: (r) => <div><p className="font-medium">{r.paymentNo}</p><p className="text-xs text-slate-500">{date(r.date)} • {r.orderNo}</p></div> },
              { key: 'customerName', header: 'Customer' },
              { key: 'type', header: 'Type', cell: (r) => <Badge tone={r.type === 'Refund' ? 'violet' : 'green'}>{r.type}</Badge> },
              { key: 'mode', header: 'Mode' },
              { key: 'amount', header: 'Amount', align: 'right', cell: (r) => money(r.type === 'Refund' ? -r.amount : r.amount) },
            ]}
          />
        )}
        {tab === 'expenses' && (
          <DataTable
            rows={data?.expenses}
            loading={isLoading}
            columns={[
              { key: 'description', header: 'Expense', primary: true, cell: (r) => <div><p className="font-medium">{r.description}</p><p className="text-xs text-slate-500">{r.expenseNo} • {date(r.date)}</p></div> },
              { key: 'category', header: 'Category' },
              { key: 'employeeName', header: 'Employee' },
              { key: 'approvalStatus', header: 'Status', cell: (r) => <Badge>{r.approvalStatus}</Badge> },
              { key: 'amount', header: 'Amount', align: 'right', cell: (r) => money(r.amount) },
            ]}
          />
        )}
        {tab === 'customers' && (
          <DataTable
            rows={data?.customers}
            loading={isLoading}
            onRowClick={(r) => navigate(`/customers/${r.id}`)}
            columns={[
              { key: 'name', header: 'Customer', primary: true, cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.customerNo} • {date(r.dateAdded)}</p></div> },
              { key: 'mobile', header: 'Mobile' },
              { key: 'collegeName', header: 'College' },
              { key: 'assignedEmployeeName', header: 'Employee' },
            ]}
          />
        )}
      </Card>
    </>
  );
}
