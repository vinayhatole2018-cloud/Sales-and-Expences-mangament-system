import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, todayYMD } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useColleges, useList, useListState } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, EmployeeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';
import { EmployeeSelect } from '../components/business';

const EMPTY = {
  name: '', mobile: '', altMobile: '', email: '', address: '', city: '', state: 'Maharashtra', collegeId: '', collegeName: '',
  department: '', designation: '', customerType: 'Author', assignedEmployeeId: '', dateAdded: todayYMD(), notes: '', status: 'Active',
};

export function CustomerFormModal({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer?: any; onSaved?: (c: any) => void }) {
  const { can, profile } = useAuth();
  const { data: colleges } = useColleges();
  const [f, setF] = useState(EMPTY);
  useEffect(() => {
    if (open) setF(customer ? { ...EMPTY, ...customer } : { ...EMPTY, assignedEmployeeId: profile?.id ?? '' });
  }, [open, customer, profile]);
  const set = (patch: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...patch }));
  const save = useAction(
    () => (customer ? api.put(`/customers/${customer.id}`, f) : api.post('/customers', f)),
    (c: any) => (customer ? 'Customer updated.' : `Customer ${c.customerNo} added.`),
  );
  const submit = () => save.mutate(undefined, { onSuccess: (c) => { onSaved?.(c); onClose(); } });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={customer ? `Edit ${customer.name}` : 'Add customer'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>{customer ? 'Save changes' : 'Add customer'}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" required><Input value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <Field label="Customer type" required>
          <Select value={f.customerType} onChange={(e) => set({ customerType: e.target.value })}>
            {CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Mobile number" required><Input inputMode="tel" value={f.mobile} onChange={(e) => set({ mobile: e.target.value })} placeholder="10-digit mobile" /></Field>
        <Field label="Alternate mobile"><Input inputMode="tel" value={f.altMobile} onChange={(e) => set({ altMobile: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="College / Institution" hint="Pick a listed college, or type a name below.">
          <Select value={f.collegeId} onChange={(e) => set({ collegeId: e.target.value })}>
            <option value="">— Not listed —</option>
            {(colleges?.items ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.city ? `, ${c.city}` : ''}</option>)}
          </Select>
        </Field>
        {!f.collegeId && <Field label="Institution name (if not listed)"><Input value={f.collegeName} onChange={(e) => set({ collegeName: e.target.value })} /></Field>}
        <Field label="Department"><Input value={f.department} onChange={(e) => set({ department: e.target.value })} /></Field>
        <Field label="Designation"><Input value={f.designation} onChange={(e) => set({ designation: e.target.value })} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
        <Field label="State"><Input value={f.state} onChange={(e) => set({ state: e.target.value })} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        {can('customers.view_all') && (
          <Field label="Assigned employee"><EmployeeSelect value={f.assignedEmployeeId} onChange={(v) => set({ assignedEmployeeId: v })} /></Field>
        )}
        <Field label="Date added"><Input type="date" value={f.dateAdded} max={todayYMD()} onChange={(e) => set({ dateAdded: e.target.value })} /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            {CUSTOMER_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function Customers() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'createdAt', dir: 'desc' });
  const { data, isLoading } = useList('customers', '/customers', params);
  const [open, setOpen] = useState(sp.get('new') === '1');

  const exportCsv = () => api.download('/reports/customers/export', { format: 'xlsx', from: params.from || '2000-01-01', to: params.to, employeeId: params.employeeId });

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={data ? `${data.total} customers • ${money(data.totals?.balance ?? 0)} outstanding` : undefined}
        actions={
          <>
            {can('reports.export') && <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>Export</Button>}
            {can('customers.create') && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Add customer</Button>}
          </>
        }
      />
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Name, mobile, email, ID, college…" />
          <FilterSelect label="Type" value={params.customerType ?? ''} onChange={(v) => set({ customerType: v })} options={CUSTOMER_TYPES} />
          <FilterSelect label="Status" value={params.status ?? ''} onChange={(v) => set({ status: v })} options={CUSTOMER_STATUSES} />
          <EmployeeFilter value={params.employeeId ?? ''} onChange={(v) => set({ employeeId: v })} />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <div className="flex items-end gap-4 pb-2">
            <Checkbox label="With balance" checked={params.withBalance === 'true'} onChange={(v) => set({ withBalance: v ? 'true' : '' })} />
            {can('records.restore') && <Checkbox label="Show deleted" checked={params.includeDeleted === 'true'} onChange={(v) => set({ includeDeleted: v ? 'true' : '' })} />}
          </div>
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          onRowClick={(r) => navigate(`/customers/${r.id}`)}
          rowClass={(r) => (r.deleted ? 'opacity-50 line-through' : '')}
          columns={[
            { key: 'name', header: 'Customer', primary: true, sortable: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.customerNo} • {r.customerType}</p></div> },
            { key: 'mobile', header: 'Mobile', cell: (r) => <a href={`tel:${r.mobile}`} onClick={(e) => e.stopPropagation()} className="text-brand-700 hover:underline">{r.mobile}</a> },
            { key: 'collegeName', header: 'College', sortable: true, hideOnMobile: true, cell: (r) => <span className="line-clamp-1">{r.collegeName || '—'}</span> },
            { key: 'assignedEmployeeName', header: 'Employee', hideOnMobile: true },
            { key: 'orderCount', header: 'Orders', align: 'right', sortable: true },
            { key: 'totalBilled', header: 'Billed', align: 'right', sortable: true, hideOnMobile: true, cell: (r) => money(r.totalBilled) },
            { key: 'balance', header: 'Balance', align: 'right', sortable: true, cell: (r) => <span className={r.balance > 0 ? 'font-semibold text-amber-700' : 'text-slate-500'}>{money(r.balance)}</span> },
            { key: 'dateAdded', header: 'Added', sortable: true, hideOnMobile: true, cell: (r) => date(r.dateAdded) },
            { key: 'status', header: 'Status', hideOnMobile: true, cell: (r) => <Badge>{r.status}</Badge> },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <CustomerFormModal
        open={open}
        onClose={() => {
          setOpen(false);
          if (sp.get('new')) {
            sp.delete('new');
            setSp(sp, { replace: true });
          }
        }}
        onSaved={(c) => navigate(`/customers/${c.id}`)}
      />
    </>
  );
}
