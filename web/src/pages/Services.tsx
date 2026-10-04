import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { SERVICE_CATEGORIES } from '@pbms/shared';
import { api } from '../lib/api';
import { useAction, useList, useListState } from '../lib/hooks';
import { dateTime, money } from '../lib/format';
import { Badge, Button, Card, Field, Input, Modal, MoneyInput, PageHeader, Select, Textarea } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { DateRangeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';

const EMPTY = { name: '', category: 'Research Paper', description: '', basePrice: '', taxPercent: '0', status: 'Active' };

function ServiceModal({ open, onClose, service }: { open: boolean; onClose: () => void; service?: any }) {
  const [f, setF] = useState(EMPTY);
  useEffect(() => {
    if (open) setF(service ? { ...service, basePrice: String(service.basePrice), taxPercent: String(service.taxPercent ?? 0) } : EMPTY);
  }, [open, service]);
  const save = useAction(
    () => (service ? api.put(`/services/${service.id}`, { ...f, basePrice: Number(f.basePrice), taxPercent: Number(f.taxPercent) }) : api.post('/services', { ...f, basePrice: Number(f.basePrice), taxPercent: Number(f.taxPercent) })),
    service ? 'Service updated.' : 'Service created.',
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={service ? `Edit ${service.name}` : 'New service'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Save</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Category" required>
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {SERVICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Default price" required hint="Loaded automatically when this service is chosen."><MoneyInput value={f.basePrice} onChange={(v) => setF({ ...f, basePrice: v })} /></Field>
        <Field label="Tax %" hint="Only used when GST is enabled."><Input inputMode="decimal" value={f.taxPercent} onChange={(e) => setF({ ...f, taxPercent: e.target.value })} /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option>Active</option>
            <option>Inactive</option>
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function Services() {
  const { params, set } = useListState({ pageSize: '500', sort: 'category', dir: 'asc' });
  const { data, isLoading } = useList('services', '/services', params);
  const [modal, setModal] = useState<{ open: boolean; service?: any }>({ open: false });
  const toggle = useAction((s: any) => api.put(`/services/${s.id}`, { ...s, status: s.status === 'Active' ? 'Inactive' : 'Active' }), (s: any) => `${s.name} is now ${s.status.toLowerCase()}.`);

  return (
    <>
      <PageHeader title="Services & pricing" subtitle="The service catalogue with default prices and performance." actions={<Button icon={<Plus className="size-4" />} onClick={() => setModal({ open: true })}>New service</Button>} />
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} />
          <FilterSelect label="Category" value={params.category ?? ''} onChange={(v) => set({ category: v })} options={SERVICE_CATEGORIES} />
          <FilterSelect label="Status" value={params.status ?? ''} onChange={(v) => set({ status: v })} options={['Active', 'Inactive']} />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          columns={[
            { key: 'name', header: 'Service', primary: true, sortable: true, cell: (r) => <div><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.serviceNo} • {r.description}</p></div> },
            { key: 'category', header: 'Category', sortable: true },
            { key: 'basePrice', header: 'Default price', align: 'right', sortable: true, cell: (r) => money(r.basePrice) },
            { key: 'orders', header: 'Orders', align: 'right', cell: (r) => r.performance?.orders ?? 0 },
            { key: 'revenue', header: 'Revenue', align: 'right', cell: (r) => money(r.performance?.revenue) },
            { key: 'collected', header: 'Collected', align: 'right', hideOnMobile: true, cell: (r) => money(r.performance?.collected) },
            { key: 'createdAt', header: 'Created', hideOnMobile: true, cell: (r) => dateTime(r.createdAt) },
            { key: 'status', header: 'Status', cell: (r) => <button onClick={() => toggle.mutate(r)} title="Click to toggle"><Badge>{r.status}</Badge></button> },
            { key: 'edit', header: '', align: 'right', cell: (r) => <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setModal({ open: true, service: r })} aria-label="Edit"><Pencil className="size-4" /></button> },
          ]}
        />
      </Card>
      <ServiceModal open={modal.open} service={modal.service} onClose={() => setModal({ open: false })} />
    </>
  );
}
