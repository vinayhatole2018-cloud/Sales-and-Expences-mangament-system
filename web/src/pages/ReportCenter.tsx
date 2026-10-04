import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { REPORT_TYPES, SERVICE_CATEGORIES, APPROVAL_STATUSES, TRANSACTION_TYPES, ORDER_STATUSES, resolvePreset } from '@pbms/shared';
import { api } from '../lib/api';
import { useListState, useSettings } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Card, ErrorBox, PageHeader, StatCard } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect } from '../components/Filters';
import { ExportButtons } from '../components/ExportButtons';
import { BarList, ChartCard, COLORS } from '../components/Charts';

function formatCell(kind: string | undefined, v: any) {
  if (v === null || v === undefined || v === '') return '—';
  if (kind === 'money') return money(Number(v));
  if (kind === 'date') return date(String(v));
  if (kind === 'percent') return `${Number(v).toFixed(1)}%`;
  if (kind === 'number') return new Intl.NumberFormat('en-IN').format(Number(v));
  return String(v);
}

const STATUS_OPTIONS: Record<string, readonly string[]> = {
  expenses: APPROVAL_STATUSES,
  orders: ORDER_STATUSES,
};

export default function ReportCenter() {
  const month = resolvePreset('this_month');
  const { params, set } = useListState({ report: 'monthly-sales', from: month.from, to: month.to });
  const { data: settings } = useSettings();
  const report = params.report;
  const query = { from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId, category: params.category, paymentMode: params.paymentMode, status: params.status, type: params.type };
  const { data, isLoading, error } = useQuery({ queryKey: ['report', report, query], queryFn: () => api.get(`/reports/${report}`, query) });

  const columns: Column<any>[] = (data?.columns ?? []).map((c: any, i: number) => ({
    key: c.key,
    header: c.label,
    align: c.kind === 'money' || c.kind === 'number' ? 'right' : undefined,
    primary: i === (report === 'profit-loss' ? 1 : 0),
    cell: (r: any) => <span className={r.bold ? 'font-semibold' : ''}>{formatCell(c.kind, r[c.key])}</span>,
  }));
  const chartData = data?.charts ? (Object.entries(data.charts).find(([, v]) => Array.isArray(v) && (v as any[])[0]?.name !== undefined)?.[1] as any[] | undefined) : undefined;

  return (
    <>
      <PageHeader title="Reports" subtitle="Choose a report, set the period and filters, then view or export." />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <Card bodyClass="p-2">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {REPORT_TYPES.map((r) => (
              <li key={r.key}>
                <button
                  onClick={() => set({ report: r.key })}
                  className={clsx('w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition', report === r.key ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-50')}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="min-w-0 space-y-4">
          <Card bodyClass="pb-1">
            <FilterBar>
              <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
              <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
              <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
              <FilterSelect label="Payment mode" value={params.paymentMode ?? ''} onChange={(v) => set({ paymentMode: v })} options={settings?.paymentModes ?? []} />
              {STATUS_OPTIONS[report] && <FilterSelect label="Status" value={params.status ?? ''} onChange={(v) => set({ status: v })} options={STATUS_OPTIONS[report]} />}
              {report === 'transactions' && <FilterSelect label="Type" value={params.type ?? ''} onChange={(v) => set({ type: v })} options={TRANSACTION_TYPES} />}
            </FilterBar>
          </Card>
          {error && <ErrorBox message={(error as Error).message} />}
          {data && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{data.title}</h2>
                  <p className="text-sm text-slate-500">{data.subtitle}</p>
                </div>
                <ExportButtons report={report} params={query} />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {data.summary.map((s: any) => (
                  <StatCard key={s.label} label={s.label} value={formatCell(s.kind, s.value)} tone="slate" />
                ))}
              </div>
              {chartData && chartData.length > 0 && (
                <ChartCard title="Breakdown">
                  <BarList data={chartData} color={report === 'expenses' ? COLORS.expenses : report === 'collections' ? COLORS.collection : report === 'outstanding' ? COLORS.pending : COLORS.sales} format={(n) => (report === 'orders' || report === 'customers' ? String(n) : money(n))} max={10} />
                </ChartCard>
              )}
            </>
          )}
          <Card bodyClass="p-2 sm:p-3">
            <DataTable
              rows={data?.rows?.map((r: any, i: number) => ({ ...r, __k: `${i}` }))}
              loading={isLoading}
              rowKey={(r) => r.__k}
              columns={columns}
              footer={
                data?.totalsRow ? (
                  <tr>
                    {data.columns.map((c: any) => (
                      <td key={c.key} className={`px-3 py-2.5 ${c.kind === 'money' || c.kind === 'number' ? 'text-right tabular' : ''}`}>
                        {formatCell(c.kind === 'date' ? 'text' : c.kind, data.totalsRow[c.key])}
                      </td>
                    ))}
                  </tr>
                ) : undefined
              }
            />
          </Card>
        </div>
      </div>
    </>
  );
}
