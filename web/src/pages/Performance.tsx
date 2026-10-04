import { useQuery } from '@tanstack/react-query';
import { SERVICE_CATEGORIES, resolvePreset } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useListState } from '../lib/hooks';
import { money } from '../lib/format';
import { Card, ErrorBox, PageHeader, StatCard } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { DateRangeFilter, FilterBar, FilterSelect } from '../components/Filters';
import { ChartCard, COLORS, GroupedBars } from '../components/Charts';
import { ExportButtons } from '../components/ExportButtons';

export default function Performance() {
  const { can } = useAuth();
  const month = resolvePreset('this_month');
  const { params, set } = useListState({ from: month.from, to: month.to, sort: 'sales', dir: 'desc' });
  const query = { from: params.from || '2000-01-01', to: params.to, category: params.category };
  const { data, isLoading, error } = useQuery({ queryKey: ['performance', query], queryFn: () => api.get('/dashboard/performance', query) });
  const all = can('performance.view_all');
  const rows = [...(data?.rows ?? [])].sort((a: any, b: any) => {
    const k = params.sort;
    const m = params.dir === 'asc' ? 1 : -1;
    return (typeof a[k] === 'number' ? a[k] - b[k] : String(a[k]).localeCompare(String(b[k]))) * m;
  });
  const me = !all ? rows[0] : null;

  return (
    <>
      <PageHeader
        title={all ? 'Employee performance' : 'My performance'}
        subtitle="Calculated from orders, payments and expenses. These figures cannot be edited."
        actions={can('reports.export') && <ExportButtons report="employee-performance" params={query} />}
      />
      <Card bodyClass="pb-1" className="mb-4">
        <FilterBar>
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
        </FilterBar>
      </Card>
      {error && <ErrorBox message={(error as Error).message} />}
      {me && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Customers added" value={me.customersAdded} tone="violet" />
          <StatCard label="Orders" value={me.orders} tone="slate" sub={`${me.completedOrders} completed • ${me.openOrders} pending`} />
          <StatCard label="Sales" value={money(me.sales)} tone="blue" sub={`Avg ${money(me.averageOrderValue)}`} />
          <StatCard label="Collection" value={money(me.collection)} tone="green" />
          <StatCard label="Pending amount" value={money(me.pendingAmount)} tone="amber" />
        </div>
      )}
      {all && rows.length > 0 && (
        <ChartCard className="mb-4" title="Sales, collection and pending by employee">
          <GroupedBars
            data={rows.map((r: any) => ({ name: r.name.split(' ')[0], sales: r.sales, collection: r.collection, pending: r.pendingAmount }))}
            series={[
              { key: 'sales', label: 'Sales', color: COLORS.sales },
              { key: 'collection', label: 'Collection', color: COLORS.collection },
              { key: 'pending', label: 'Pending', color: COLORS.pending },
            ]}
          />
        </ChartCard>
      )}
      <Card bodyClass="p-2 sm:p-3">
        <DataTable
          rows={rows}
          loading={isLoading}
          rowKey={(r: any) => r.employeeId}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          columns={[
            { key: 'name', header: 'Employee', primary: true, sortable: true, cell: (r: any) => <div><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.employeeCode}</p></div> },
            { key: 'customersAdded', header: 'Customers', align: 'right', sortable: true },
            { key: 'orders', header: 'Orders', align: 'right', sortable: true },
            { key: 'completedOrders', header: 'Completed', align: 'right', sortable: true },
            { key: 'openOrders', header: 'Pending', align: 'right', sortable: true },
            { key: 'sales', header: 'Sales', align: 'right', sortable: true, cell: (r: any) => money(r.sales) },
            { key: 'collection', header: 'Collection', align: 'right', sortable: true, cell: (r: any) => money(r.collection) },
            { key: 'pendingAmount', header: 'Pending amt', align: 'right', sortable: true, cell: (r: any) => money(r.pendingAmount) },
            { key: 'expensesSubmitted', header: 'Expenses', align: 'right', sortable: true, cell: (r: any) => `${r.expensesSubmitted} (${money(r.expenseAmount)})` },
            { key: 'averageOrderValue', header: 'Avg order', align: 'right', sortable: true, cell: (r: any) => money(r.averageOrderValue) },
            { key: 'completionRate', header: 'Completion', align: 'right', sortable: true, cell: (r: any) => `${r.completionRate}%` },
          ]}
        />
      </Card>
    </>
  );
}
