import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, Plus } from 'lucide-react';
import { CONFERENCE_LEVELS, CONFERENCE_MODES, CONFERENCE_STATUSES } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useColleges, useList, useListState } from '../lib/hooks';
import { date, money } from '../lib/format';
import { Badge, Button, Card, Checkbox, Field, Input, Modal, MoneyInput, PageHeader, Select, Textarea, type Tone } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { DateRangeFilter, FilterBar, FilterSelect, SearchBox } from '../components/Filters';

export const CONFERENCE_STATUS_TONE: Record<string, Tone> = {
  Upcoming: 'blue',
  'Registration Open': 'green',
  'Registration Closed': 'amber',
  Completed: 'gray',
  Cancelled: 'red',
};

const EMPTY = {
  name: '', code: '', level: 'National', theme: '', organizerCollegeId: '', organizerName: '', mode: 'Offline', venue: '', city: '',
  startDate: '', endDate: '', registrationDeadline: '', registrationFee: '', publicationFee: '', publicationDetails: '',
  coordinatorName: '', coordinatorMobile: '', coordinatorEmail: '', status: 'Registration Open', notes: '',
};

/** Add / edit a conference. Only users with `conferences.manage` see this. */
export function ConferenceFormModal({ open, onClose, conference, onSaved }: { open: boolean; onClose: () => void; conference?: any; onSaved?: (c: any) => void }) {
  const { data: colleges } = useColleges();
  const [f, setF] = useState(EMPTY);
  useEffect(() => {
    if (!open) return;
    setF(conference ? { ...EMPTY, ...conference, registrationFee: String(conference.registrationFee ?? ''), publicationFee: String(conference.publicationFee ?? '') } : EMPTY);
  }, [open, conference]);
  const set = (p: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...p }));
  const save = useAction(
    () => {
      const body = { ...f, registrationFee: Number(f.registrationFee) || 0, publicationFee: Number(f.publicationFee) || 0 };
      return conference ? api.put(`/conference-events/${conference.id}`, body) : api.post('/conference-events', body);
    },
    (c: any) => (conference ? 'Conference updated.' : `Conference ${c.conferenceNo} added. Everyone has been notified.`),
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={conference ? `Edit ${conference.name}` : 'Add conference'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: (c) => { onSaved?.(c); onClose(); } })}>{conference ? 'Save changes' : 'Add conference'}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Conference name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus placeholder="e.g. International Conference on Emerging Engineering Trends" /></Field>
        <Field label="Conference code / number" required hint="Short unique code, e.g. ICEET-2026"><Input value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Level">
          <Select value={f.level} onChange={(e) => set({ level: e.target.value })}>{CONFERENCE_LEVELS.map((l) => <option key={l}>{l}</option>)}</Select>
        </Field>
        <Field label="Theme / topics" className="sm:col-span-2"><Input value={f.theme} onChange={(e) => set({ theme: e.target.value })} /></Field>
        <Field label="Organising college">
          <Select value={f.organizerCollegeId} onChange={(e) => set({ organizerCollegeId: e.target.value })}>
            <option value="">— Not listed —</option>
            {(colleges?.items ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.city ? `, ${c.city}` : ''}</option>)}
          </Select>
        </Field>
        {!f.organizerCollegeId && <Field label="Organiser name (if not listed)"><Input value={f.organizerName} onChange={(e) => set({ organizerName: e.target.value })} /></Field>}
        <Field label="Mode">
          <Select value={f.mode} onChange={(e) => set({ mode: e.target.value })}>{CONFERENCE_MODES.map((m) => <option key={m}>{m}</option>)}</Select>
        </Field>
        <Field label="Venue"><Input value={f.venue} onChange={(e) => set({ venue: e.target.value })} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
        <Field label="Start date" required><Input type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate })} /></Field>
        <Field label="End date"><Input type="date" value={f.endDate} min={f.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} /></Field>
        <Field label="Registration deadline"><Input type="date" value={f.registrationDeadline} onChange={(e) => set({ registrationDeadline: e.target.value })} /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>{CONFERENCE_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
        </Field>
        <Field label="Registration fee (per paper)" hint="Loaded into new registrations"><MoneyInput value={f.registrationFee} onChange={(v) => set({ registrationFee: v })} /></Field>
        <Field label="Publication / other fee"><MoneyInput value={f.publicationFee} onChange={(v) => set({ publicationFee: v })} /></Field>
        <Field label="Publication details" className="sm:col-span-2" hint="e.g. Scopus indexed proceedings, journal special issue, ISBN"><Input value={f.publicationDetails} onChange={(e) => set({ publicationDetails: e.target.value })} /></Field>
        <Field label="Coordinator name"><Input value={f.coordinatorName} onChange={(e) => set({ coordinatorName: e.target.value })} /></Field>
        <Field label="Coordinator mobile"><Input inputMode="tel" value={f.coordinatorMobile} onChange={(e) => set({ coordinatorMobile: e.target.value })} /></Field>
        <Field label="Coordinator email" className="sm:col-span-2"><Input type="email" value={f.coordinatorEmail} onChange={(e) => set({ coordinatorEmail: e.target.value })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function Conferences() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const manage = can('conferences.manage');
  const { params, set } = useListState({ page: '1', pageSize: '25', sort: 'startDate', dir: 'desc' });
  const { data, isLoading } = useList('conference-events', '/conference-events', params);
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Conferences"
        subtitle={manage ? 'Add and manage conferences. Every employee can see them and register papers.' : 'Conferences you can register papers and authors for.'}
        actions={manage && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Add conference</Button>}
      />
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Name, code, organiser, city…" />
          <FilterSelect label="Status" value={params.status ?? ''} onChange={(v) => set({ status: v })} options={CONFERENCE_STATUSES} />
          <FilterSelect label="Mode" value={params.mode ?? ''} onChange={(v) => set({ mode: v })} options={CONFERENCE_MODES} />
          <FilterSelect label="Level" value={params.level ?? ''} onChange={(v) => set({ level: v })} options={CONFERENCE_LEVELS} />
          <DateRangeFilter from={params.from ?? ''} to={params.to ?? ''} onChange={(r) => set(r)} />
          <div className="flex items-end gap-4 pb-2">
            <Checkbox label="Open for registration" checked={params.open === 'true'} onChange={(v) => set({ open: v ? 'true' : '' })} />
            {manage && <Checkbox label="Show deleted" checked={params.includeDeleted === 'true'} onChange={(v) => set({ includeDeleted: v ? 'true' : '' })} />}
          </div>
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          onRowClick={(r) => navigate(`/conferences/${r.id}`)}
          rowClass={(r) => (r.deleted ? 'opacity-50 line-through' : '')}
          columns={[
            {
              key: 'name',
              header: 'Conference',
              primary: true,
              sortable: true,
              cell: (r) => (
                <div className="max-w-[340px]">
                  <p className="line-clamp-2 font-medium text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">{r.code} • {r.level} • {r.conferenceNo}</p>
                </div>
              ),
            },
            {
              key: 'startDate',
              header: 'Dates',
              sortable: true,
              cell: (r) => (
                <span className="inline-flex items-center gap-1 whitespace-nowrap"><CalendarDays className="size-3.5 text-slate-400" />{date(r.startDate)}{r.endDate && r.endDate !== r.startDate ? ` – ${date(r.endDate)}` : ''}</span>
              ),
            },
            { key: 'organizerName', header: 'Organiser', hideOnMobile: true, cell: (r) => <span className="line-clamp-1 max-w-[220px]">{r.organizerName || '—'}</span> },
            { key: 'city', header: 'Venue', hideOnMobile: true, cell: (r) => <span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-slate-400" />{[r.mode, r.city].filter(Boolean).join(' • ')}</span> },
            { key: 'registrationFee', header: 'Fee', align: 'right', hideOnMobile: true, cell: (r) => money(r.registrationFee) },
            { key: 'registrations', header: 'Registrations', align: 'right', sortable: true, cell: (r) => <span>{r.registrations}{r.myRegistrations ? <span className="ml-1 text-xs text-slate-500">({r.myRegistrations} mine)</span> : null}</span> },
            ...(can('finance.view_all') ? [{ key: 'revenue', header: 'Revenue', align: 'right' as const, sortable: true, hideOnMobile: true, cell: (r: any) => money(r.revenue) }] : []),
            { key: 'status', header: 'Status', sortable: true, cell: (r) => <Badge tone={CONFERENCE_STATUS_TONE[r.status]}>{r.deleted ? 'Deleted' : r.status}</Badge> },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <ConferenceFormModal open={open} onClose={() => setOpen(false)} onSaved={(c) => navigate(`/conferences/${c.id}`)} />
    </>
  );
}
