import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, SERVICE_CATEGORIES, TRANSACTION_TYPES, formatDateDisplay, todayYMD } from '@pbms/shared';
import { api } from '../lib/api';
import { useListState, useSettings } from '../lib/hooks';
import { money } from '../lib/format';
import { Badge, Card, ErrorBox, Input, PageHeader, StatCard } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { EmployeeFilter, FilterBar, FilterSelect } from '../components/Filters';
import { ExportButtons } from '../components/ExportButtons';

export default function DailyReport() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { params, set } = useListState({ date: todayYMD() });
  const query = { date: params.date, employeeId: params.employeeId, category: params.category, paymentMode: params.paymentMode, type: params.type };
  const { data, isLoading, error } = useQuery({ queryKey: ['daily', query], queryFn: () => api.get('/reports/daily', query) });
  const s = data?.summary;

  return (
    <>
      <PageHeader
        title="Daily transactions"
        subtitle={formatDateDisplay(params.date)}
        actions={<ExportButtons report="transactions" params={{ from: params.date, to: params.date, employeeId: params.employeeId, category: params.category, paymentMode: params.paymentMode, type: params.type }} />}
      />
      <Card bodyClass="pb-1" className="mb-4">
        <FilterBar>
          <label className="block">
            <span className="label">Date</span>
            <div className="flex items-center gap-1">
              <button className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50" onClick={() => set({ date: addDays(params.date, -1) })} aria-label="Previous day"><ChevronLeft className="size-4" /></button>
              <Input type="date" value={params.date} max={todayYMD()} onChange={(e) => set({ date: e.target.value })} />
              <button className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50 disabled:opacity-40" disabled={params.date >= todayYMD()} onClick={() => set({ date: addDays(params.date, 1) })} aria-label="Next day"><ChevronRight className="size-4" /></button>
            </div>
          </label>
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          <FilterSelect label="Service" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
          <FilterSelect label="Payment mode" value={params.paymentMode ?? ''} onChange={(v) => set({ paymentMode: v })} options={settings?.paymentModes ?? []} />
          <FilterSelect label="Transaction type" value={params.type ?? ''} onChange={(v) => set({ type: v })} options={TRANSACTION_TYPES} />
        </FilterBar>
      </Card>
      {error && <ErrorBox message={(error as Error).message} />}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Transactions" value={s?.transactions ?? '—'} tone="slate" />
        <StatCard label="Total sales" value={money(s?.totalSales)} tone="blue" />
        <StatCard label="Total collection" value={money(s?.totalCollection)} tone="green" />
        <StatCard label="Total expenses" value={money(s?.totalExpenses)} tone="red" />
        <StatCard label="Net amount" value={money(s?.netAmount)} tone="violet" sub="Collection − expenses" />
      </div>
      <Card bodyClass="p-2 sm:p-3">
        <DataTable
          rows={data?.rows}
          loading={isLoading}
          onRowClick={(r) => r.orderId && navigate(`/orders/${r.orderId}`)}
          empty={<p className="py-10 text-center text-sm text-slate-500">No transactions on this day.</p>}
          columns={[
            { key: 'txnNo', header: 'Transaction ID', primary: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.txnNo}</p><p className="text-xs text-slate-500">{r.description}</p></div> },
            { key: 'type', header: 'Type', cell: (r) => <Badge>{r.type}</Badge> },
            { key: 'customerName', header: 'Customer', cell: (r) => r.customerName || '—' },
            { key: 'serviceName', header: 'Service', hideOnMobile: true, cell: (r) => <span className="line-clamp-1 max-w-[160px]">{r.serviceName || r.category}</span> },
            { key: 'employeeName', header: 'Employee', hideOnMobile: true },
            { key: 'amount', header: 'Amount', align: 'right', cell: (r) => <span className="font-semibold">{money(r.amount)}</span> },
            { key: 'orderAdvance', header: 'Advance', align: 'right', hideOnMobile: true, cell: (r) => (r.orderId ? money(r.orderAdvance) : '—') },
            { key: 'orderPaid', header: 'Paid', align: 'right', hideOnMobile: true, cell: (r) => (r.orderId ? money(r.orderPaid) : '—') },
            { key: 'orderBalance', header: 'Balance', align: 'right', hideOnMobile: true, cell: (r) => (r.orderId ? money(r.orderBalance) : '—') },
            { key: 'paymentMode', header: 'Mode' },
            { key: 'txnNumber', header: 'Txn No.', hideOnMobile: true },
          ]}
        />
      </Card>
    </>
  );
}
