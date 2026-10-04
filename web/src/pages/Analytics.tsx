import { useQuery } from '@tanstack/react-query';
import { SERVICE_CATEGORIES, resolvePreset } from '@pbms/shared';
import { api } from '../lib/api';
import { useListState } from '../lib/hooks';
import { money } from '../lib/format';
import { Card, ErrorBox, PageHeader, Spinner, StatCard } from '../components/ui';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect } from '../components/Filters';
import { BarList, ChartCard, COLORS, GroupedBars, TrendChart } from '../components/Charts';
import { ExportButtons } from '../components/ExportButtons';

export default function Analytics() {
  const year = resolvePreset('this_year');
  const { params, set } = useListState({ from: year.from, to: year.to });
  const query = { from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId, category: params.category };
  const { data, isLoading, error } = useQuery({ queryKey: ['analytics', query], queryFn: () => api.get('/dashboard/analytics', query) });
  const t = data?.totals;

  return (
    <>
      <PageHeader title="Financial analytics" subtitle="Revenue − Expenses = Net Profit" actions={<ExportButtons report="profit-loss" params={query} />} />
      <Card bodyClass="pb-1" className="mb-4">
        <FilterBar>
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
        </FilterBar>
      </Card>
      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Revenue" value={money(t.sales)} tone="blue" />
            <StatCard label="Expenses" value={money(t.expenses)} tone="red" />
            <StatCard label="Net profit" value={money(t.netRevenue)} tone={t.netRevenue >= 0 ? 'green' : 'red'} />
            <StatCard label="Profit margin" value={`${t.profitMargin}%`} tone="violet" />
            <StatCard label="Cash collected" value={money(t.collection)} tone="green" sub={`Cash profit ${money(t.cashProfit)}`} />
            <StatCard label="Outstanding (all open)" value={money(t.outstanding)} tone="amber" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Revenue vs expenses" table={{ columns: ['Period', 'Revenue', 'Expenses'], rows: data.series.points.map((p: any) => [p.label, p.sales, p.expenses]) }}>
              <GroupedBars
                categoryKey="label"
                data={data.series.points}
                series={[
                  { key: 'sales', label: 'Revenue', color: COLORS.sales },
                  { key: 'expenses', label: 'Expenses', color: COLORS.expenses },
                ]}
              />
            </ChartCard>
            <ChartCard title={data.series.unit === 'day' ? 'Daily profit' : 'Monthly profit'} subtitle="Revenue − approved expenses" table={{ columns: ['Period', 'Profit'], rows: data.series.points.map((p: any) => [p.label, p.profit]) }}>
              <TrendChart data={data.series.points} series={[{ key: 'profit', label: 'Profit', color: COLORS.profit }]} />
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Service revenue" table={{ columns: ['Service', 'Revenue', 'Collected', 'Pending'], rows: data.serviceRevenue.map((s: any) => [s.category, s.sales, s.collected, s.pending]) }}>
              <BarList data={data.serviceRevenue.map((s: any) => ({ name: s.category, value: s.sales }))} />
            </ChartCard>
            <ChartCard title="Employee revenue" table={{ columns: ['Employee', 'Sales', 'Collection', 'Pending'], rows: data.employeeRevenue.map((e: any) => [e.name, e.sales, e.collection, e.pending]) }}>
              <BarList data={data.employeeRevenue.map((e: any) => ({ name: e.name, value: e.sales }))} />
            </ChartCard>
            <ChartCard title="Top colleges by revenue">
              <BarList data={data.collegeRevenue} />
            </ChartCard>
            <ChartCard title="Expenses by category">
              <BarList data={data.expenseCategories} color={COLORS.expenses} emptyTitle="No approved expenses" />
            </ChartCard>
            <ChartCard title="Collection by payment mode">
              <BarList data={data.paymentModes} color={COLORS.collection} />
            </ChartCard>
          </div>
        </div>
      )}
    </>
  );
}
