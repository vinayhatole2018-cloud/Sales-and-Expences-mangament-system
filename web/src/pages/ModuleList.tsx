import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { getModule, PAYMENT_STATUSES, type FieldDef } from '@pbms/shared';
import { useAuth } from '../lib/auth';
import { useList, useListState } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Badge, Card, Checkbox, Empty, LinkButton, PageHeader } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';

export function fieldValue(f: FieldDef | undefined, v: any) {
  if (!f) return v ?? '—';
  if (f.type === 'money') return money(v);
  if (f.type === 'checkbox') return v ? 'Yes' : 'No';
  if (f.type === 'date') return date(v);
  if (f.type === 'authors') return (v ?? []).map((a: any) => a.name).join(', ') || '—';
  return v === '' || v === undefined || v === null ? '—' : String(v);
}

export default function ModuleList() {
  const { moduleKey = '' } = useParams();
  const def = getModule(moduleKey);
  const navigate = useNavigate();
  const { can } = useAuth();
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'createdAt', dir: 'desc' });
  const { data, isLoading } = useList(`module-${moduleKey}`, `/modules/${moduleKey}`, params, Boolean(def));
  if (!def) return <Empty title="Unknown module" />;
  const fieldsByName = Object.fromEntries(def.fields.map((f) => [f.name, f]));
  const counts = (data?.statusCounts ?? {}) as Record<string, number>;

  return (
    <>
      <PageHeader
        title={def.label}
        subtitle={data && `${data.total} records • Total ${money(data.totals?.total ?? 0)} • Balance ${money(data.totals?.balance ?? 0)}`}
        actions={can('orders.create') && <LinkButton to={`/m/${moduleKey}/new`} variant="primary" icon={<Plus className="size-4" />}>New {def.singular.toLowerCase()}</LinkButton>}
      />
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => set({ status: '' })} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${!params.status ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200'}`}>
          All
        </button>
        {def.statuses.map((s) => (
          <button key={s} onClick={() => set({ status: s })} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${params.status === s ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200'}`}>
            {s} {counts[s] ? <span className="ml-1 opacity-70">{counts[s]}</span> : null}
          </button>
        ))}
      </div>
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder={`${def.idLabel}, customer, mobile, title…`} />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          {moduleKey === 'research-papers' && <FilterSelect label="Paper type" value={params.paperType ?? ''} onChange={(v) => set({ paperType: v })} options={fieldsByName.paperType.options ?? []} />}
          <FilterSelect label="Payment" value={params.paymentStatus ?? ''} onChange={(v) => set({ paymentStatus: v })} options={PAYMENT_STATUSES} />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          {can('records.restore') && <div className="flex items-end pb-2"><Checkbox label="Show deleted" checked={params.includeDeleted === 'true'} onChange={(v) => set({ includeDeleted: v ? 'true' : '' })} /></div>}
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          onRowClick={(r) => navigate(`/m/${moduleKey}/${r.id}`)}
          rowClass={(r) => (r.deleted ? 'opacity-50 line-through' : '')}
          columns={[
            {
              key: def.titleField,
              header: def.singular,
              primary: true,
              sortable: true,
              cell: (r) => (
                <div className="max-w-[320px]">
                  <p className="line-clamp-2 font-medium text-slate-900">{r[def.titleField]}</p>
                  <p className="text-xs text-slate-500">{r.recordNo} • {date(r.date)}</p>
                </div>
              ),
            },
            { key: 'customerName', header: 'Customer', sortable: true, cell: (r) => <div><p>{r.customerName}</p><p className="text-xs text-slate-500">{r.mobile}</p></div> },
            ...def.listColumns
              .filter((c) => c !== def.titleField)
              .map((c) => ({ key: c, header: fieldsByName[c]?.label ?? c, hideOnMobile: true, cell: (r: any) => <span className="line-clamp-1 max-w-[180px]">{fieldValue(fieldsByName[c], r[c])}</span> })),
            { key: 'employeeName', header: 'Employee', hideOnMobile: true },
            { key: 'status', header: 'Status', sortable: true, cell: (r) => <Badge>{r.status}</Badge> },
            { key: 'totalAmount', header: 'Total', align: 'right', sortable: true, cell: (r) => money(r.totalAmount) },
            { key: 'balance', header: 'Balance', align: 'right', sortable: true, cell: (r) => <span className={r.balance > 0 ? 'font-semibold text-amber-700' : 'text-slate-500'}>{money(r.balance)}</span> },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}
