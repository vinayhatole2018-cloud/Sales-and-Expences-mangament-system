import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { getModule, PRIORITIES, round2, todayYMD, type FieldDef } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useServices, useSettings } from '../lib/hooks';
import { money } from '../lib/format';
import { Button, Card, Checkbox, Empty, ErrorBox, Field, Input, MoneyInput, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import { CustomerPicker, EmployeeSelect, PaymentModeSelect, ReasonField, type CustomerChoice } from '../components/business';

type Values = Record<string, any>;

function AuthorsEditor({ value, onChange }: { value: { name: string; mobile: string; email: string }[]; onChange: (v: any[]) => void }) {
  const rows = value?.length ? value : [];
  const update = (i: number, patch: object) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((a, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input placeholder={`Author ${i + 1} name`} value={a.name} onChange={(e) => update(i, { name: e.target.value })} />
          <Input placeholder="Mobile" inputMode="tel" value={a.mobile} onChange={(e) => update(i, { mobile: e.target.value })} />
          <Input placeholder="Email" type="email" value={a.email} onChange={(e) => update(i, { email: e.target.value })} />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove author">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button type="button" size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => onChange([...rows, { name: '', mobile: '', email: '' }])}>
        Add author
      </Button>
    </div>
  );
}

function DynamicField({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  switch (f.type) {
    case 'money':
      return <MoneyInput value={value ?? ''} onChange={onChange} />;
    case 'number':
      return <Input inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} />;
    case 'select':
      return (
        <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {!f.required && <option value="">—</option>}
          {f.options?.map((o) => <option key={o}>{o}</option>)}
        </Select>
      );
    case 'checkbox':
      return <div className="pt-2"><Checkbox label="Yes" checked={Boolean(value)} onChange={onChange} /></div>;
    case 'date':
      return <Input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'textarea':
      return <Textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'authors':
      return <AuthorsEditor value={value ?? []} onChange={onChange} />;
    case 'email':
      return <Input type="email" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'tel':
      return <Input inputMode="tel" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
  }
}

export default function ModuleForm() {
  const { moduleKey = '', id } = useParams();
  const def = getModule(moduleKey);
  const navigate = useNavigate();
  const { can, profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: services } = useServices();
  const editing = Boolean(id);
  const existing = useQuery({ queryKey: ['module-record', moduleKey, id], queryFn: () => api.get(`/modules/${moduleKey}/${id}`), enabled: editing });
  const [sp] = useSearchParams();
  const hasConference = Boolean(def?.fields.some((f) => f.type === 'conference'));
  const conferences = useQuery({ queryKey: ['conference-options'], queryFn: () => api.get<any[]>('/conference-events/options'), enabled: hasConference });

  const [customer, setCustomer] = useState<CustomerChoice>({});
  const [v, setV] = useState<Values>({});
  const [common, setCommon] = useState({ date: todayYMD(), expectedDate: '', priority: 'Normal', status: def?.defaultStatus ?? '', employeeId: profile?.id ?? '', serviceId: '', advance: '', paymentMode: '', txnNumber: '', remarks: '', reason: '' });

  useEffect(() => {
    if (!def) return;
    if (editing && existing.data) {
      const r = existing.data.record;
      const vals: Values = {};
      for (const f of def.fields) vals[f.name] = f.type === 'money' || f.type === 'number' ? String(r[f.name] ?? '') : r[f.name];
      setV(vals);
      setCommon((c) => ({ ...c, date: r.date, expectedDate: r.expectedDate ?? '', status: r.status, employeeId: r.employeeId, remarks: r.remarks ?? '', priority: existing.data.order?.priority ?? 'Normal' }));
    } else if (!editing) {
      const vals: Values = {};
      for (const f of def.fields) vals[f.name] = f.type === 'select' && f.required ? f.options?.[0] : f.type === 'checkbox' ? false : f.type === 'authors' ? [] : f.name === 'quantity' ? '1' : '';
      setV(vals);
    }
  }, [def, editing, existing.data]);

  // Conference registrations: pick the conference from the Conference master.
  const pickConference = (eventId: string, applyFees: boolean) => {
    const ev = (conferences.data ?? []).find((c) => c.id === eventId);
    setV((x) => ({
      ...x,
      conferenceEventId: eventId,
      conferenceName: ev?.name ?? '',
      conferenceNumber: ev?.code ?? '',
      collegeName: ev?.organizerName ?? '',
      ...(ev && applyFees ? { price: String(ev.registrationFee ?? ''), fees: String(ev.publicationFee ?? '') } : {}),
    }));
  };
  const preselected = useRef(false);
  useEffect(() => {
    const eventId = sp.get('eventId');
    if (editing || preselected.current || !eventId || !conferences.data || v.conferenceEventId === undefined) return;
    preselected.current = true;
    pickConference(eventId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferences.data, v.conferenceEventId, editing]);

  const categoryServices = useMemo(() => (services?.items ?? []).filter((s: any) => s.category === def?.category && s.status === 'Active'), [services, def]);
  // Pre-fill the main fee from the chosen service's default price.
  const applyService = (sid: string) => {
    setCommon((c) => ({ ...c, serviceId: sid }));
    const s = categoryServices.find((x: any) => x.id === sid);
    if (s && def) {
      const target = def.key === 'certificates' ? 'price' : def.amountFields[def.amountFields.length - 1];
      setV((x) => ({ ...x, [target]: String(s.basePrice) }));
    }
  };

  const total = def ? round2(def.computeTotal(v)) : 0;
  const originalTotal = existing.data?.record.totalAmount ?? total;
  const amountChanged = editing && total !== originalTotal;
  const cancelling = editing && common.status === 'Cancelled' && existing.data?.record.status !== 'Cancelled';
  const advance = Number(common.advance) || 0;

  const save = useAction(
    () => {
      const body = { ...v };
      for (const f of def!.fields) if (f.type === 'money' || f.type === 'number') body[f.name] = body[f.name] === '' ? 0 : Number(body[f.name]);
      if (editing) {
        return api.put(`/modules/${moduleKey}/${id}`, { ...body, status: common.status, expectedDate: common.expectedDate, priority: common.priority, remarks: common.remarks, employeeId: can('orders.view_all') ? common.employeeId : undefined, reason: common.reason });
      }
      return api.post(`/modules/${moduleKey}`, {
        ...body,
        customerId: customer.customerId,
        newCustomer: customer.newCustomer,
        employeeId: common.employeeId,
        serviceId: common.serviceId,
        date: common.date,
        expectedDate: common.expectedDate,
        priority: common.priority,
        status: common.status,
        advance,
        paymentMode: advance > 0 ? common.paymentMode || settings?.paymentModes[0] : '',
        txnNumber: common.txnNumber,
        remarks: common.remarks,
      });
    },
    (r: any) => (editing ? 'Saved.' : `${def!.singular} ${r.moduleRecord.recordNo} created (order ${r.order.orderNo}).`),
  );

  if (!def) return <Empty title="Unknown module" />;
  if (editing && existing.isLoading) return <Spinner />;
  if (editing && existing.error) return <ErrorBox message={(existing.error as Error).message} />;

  const submit = () =>
    save.mutate(undefined, {
      onSuccess: (r: any) => navigate(`/m/${moduleKey}/${editing ? id : r.moduleRecord.id}`),
    });

  return (
    <>
      <PageHeader
        back={editing ? `/m/${moduleKey}/${id}` : `/m/${moduleKey}`}
        title={editing ? `Edit ${existing.data?.record.recordNo}` : `New ${def.singular.toLowerCase()}`}
        subtitle={editing ? existing.data?.record.customerName : 'An order and sale are created automatically.'}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {!editing && (
            <Card title="Customer / author">
              <CustomerPicker value={customer} onChange={setCustomer} />
            </Card>
          )}
          <Card title={`${def.singular} details`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {!editing && categoryServices.length > 0 && (
                <Field label="Service" hint="Loads the default price" className="sm:col-span-2">
                  <Select value={common.serviceId} onChange={(e) => applyService(e.target.value)}>
                    <option value="">Default {def.category} service</option>
                    {categoryServices.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {money(s.basePrice)}</option>)}
                  </Select>
                </Field>
              )}
              {def.fields.map((f) =>
                f.type === 'conference' ? (
                  <Field
                    key={f.name}
                    label={f.label}
                    required
                    className="sm:col-span-2"
                    hint={!editing ? 'Only conferences open for registration can be chosen. Selecting one loads its fees.' : undefined}
                  >
                    <Select value={v[f.name] ?? ''} onChange={(e) => pickConference(e.target.value, !editing)}>
                      <option value="">Select a conference…</option>
                      {(conferences.data ?? []).map((c) => (
                        <option key={c.id} value={c.id} disabled={!c.openForRegistration && c.id !== existing.data?.record.conferenceEventId}>
                          {c.name} ({c.code}) — {c.startDate.split('-').reverse().join('/')}
                          {c.openForRegistration ? '' : ` • ${c.status}`}
                        </option>
                      ))}
                    </Select>
                    {conferences.data && !conferences.data.some((c) => c.openForRegistration) && (
                      <p className="mt-1 text-xs text-amber-700">
                        No conference is open for registration.{' '}
                        {can('conferences.manage') ? <Link to="/conferences" className="font-medium underline">Add or open one</Link> : 'Ask a manager to add it under Conferences.'}
                      </p>
                    )}
                  </Field>
                ) : f.derived ? (
                  <Field key={f.name} label={f.label} className={f.full ? 'sm:col-span-2' : ''}>
                    <Input value={v[f.name] ?? ''} disabled placeholder="Filled from the selected conference" />
                  </Field>
                ) : (
                  <Field key={f.name} label={f.label} required={f.required} className={f.full || f.type === 'authors' ? 'sm:col-span-2' : ''}>
                    <DynamicField f={f} value={v[f.name]} onChange={(val) => setV((x) => ({ ...x, [f.name]: val }))} />
                  </Field>
                ),
              )}
            </div>
          </Card>
          <Card title="Work & tracking">
            <div className="grid gap-3 sm:grid-cols-2">
              {!editing && <Field label="Date" required><Input type="date" value={common.date} max={todayYMD()} onChange={(e) => setCommon({ ...common, date: e.target.value })} /></Field>}
              <Field label="Expected completion"><Input type="date" value={common.expectedDate} onChange={(e) => setCommon({ ...common, expectedDate: e.target.value })} /></Field>
              <Field label="Status">
                <Select value={common.status} onChange={(e) => setCommon({ ...common, status: e.target.value })}>
                  {def.statuses.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={common.priority} onChange={(e) => setCommon({ ...common, priority: e.target.value })}>
                  {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              {can('orders.view_all') && <Field label="Assigned employee"><EmployeeSelect value={common.employeeId} onChange={(val) => setCommon({ ...common, employeeId: val })} /></Field>}
              <Field label="Remarks" className="sm:col-span-2"><Textarea value={common.remarks} onChange={(e) => setCommon({ ...common, remarks: e.target.value })} /></Field>
              {(amountChanged || cancelling) && (
                <div className="sm:col-span-2">
                  <ReasonField value={common.reason} onChange={(r) => setCommon({ ...common, reason: r })} required label={amountChanged ? `Reason for changing the amount (${money(originalTotal)} → ${money(total)})` : 'Reason for cancelling'} />
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {!editing && can('payments.create') && (
            <Card title="Advance payment">
              <div className="space-y-3">
                <Field label="Advance amount" error={advance > total ? 'Advance cannot exceed the total.' : undefined}>
                  <MoneyInput value={common.advance} onChange={(val) => setCommon({ ...common, advance: val })} placeholder="0" />
                </Field>
                {advance > 0 && (
                  <>
                    <Field label="Payment mode" required><PaymentModeSelect value={common.paymentMode || settings?.paymentModes[0] || ''} onChange={(val) => setCommon({ ...common, paymentMode: val })} /></Field>
                    <Field label="Transaction number"><Input value={common.txnNumber} onChange={(e) => setCommon({ ...common, txnNumber: e.target.value })} /></Field>
                  </>
                )}
              </div>
            </Card>
          )}
          <Card title="Summary">
            <dl className="space-y-2 text-sm">
              {def.amountFields.map((k) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-slate-500">{def.fields.find((f) => f.name === k)?.label}</dt>
                  <dd className="tabular">{money(Number(v[k]) || 0)}</dd>
                </div>
              ))}
              {def.key === 'certificates' && <div className="flex justify-between"><dt className="text-slate-500">Quantity</dt><dd className="tabular">× {v.quantity || 1}</dd></div>}
              <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-medium">Total</dt><dd className="text-lg font-semibold tabular">{money(total)}</dd></div>
              {editing ? (
                <div className="flex justify-between"><dt className="text-slate-500">Paid so far</dt><dd className="tabular text-emerald-700">{money(existing.data?.record.paidAmount)}</dd></div>
              ) : (
                <>
                  <div className="flex justify-between"><dt className="text-slate-500">Advance</dt><dd className="tabular text-emerald-700">{money(advance)}</dd></div>
                  <div className="flex justify-between"><dt className="font-medium">Balance</dt><dd className="font-semibold tabular text-amber-700">{money(Math.max(total - advance, 0))}</dd></div>
                </>
              )}
            </dl>
            <Button
              className="mt-4 w-full"
              loading={save.isPending}
              disabled={(hasConference && !v.conferenceEventId) || (!editing && (advance > total || (!customer.customerId && !customer.newCustomer))) || ((amountChanged || cancelling) && common.reason.trim().length < 3)}
              onClick={submit}
            >
              {editing ? 'Save changes' : `Create ${def.singular.toLowerCase()}`}
            </Button>
            {amountChanged && !can('orders.edit_amount') && <p className="mt-2 text-xs text-red-600">Only managers can change amounts.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
