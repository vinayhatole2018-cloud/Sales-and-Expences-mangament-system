import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { date, money } from '../lib/format';
import { Badge, Button, Card, DefinitionList, ErrorBox, PageHeader, Spinner, StatCard, Tabs } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { BarList, COLORS } from '../components/Charts';
import { AttachmentsPanel, AuditTrail } from '../components/business';
import { CollegeFormModal } from './Colleges';

export default function CollegeDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [tab, setTab] = useState<'orders' | 'customers' | 'files' | 'history'>('orders');
  const [edit, setEdit] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['college', id], queryFn: () => api.get(`/colleges/${id}`) });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  const { college: c, orders, customers, services, summary } = data;

  return (
    <>
      <PageHeader
        back="/colleges"
        title={c.name}
        subtitle={`${c.collegeNo} • ${[c.city, c.state].filter(Boolean).join(', ')}`}
        actions={can('colleges.manage') && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Orders" value={summary.totalOrders} tone="slate" />
        <StatCard label="Sales" value={money(summary.totalSales)} tone="blue" />
        <StatCard label="Payments" value={money(summary.totalPaid)} tone="green" />
        <StatCard label="Pending" value={money(summary.pendingAmount)} tone="amber" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card title="Details">
            <DefinitionList items={[['Contact person', c.contactPerson], ['Mobile', c.mobile], ['Email', c.email], ['Address', c.address], ['Assigned employee', c.assignedEmployeeName], ['Notes', c.notes]]} />
          </Card>
          <Card title="Service usage">
            <BarList data={services.map((s: any) => ({ name: s.category, value: s.amount, hint: `${s.orders} orders, ${money(s.pending)} pending` }))} color={COLORS.sales} />
          </Card>
        </div>
        <Card className="lg:col-span-2" bodyClass="p-3 sm:p-4">
          <Tabs value={tab} onChange={setTab} tabs={[{ key: 'orders', label: `Orders (${orders.length})` }, { key: 'customers', label: `Customers (${customers.length})` }, { key: 'files', label: 'Files' }, { key: 'history', label: 'History' }]} />
          {tab === 'orders' && (
            <DataTable
              rows={orders}
              onRowClick={(r) => navigate(`/orders/${r.id}`)}
              columns={[
                { key: 'orderNo', header: 'Order', primary: true, cell: (r) => <div><p className="font-medium">{r.orderNo} — {r.customerName}</p><p className="text-xs text-slate-500">{r.serviceSummary}</p></div> },
                { key: 'orderDate', header: 'Date', cell: (r) => date(r.orderDate) },
                { key: 'status', header: 'Status', cell: (r) => <Badge>{r.status}</Badge> },
                { key: 'totalAmount', header: 'Total', align: 'right', cell: (r) => money(r.totalAmount) },
                { key: 'balance', header: 'Balance', align: 'right', cell: (r) => money(r.balance) },
              ]}
            />
          )}
          {tab === 'customers' && (
            <DataTable
              rows={customers}
              onRowClick={(r) => navigate(`/customers/${r.id}`)}
              columns={[
                { key: 'name', header: 'Customer', primary: true, cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.designation} {r.department}</p></div> },
                { key: 'mobile', header: 'Mobile' },
                { key: 'customerType', header: 'Type' },
                { key: 'balance', header: 'Balance', align: 'right', cell: (r) => money(r.balance) },
              ]}
            />
          )}
          {tab === 'files' && <AttachmentsPanel entityType="college" entityId={c.id} defaultCategory="Agreement" canUpload={can('colleges.manage')} />}
          {tab === 'history' && <AuditTrail recordId={c.id} />}
        </Card>
      </div>
      <CollegeFormModal open={edit} onClose={() => setEdit(false)} college={c} />
    </>
  );
}
