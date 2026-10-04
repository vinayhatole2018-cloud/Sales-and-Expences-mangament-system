import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useList, useListState } from '../lib/hooks';
import { money } from '../lib/format';
import { Button, Card, Field, Input, Modal, PageHeader, Textarea } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { FilterBar, SearchBox } from '../components/Filters';
import { EmployeeSelect } from '../components/business';

const EMPTY = { name: '', city: '', state: 'Maharashtra', contactPerson: '', mobile: '', email: '', address: '', assignedEmployeeId: '', notes: '' };

export function CollegeFormModal({ open, onClose, college }: { open: boolean; onClose: () => void; college?: any }) {
  const [f, setF] = useState(EMPTY);
  useEffect(() => {
    if (open) setF(college ? { ...EMPTY, ...college } : EMPTY);
  }, [open, college]);
  const save = useAction(() => (college ? api.put(`/colleges/${college.id}`, f) : api.post('/colleges', f)), college ? 'College updated.' : 'College added.');
  const set = (p: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...p }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={college ? `Edit ${college.name}` : 'Add college'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Save</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="College name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
        <Field label="State"><Input value={f.state} onChange={(e) => set({ state: e.target.value })} /></Field>
        <Field label="Contact person"><Input value={f.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} /></Field>
        <Field label="Mobile"><Input inputMode="tel" value={f.mobile} onChange={(e) => set({ mobile: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Assigned employee"><EmployeeSelect value={f.assignedEmployeeId} onChange={(v) => set({ assignedEmployeeId: v })} allowEmpty="— None —" /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function Colleges() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'totalSales', dir: 'desc' });
  const { data, isLoading } = useList('colleges', '/colleges', params);
  const [open, setOpen] = useState(false);
  const money_ = (v: number | null) => (v === null ? '—' : money(v));

  return (
    <>
      <PageHeader
        title="Colleges & institutions"
        subtitle="College-wise orders, sales and pending amounts."
        actions={
          <>
            {can('reports.export') && <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => api.download('/reports/colleges/export', { format: 'xlsx', from: '2000-01-01' })}>Export</Button>}
            {can('colleges.manage') && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Add college</Button>}
          </>
        }
      />
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Name, city, contact…" />
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          onRowClick={(r) => navigate(`/colleges/${r.id}`)}
          columns={[
            { key: 'name', header: 'College', primary: true, sortable: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.collegeNo} • {r.city}</p></div> },
            { key: 'contactPerson', header: 'Contact', hideOnMobile: true, cell: (r) => <div><p>{r.contactPerson || '—'}</p><p className="text-xs text-slate-500">{r.mobile}</p></div> },
            { key: 'assignedEmployeeName', header: 'Employee', hideOnMobile: true },
            { key: 'totalCustomers', header: 'Customers', align: 'right', sortable: true },
            { key: 'totalOrders', header: 'Orders', align: 'right', sortable: true },
            { key: 'totalSales', header: 'Sales', align: 'right', sortable: true, cell: (r) => money_(r.totalSales) },
            { key: 'pendingAmount', header: 'Pending', align: 'right', sortable: true, cell: (r) => <span className={r.pendingAmount > 0 ? 'font-semibold text-amber-700' : ''}>{money_(r.pendingAmount)}</span> },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <CollegeFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
