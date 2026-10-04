import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { date, dateTime, money } from '../lib/format';
import { Badge, Button, Card, DefinitionList, ErrorBox, LinkButton, PageHeader, Spinner, StatCard, Tabs, useConfirm } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { AttachmentsPanel, AuditTrail } from '../components/business';
import { CONFERENCE_STATUS_TONE, ConferenceFormModal } from './Conferences';

export default function ConferenceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const manage = can('conferences.manage');
  const [tab, setTab] = useState<'registrations' | 'files' | 'history'>('registrations');
  const [edit, setEdit] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['conference-event', id], queryFn: () => api.get(`/conference-events/${id}`) });
  const del = useAction((reason: string) => api.del(`/conference-events/${id}`, { reason }), 'Conference deleted.');
  const restore = useAction(() => api.post(`/conference-events/${id}/restore`), 'Conference restored.');

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  const { event: e, registrations, summary } = data;

  return (
    <>
      <PageHeader
        back="/conferences"
        title={<span className="flex flex-wrap items-center gap-2">{e.name} <Badge tone={CONFERENCE_STATUS_TONE[e.status]}>{e.status}</Badge> {e.deleted && <Badge tone="red">Deleted</Badge>}</span>}
        subtitle={`${e.code} • ${e.conferenceNo} • ${e.level} • ${date(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ` – ${date(e.endDate)}` : ''}`}
        actions={
          <>
            {!e.deleted && e.openForRegistration && can('orders.create') && (
              <LinkButton to={`/m/conferences/new?eventId=${e.id}`} variant="primary" icon={<Plus className="size-4" />}>Register paper / author</LinkButton>
            )}
            {!e.deleted && manage && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>}
            {!e.deleted && manage && (
              <Button
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  const reason = await confirm({
                    title: `Delete ${e.name}?`,
                    message: summary.registrations ? `This conference has ${summary.registrations} active registrations, so it cannot be deleted. Set its status to Cancelled instead.` : 'It will be hidden from employees. A manager can restore it later.',
                    reason: true,
                    danger: true,
                    confirmLabel: 'Delete',
                  });
                  if (reason) del.mutate(reason, { onSuccess: () => navigate('/conferences') });
                }}
              >
                Delete
              </Button>
            )}
            {e.deleted && manage && <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => restore.mutate()}>Restore</Button>}
          </>
        }
      />

      {!e.openForRegistration && !e.deleted && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Registrations are not open for this conference ({e.status}). {manage ? 'Change the status to “Registration Open” to accept new registrations.' : ''}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Registrations" value={summary.registrations} tone="blue" sub={summary.myRegistrations ? `${summary.myRegistrations} by you` : undefined} />
        <StatCard label="Authors" value={summary.authors} tone="violet" />
        <StatCard label={summary.scope === 'all' ? 'Revenue' : 'My revenue'} value={money(summary.revenue)} tone="green" sub={`Collected ${money(summary.collected)}`} />
        <StatCard label={summary.scope === 'all' ? 'Pending' : 'My pending'} value={money(summary.pending)} tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Conference details">
          <DefinitionList
            items={[
              ['Theme', e.theme],
              ['Organiser', e.organizerName],
              ['Mode', e.mode],
              ['Venue', [e.venue, e.city].filter(Boolean).join(', ')],
              ['Start', date(e.startDate)],
              ['End', date(e.endDate)],
              ['Registration deadline', date(e.registrationDeadline)],
              ['Registration fee', money(e.registrationFee)],
              ['Publication fee', money(e.publicationFee)],
              ['Publication', e.publicationDetails],
              ['Coordinator', [e.coordinatorName, e.coordinatorMobile, e.coordinatorEmail].filter(Boolean).join(' • ')],
              ['Added by', `${e.createdByName}, ${dateTime(e.createdAt)}`],
              ['Notes', e.notes],
            ]}
          />
        </Card>
        <Card className="lg:col-span-2" bodyClass="p-3 sm:p-4">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'registrations', label: `${can('orders.view_all') ? 'Registrations' : 'My registrations'} (${registrations.length})` },
              { key: 'files', label: 'Brochure & files' },
              { key: 'history', label: 'History' },
            ]}
          />
          {tab === 'registrations' && (
            <DataTable
              rows={registrations}
              onRowClick={(r) => navigate(`/m/conferences/${r.id}`)}
              empty={<p className="py-8 text-center text-sm text-slate-500">No registrations yet.</p>}
              columns={[
                { key: 'paperTitle', header: 'Paper', primary: true, cell: (r) => <div className="max-w-[300px]"><p className="line-clamp-2 font-medium">{r.paperTitle || '—'}</p><p className="text-xs text-slate-500">{r.recordNo} • {date(r.date)}</p></div> },
                { key: 'customerName', header: 'Author / customer', cell: (r) => <div><p>{r.customerName}</p><p className="text-xs text-slate-500">{(r.authors ?? []).length > 1 ? `+${r.authors.length - 1} co-authors` : r.mobile}</p></div> },
                { key: 'employeeName', header: 'Employee', hideOnMobile: true },
                { key: 'status', header: 'Status', cell: (r) => <Badge>{r.status}</Badge> },
                { key: 'totalAmount', header: 'Total', align: 'right', cell: (r) => money(r.totalAmount) },
                { key: 'balance', header: 'Balance', align: 'right', cell: (r) => <span className={r.balance > 0 ? 'font-semibold text-amber-700' : ''}>{money(r.balance)}</span> },
              ]}
            />
          )}
          {tab === 'files' && <AttachmentsPanel entityType="conferenceEvent" entityId={e.id} defaultCategory="Brochure" canUpload={manage && !e.deleted} />}
          {tab === 'history' && <AuditTrail recordId={e.id} />}
        </Card>
      </div>
      <ConferenceFormModal open={edit} onClose={() => setEdit(false)} conference={e} />
    </>
  );
}
