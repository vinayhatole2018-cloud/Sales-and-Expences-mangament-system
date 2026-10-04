import { useQuery } from '@tanstack/react-query';
import { MONTH_NAMES, monthRange, todayYMD } from '@pbms/shared';
import { api } from '../lib/api';
import { useListState } from '../lib/hooks';
import { money } from '../lib/format';
import { Card, ErrorBox, PageHeader, Select, Spinner, StatCard } from '../components/ui';
import { EmployeeFilter, FilterBar } from '../components/Filters';
import { ExportButtons } from '../components/ExportButtons';
import { BarList, ChartCard, COLORS, TrendChart } from '../components/Charts';
import { DataTable } from '../components/DataTable';

export default function MonthlyReport() {
  const today = todayYMD();
  const { params, set } = useListState({ year: today.slice(0, 4), month: String(Number(today.slice(5, 7))) });
  const query = { year: params.year, month: params.month, employeeId: params.employeeId };
  const { data, isLoading, error } = useQuery({ queryKey: ['monthly', query], queryFn: () => api.get('/reports/monthly', query) });
  const range = monthRange(Number(params.year), Number(params.month));
  const years = Array.from({ length: 6 }, (_, i) => String(Number(today.slice(0, 4)) - i));
  const s = data?.summary;

  return (
    <>
      <PageHeader title="Monthly report" subtitle={data?.title} actions={<ExportButtons report="monthly-sales" params={{ ...range, employeeId: params.employeeId }} />} />
      <Card bodyClass="pb-1" className="mb-4">
        <FilterBar>
          <label className="block">
            <span className="label">Month</span>
            <Select value={params.month} onChange={(e) => set({ month: e.target.value })}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="label">Year</span>
            <Select value={params.year} onChange={(e) => set({ year: e.target.value })}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </Select>
          </label>
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
        </FilterBar>
      </Card>
      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total sales" value={money(s.totalSales)} tone="blue" />
            <StatCard label="Total collection" value={money(s.totalCollection)} tone="green" />
            <StatCard label="Total expenses" value={money(s.totalExpenses)} tone="red" />
            <StatCard label="Net revenue" value={money(s.netRevenue)} tone="violet" sub={`Margin ${s.profitMargin}%`} />
            <StatCard label="Outstanding" value={money(s.pendingAmount)} tone="amber" />
            <StatCard label="Orders" value={s.orders} tone="slate" />
            <StatCard label="Customers served" value={s.customers} tone="slate" />
            <StatCard label="New customers" value={s.newCustomers} tone="slate" />
          </div>
          <ChartCard title="Daily revenue" table={{ columns: ['Day', 'Sales', 'Collection', 'Expenses'], rows: data.daily.map((p: any) => [p.label, p.sales, p.collection, p.expenses]) }}>
            <TrendChart
              data={data.daily}
              series={[
                { key: 'sales', label: 'Sales', color: COLORS.sales },
                { key: 'collection', label: 'Collection', color: COLORS.collection },
                { key: 'expenses', label: 'Expenses', color: COLORS.expenses },
              ]}
            />
          </ChartCard>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <ChartCard title="Service-wise revenue"><BarList data={data.services.map((x: any) => ({ name: x.category, value: x.sales }))} /></ChartCard>
            <ChartCard title="Employee-wise revenue"><BarList data={data.employees.map((x: any) => ({ name: x.name, value: x.sales }))} /></ChartCard>
            <ChartCard title="College-wise revenue"><BarList data={data.colleges} /></ChartCard>
            <ChartCard title="Payment-mode breakdown"><BarList data={data.paymentModes} color={COLORS.collection} /></ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Employee summary" bodyClass="p-2 sm:p-3">
              <DataTable
                rows={data.employees}
                rowKey={(r: any) => r.name}
                columns={[
                  { key: 'name', header: 'Employee', primary: true },
                  { key: 'orders', header: 'Orders', align: 'right' },
                  { key: 'sales', header: 'Sales', align: 'right', cell: (r: any) => money(r.sales) },
                  { key: 'collection', header: 'Collection', align: 'right', cell: (r: any) => money(r.collection) },
                  { key: 'pending', header: 'Pending', align: 'right', cell: (r: any) => money(r.pending) },
                ]}
              />
            </Card>
            <ChartCard title="Expenses by category"><BarList data={data.expenseCategories} color={COLORS.expenses} emptyTitle="No approved expenses" /></ChartCard>
          </div>
        </div>
      )}
    </>
  );
}
