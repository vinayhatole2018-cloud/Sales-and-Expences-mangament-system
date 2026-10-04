import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, ArrowRight, CalendarClock, CheckCircle2, IndianRupee, Plus, Receipt, ShoppingCart, TrendingUp, UserPlus, Users, Wallet, XCircle } from 'lucide-react';
import { SERVICE_CATEGORIES, formatDateDisplay, resolvePreset } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useListState } from '../lib/hooks';
import { date, money, money0 } from '../lib/format';
import { Badge, Card, ErrorBox, LinkButton, PageHeader, Spinner, StatCard } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect } from '../components/Filters';
import { BarList, ChartCard, COLORS, GroupedBars, TrendChart } from '../components/Charts';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { profile, can } = useAuth();
  const navigate = useNavigate();
  const month = resolvePreset('this_month');
  const { params, set } = useListState({ from: month.from, to: month.to });
  const { data: d, isLoading, error } = useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => api.get('/dashboard', params),
    refetchInterval: 120_000,
  });
  const own = d?.scope === 'own';

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${profile?.name?.split(' ')[0]}`}
        subtitle={own ? 'Your work at a glance' : `Business at a glance • ${formatDateDisplay(d?.today.date)}`}
        actions={
          can('orders.create') && (
            <>
              <LinkButton to="/customers?new=1" icon={<UserPlus className="size-4" />}>Customer</LinkButton>
              <LinkButton to="/orders/new" variant="primary" icon={<Plus className="size-4" />}>New order</LinkButton>
            </>
          )
        }
      />

      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading || !d ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          {/* ---- Today ---- */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Today</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <StatCard label="Today's sales" value={money0(d.today.sales)} icon={<TrendingUp className="size-4" />} tone="blue" to="/reports/daily" />
              <StatCard label="Today's collection" value={money0(d.today.payments)} icon={<Wallet className="size-4" />} tone="green" to="/payments" />
              <StatCard label="Today's expenses" value={money0(d.today.expenses)} icon={<Receipt className="size-4" />} tone="red" to="/expenses" />
              <StatCard label="New customers" value={d.today.newCustomers} icon={<UserPlus className="size-4" />} tone="violet" to="/customers" />
              <StatCard label="Orders today" value={d.today.orders} icon={<ShoppingCart className="size-4" />} tone="slate" to="/orders" />
            </div>
          </section>

          {/* ---- Attention strip ---- */}
          <div className="grid gap-3 md:grid-cols-3">
            <Link to="/outstanding" className="card flex items-center justify-between gap-3 border-amber-200 bg-amber-50/60 p-4 hover:border-amber-300">
              <div className="flex items-center gap-3">
                <AlarmClock className="size-5 text-amber-700" />
                <div>
                  <p className="text-xs font-medium text-amber-800">Outstanding payments</p>
                  <p className="text-lg font-semibold text-amber-900">{money0(d.overview.pendingAmount)}</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-amber-700" />
            </Link>
            <Link to="/orders?open=true" className="card flex items-center justify-between gap-3 p-4 hover:border-slate-300">
              <div className="flex items-center gap-3">
                <CalendarClock className="size-5 text-blue-700" />
                <div>
                  <p className="text-xs font-medium text-slate-600">Due in next 3 days / overdue</p>
                  <p className="text-lg font-semibold">{d.dueSoon.length} orders</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-slate-400" />
            </Link>
            {can('expenses.approve') ? (
              <Link to="/expenses?status=Pending" className="card flex items-center justify-between gap-3 p-4 hover:border-slate-300">
                <div className="flex items-center gap-3">
                  <Receipt className="size-5 text-red-600" />
                  <div>
                    <p className="text-xs font-medium text-slate-600">Expenses awaiting approval</p>
                    <p className="text-lg font-semibold">
                      {d.pendingExpenses.count} <span className="text-sm font-normal text-slate-500">({money0(d.pendingExpenses.amount)})</span>
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-slate-400" />
              </Link>
            ) : (
              <StatCard label="This month's orders" value={d.month.orders} icon={<ShoppingCart className="size-4" />} tone="slate" />
            )}
          </div>

          {/* ---- Filters ---- */}
          <Card bodyClass="pb-1">
            <FilterBar>
              <DateRangeFilter from={params.from} to={params.to} onChange={(r) => set(r)} />
              <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
              <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
            </FilterBar>
          </Card>

          {/* ---- Period overview ---- */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {own ? 'My business' : 'Business overview'} • {date(d.range.from)} – {date(d.range.to)}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Total sales" value={money0(d.overview.totalSales)} icon={<TrendingUp className="size-4" />} tone="blue" sub={`Avg order ${money0(d.overview.averageOrderValue)}`} />
              <StatCard label="Collection" value={money0(d.overview.totalCollection)} icon={<Wallet className="size-4" />} tone="green" sub={`Advances ${money0(d.overview.advanceReceived)}`} />
              <StatCard label="Expenses" value={money0(d.overview.totalExpenses)} icon={<Receipt className="size-4" />} tone="red" />
              <StatCard label="Net revenue" value={money0(d.overview.netRevenue)} icon={<IndianRupee className="size-4" />} tone="violet" sub={`Margin ${d.overview.profitMargin}%`} />
              <StatCard label="Pending (period)" value={money0(d.overview.periodPending)} icon={<AlarmClock className="size-4" />} tone="amber" />
              <StatCard label="Customers added" value={d.overview.totalCustomers} icon={<Users className="size-4" />} tone="slate" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Total orders" value={d.overview.totalOrders} icon={<ShoppingCart className="size-4" />} tone="slate" to="/orders" />
              <StatCard label="Completed" value={d.overview.completedOrders} icon={<CheckCircle2 className="size-4" />} tone="green" to="/orders?status=Completed" />
              <StatCard label="Pending" value={d.overview.pendingOrders} icon={<CalendarClock className="size-4" />} tone="amber" to="/orders?open=true" />
              <StatCard label="Cancelled" value={d.overview.cancelledOrders} icon={<XCircle className="size-4" />} tone="red" to="/orders?status=Cancelled" />
            </div>
          </section>

          {/* ---- This month ---- */}
          <Card title={`This month (${date(d.month.from)} – ${date(d.month.to)})`}>
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Revenue', money0(d.month.revenue), 'text-slate-900'],
                ['Collection', money0(d.month.collection), 'text-emerald-700'],
                ['Expenses', money0(d.month.expenses), 'text-red-700'],
                ['Profit', money0(d.month.profit), d.month.profit >= 0 ? 'text-emerald-700' : 'text-red-700'],
                ['Orders', d.month.orders, 'text-slate-900'],
                ['Pending', money0(d.month.pending), 'text-amber-700'],
              ].map(([k, v, cls]) => (
                <div key={k as string}>
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className={`text-lg font-semibold tabular ${cls}`}>{v}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* ---- Charts ---- */}
          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              className="xl:col-span-2"
              title="Sales, collection and expenses"
              subtitle={d.series.unit === 'day' ? 'Per day' : 'Per month'}
              table={{ columns: ['Period', 'Sales', 'Collection', 'Expenses'], rows: d.series.points.map((p: any) => [p.label, p.sales, p.collection, p.expenses]) }}
            >
              <TrendChart
                data={d.series.points}
                series={[
                  { key: 'sales', label: 'Sales', color: COLORS.sales },
                  { key: 'collection', label: 'Collection', color: COLORS.collection },
                  { key: 'expenses', label: 'Expenses', color: COLORS.expenses },
                ]}
              />
            </ChartCard>
            <ChartCard title="Service-wise sales" table={{ columns: ['Service', 'Orders', 'Sales', 'Collected', 'Pending'], rows: d.serviceSales.map((s: any) => [s.category, String(s.orders), s.sales, s.collected, s.pending]) }}>
              <BarList data={d.serviceSales.map((s: any) => ({ name: s.category, value: s.sales, hint: `${s.orders} orders` }))} color={COLORS.sales} />
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {!own && (
              <ChartCard className="xl:col-span-2" title="Employee-wise sales and collection" table={{ columns: ['Employee', 'Sales', 'Collection', 'Pending'], rows: d.employeePerformance.map((e: any) => [e.name, e.sales, e.collection, e.pendingAmount]) }}>
                <GroupedBars
                  data={d.employeePerformance.filter((e: any) => e.sales || e.collection).map((e: any) => ({ name: e.name.split(' ')[0], sales: e.sales, collection: e.collection }))}
                  series={[
                    { key: 'sales', label: 'Sales', color: COLORS.sales },
                    { key: 'collection', label: 'Collection', color: COLORS.collection },
                  ]}
                />
              </ChartCard>
            )}
            <ChartCard title="Payment collection by mode" table={{ columns: ['Mode', 'Amount'], rows: d.paymentModes.map((m: any) => [m.name, m.value]) }}>
              <BarList data={d.paymentModes} color={COLORS.collection} />
            </ChartCard>
            <ChartCard title="Pending balances by employee" subtitle="All open orders" table={{ columns: ['Employee', 'Pending'], rows: d.pendingByEmployee.map((m: any) => [m.name, m.value]) }}>
              <BarList data={d.pendingByEmployee} color={COLORS.pending} emptyTitle="Nothing outstanding" />
            </ChartCard>
            <ChartCard title="Pending balances by service" subtitle="All open orders" table={{ columns: ['Service', 'Pending'], rows: d.pendingByService.map((m: any) => [m.name, m.value]) }}>
              <BarList data={d.pendingByService} color={COLORS.pending} emptyTitle="Nothing outstanding" />
            </ChartCard>
            <ChartCard title="Expenses by category" table={{ columns: ['Category', 'Amount'], rows: d.expenseCategories.map((m: any) => [m.name, m.value]) }}>
              <BarList data={d.expenseCategories} color={COLORS.expenses} emptyTitle="No approved expenses" />
            </ChartCard>
          </div>

          {/* ---- Tables ---- */}
          <Card title={own ? 'My performance' : 'Employee performance'} actions={<LinkButton to="/performance" className="!px-2.5 !py-1.5 !text-xs">Details</LinkButton>} bodyClass="p-2 sm:p-3">
            <DataTable
              rows={d.employeePerformance}
              rowKey={(r: any) => r.employeeId}
              columns={[
                { key: 'name', header: 'Employee', primary: true, cell: (r: any) => <span className="font-medium text-slate-900">{r.name}</span> },
                { key: 'customersAdded', header: 'Customers', align: 'right' },
                { key: 'orders', header: 'Orders', align: 'right' },
                { key: 'sales', header: 'Total sales', align: 'right', cell: (r: any) => money(r.sales) },
                { key: 'collection', header: 'Collection', align: 'right', cell: (r: any) => money(r.collection) },
                { key: 'pendingAmount', header: 'Pending', align: 'right', cell: (r: any) => <span className={r.pendingAmount > 0 ? 'text-amber-700' : ''}>{money(r.pendingAmount)}</span> },
              ]}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Largest outstanding balances" actions={<LinkButton to="/outstanding" className="!px-2.5 !py-1.5 !text-xs">View all</LinkButton>} bodyClass="p-2 sm:p-3">
              <DataTable
                rows={d.topOutstanding}
                onRowClick={(r: any) => navigate(`/orders/${r.id}`)}
                empty={<p className="p-4 text-sm text-slate-500">Nothing outstanding. 🎉</p>}
                columns={[
                  { key: 'customerName', header: 'Customer', primary: true, cell: (r: any) => <div><p className="font-medium text-slate-900">{r.customerName}</p><p className="text-xs text-slate-500">{r.orderNo} • {r.customerMobile}</p></div> },
                  { key: 'employeeName', header: 'Employee', hideOnMobile: true },
                  { key: 'balance', header: 'Balance', align: 'right', cell: (r: any) => <span className="font-semibold text-amber-700">{money(r.balance)}</span> },
                ]}
              />
            </Card>
            <Card title="Due soon & overdue" bodyClass="p-2 sm:p-3">
              <DataTable
                rows={d.dueSoon}
                onRowClick={(r: any) => navigate(`/orders/${r.id}`)}
                empty={<p className="p-4 text-sm text-slate-500">No deadlines in the next 3 days.</p>}
                columns={[
                  { key: 'orderNo', header: 'Order', primary: true, cell: (r: any) => <div><p className="font-medium text-slate-900">{r.orderNo} — {r.customerName}</p><p className="truncate text-xs text-slate-500">{r.serviceSummary}</p></div> },
                  { key: 'expectedDate', header: 'Due', cell: (r: any) => <span className={r.expectedDate < d.today.date ? 'font-medium text-red-600' : ''}>{date(r.expectedDate)}</span> },
                  { key: 'status', header: 'Status', cell: (r: any) => <Badge>{r.status}</Badge> },
                ]}
              />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
