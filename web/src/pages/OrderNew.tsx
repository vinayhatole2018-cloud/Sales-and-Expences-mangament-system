import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PRIORITIES, round2, todayYMD } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useSettings } from '../lib/hooks';
import { money } from '../lib/format';
import { Button, Card, Field, Input, MoneyInput, PageHeader, Select, Textarea } from '../components/ui';
import { CustomerPicker, EmployeeSelect, PaymentModeSelect, type CustomerChoice } from '../components/business';
import { OrderItemsEditor, emptyItem, itemAmount, toPayload, type ItemRow } from '../components/OrderItemsEditor';

export default function OrderNew() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { can, profile } = useAuth();
  const { data: settings } = useSettings();
  const [customer, setCustomer] = useState<CustomerChoice>(sp.get('customerId') ? { customerId: sp.get('customerId')!, label: sp.get('label') ?? 'Selected customer' } : {});
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [orderDate, setOrderDate] = useState(todayYMD());
  const [expectedDate, setExpectedDate] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [employeeId, setEmployeeId] = useState(profile?.id ?? '');
  const [notes, setNotes] = useState('');
  const [advance, setAdvance] = useState('');
  const [mode, setMode] = useState('');
  const [txn, setTxn] = useState('');
  const total = round2(items.reduce((a, it) => a + itemAmount(it), 0));
  const adv = Number(advance) || 0;

  const save = useAction(
    () =>
      api.post('/orders', {
        customerId: customer.customerId,
        newCustomer: customer.newCustomer,
        items: toPayload(items),
        orderDate,
        expectedDate,
        priority,
        notes,
        employeeId,
        advance: adv > 0 ? { amount: adv, mode: mode || settings?.paymentModes[0], txnNumber: txn, date: orderDate } : undefined,
      }),
    (r: any) => `Order ${r.order.orderNo} created.`,
  );

  return (
    <>
      <PageHeader back="/orders" title="New order" subtitle="Customer → services → advance. Totals and balance are calculated by the server." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="1. Customer">
            <CustomerPicker value={customer} onChange={setCustomer} />
          </Card>
          <Card title="2. Services">
            <OrderItemsEditor items={items} onChange={setItems} showTax={settings?.gstEnabled} />
            {!can('orders.edit_amount') && <p className="mt-2 text-xs text-slate-500">You can give up to {settings?.maxEmployeeDiscountPercent ?? 0}% discount. Larger discounts need manager approval.</p>}
          </Card>
          <Card title="3. Details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Order date" required><Input type="date" value={orderDate} max={todayYMD()} onChange={(e) => setOrderDate(e.target.value)} /></Field>
              <Field label="Expected completion"><Input type="date" value={expectedDate} min={orderDate} onChange={(e) => setExpectedDate(e.target.value)} /></Field>
              <Field label="Priority">
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </Select>
              </Field>
              {can('orders.view_all') && <Field label="Assign to"><EmployeeSelect value={employeeId} onChange={setEmployeeId} /></Field>}
              <Field label="Notes" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="4. Advance payment">
            {can('payments.create') ? (
              <div className="space-y-3">
                <Field label="Advance amount" error={adv > total ? 'Advance cannot exceed the total.' : undefined}>
                  <MoneyInput value={advance} onChange={setAdvance} placeholder="0" />
                </Field>
                {adv > 0 && (
                  <>
                    <Field label="Payment mode" required><PaymentModeSelect value={mode || settings?.paymentModes[0] || ''} onChange={setMode} /></Field>
                    <Field label="Transaction number"><Input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="UPI / bank reference" /></Field>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">You do not have permission to record payments.</p>
            )}
          </Card>
          <Card title="Summary">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Total</dt><dd className="font-semibold tabular">{money(total)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Advance</dt><dd className="tabular text-emerald-700">{money(adv)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-medium">Balance</dt><dd className="text-lg font-semibold tabular text-amber-700">{money(Math.max(total - adv, 0))}</dd></div>
            </dl>
            <Button className="mt-4 w-full" loading={save.isPending} disabled={adv > total || (!customer.customerId && !customer.newCustomer)} onClick={() => save.mutate(undefined, { onSuccess: (r: any) => navigate(`/orders/${r.order.id}`) })}>
              Create order
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
