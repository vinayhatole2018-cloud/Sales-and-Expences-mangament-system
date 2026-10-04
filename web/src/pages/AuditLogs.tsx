import { useState } from 'react';
import { MODULE_LIST } from '@pbms/shared';
import { useList, useListState, useEmployeeOptions } from '../lib/hooks';
import { dateTime } from '../lib/format';
import { Badge, Card, Modal, PageHeader } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';

const MODULES = ['auth', 'customers', 'orders', 'payments', 'expenses', 'employees', 'roles', 'colleges', 'conference-events', 'services', 'invoices', 'attachments', 'reports', 'settings', 'backups', ...MODULE_LIST.map((m) => m.key)];
const ACTIONS = ['create', 'update', 'amount_change', 'status_change', 'price_change', 'cancel', 'delete', 'restore', 'void', 'refund', 'approve', 'reject', 'login', 'logout', 'password_change', 'password_reset', 'role_change', 'export', 'upload', 'backup', 'invoice_create', 'invoice_refresh'];

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <p className="text-sm text-slate-400">—</p>;
  return <pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(value, null, 2)}</pre>;
}

export default function AuditLogs() {
  const { params, set } = useListState({ page: '1', pageSize: '50', sort: 'at', dir: 'desc' });
  const { data, isLoading } = useList('audit', '/audit-logs', params);
  const { data: employees } = useEmployeeOptions();
  const [detail, setDetail] = useState<any>(null);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every important action with who did it, when, and the old and new values. Entries cannot be edited or deleted." />
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Message, record, reason…" />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <FilterSelect label="User" value={params.userId ?? ''} onChange={(v) => set({ userId: v })} options={(employees ?? []).map((e) => ({ value: e.id, label: e.name }))} />
          <FilterSelect label="Module" value={params.module ?? ''} onChange={(v) => set({ module: v })} options={MODULES} />
          <FilterSelect label="Action" value={params.action ?? ''} onChange={(v) => set({ action: v })} options={ACTIONS} />
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          onRowClick={setDetail}
          columns={[
            { key: 'at', header: 'When', primary: true, cell: (r) => <span className="whitespace-nowrap">{dateTime(r.at)}</span> },
            { key: 'userName', header: 'User', cell: (r) => <div><p>{r.userName}</p><p className="text-xs text-slate-500">{r.userRole}</p></div> },
            { key: 'action', header: 'Action', cell: (r) => <Badge tone={['delete', 'void', 'reject'].includes(r.action) ? 'red' : ['amount_change', 'price_change'].includes(r.action) ? 'amber' : 'gray'}>{r.action.replace(/_/g, ' ')}</Badge> },
            { key: 'module', header: 'Module', hideOnMobile: true },
            { key: 'message', header: 'Details', cell: (r) => <div className="max-w-xl"><p className="line-clamp-2">{r.message}</p>{r.reason && <p className="text-xs text-slate-500">Reason: {r.reason}</p>}</div> },
            { key: 'ip', header: 'IP', hideOnMobile: true },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Audit entry" size="lg">
        {detail && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-800">{detail.message}</p>
            <p className="text-xs text-slate-500">
              {dateTime(detail.at)} • {detail.userName} ({detail.userRole}) • {detail.module} / {detail.action} • Record {detail.recordLabel || detail.recordId} {detail.ip && `• IP ${detail.ip}`}
            </p>
            {detail.reason && <p><span className="font-medium">Reason:</span> {detail.reason}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <div><p className="mb-1 text-xs font-semibold text-slate-500">Old value</p><JsonBlock value={detail.oldValue} /></div>
              <div><p className="mb-1 text-xs font-semibold text-slate-500">New value</p><JsonBlock value={detail.newValue} /></div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
