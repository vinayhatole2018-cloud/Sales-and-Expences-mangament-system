import { Plus, Trash2 } from 'lucide-react';
import { round2, SERVICE_CATEGORIES } from '@pbms/shared';
import { useServices } from '../lib/hooks';
import { money } from '../lib/format';
import { Button, Input, MoneyInput, Select } from './ui';

export interface ItemRow {
  serviceId: string;
  serviceName: string;
  category: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxPercent: string;
}

export const emptyItem = (): ItemRow => ({ serviceId: '', serviceName: '', category: 'Other', description: '', quantity: '1', unitPrice: '', discount: '0', taxPercent: '0' });

export function itemAmount(it: ItemRow) {
  const gross = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
  const taxable = Math.max(gross - (Number(it.discount) || 0), 0);
  return round2(taxable * (1 + (Number(it.taxPercent) || 0) / 100));
}

export function toPayload(items: ItemRow[]) {
  return items.map((it) => ({
    serviceId: it.serviceId,
    serviceName: it.serviceName,
    category: it.category,
    description: it.description,
    quantity: Number(it.quantity) || 0,
    unitPrice: Number(it.unitPrice) || 0,
    discount: Number(it.discount) || 0,
    taxPercent: Number(it.taxPercent) || 0,
  }));
}

export function fromOrderItems(items: any[]): ItemRow[] {
  return items.map((i) => ({
    serviceId: i.serviceId ?? '',
    serviceName: i.serviceName,
    category: i.category,
    description: i.description ?? '',
    quantity: String(i.quantity),
    unitPrice: String(i.unitPrice),
    discount: String(i.discount ?? 0),
    taxPercent: String(i.taxPercent ?? 0),
  }));
}

/**
 * Service line items. Choosing a catalogue service loads its default price;
 * the server recalculates every amount on save — these figures are a preview.
 */
export function OrderItemsEditor({ items, onChange, showTax }: { items: ItemRow[]; onChange: (items: ItemRow[]) => void; showTax?: boolean }) {
  const { data: services } = useServices();
  const active = (services?.items ?? []).filter((s: any) => s.status === 'Active');
  const update = (i: number, patch: Partial<ItemRow>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const pickService = (i: number, id: string) => {
    const s = active.find((x: any) => x.id === id);
    if (!s) return update(i, { serviceId: '', serviceName: '' });
    update(i, { serviceId: s.id, serviceName: s.name, category: s.category, unitPrice: String(s.basePrice), taxPercent: String(s.taxPercent ?? 0) });
  };
  const total = round2(items.reduce((a, it) => a + itemAmount(it), 0));

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3">
          <div className="grid gap-2 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label className="label">Service</label>
              <Select value={it.serviceId} onChange={(e) => pickService(i, e.target.value)}>
                <option value="">Custom service…</option>
                {SERVICE_CATEGORIES.map((cat) => {
                  const list = active.filter((s: any) => s.category === cat);
                  return list.length ? (
                    <optgroup key={cat} label={cat}>
                      {list.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {money(s.basePrice)}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </Select>
            </div>
            {!it.serviceId && (
              <>
                <div className="sm:col-span-4">
                  <label className="label">Service name</label>
                  <Input value={it.serviceName} onChange={(e) => update(i, { serviceName: e.target.value })} placeholder="e.g. Proofreading" />
                </div>
                <div className="sm:col-span-3">
                  <label className="label">Category</label>
                  <Select value={it.category} onChange={(e) => update(i, { category: e.target.value })}>
                    {SERVICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </div>
              </>
            )}
            <div className={it.serviceId ? 'sm:col-span-7' : 'sm:col-span-12'}>
              <label className="label">Description / title</label>
              <Input value={it.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Paper title, book name, notes…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Qty</label>
              <Input inputMode="numeric" value={it.quantity} onChange={(e) => update(i, { quantity: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div className="sm:col-span-3">
              <label className="label">Unit price</label>
              <MoneyInput value={it.unitPrice} onChange={(v) => update(i, { unitPrice: v })} />
            </div>
            <div className="sm:col-span-3">
              <label className="label">Discount</label>
              <MoneyInput value={it.discount} onChange={(v) => update(i, { discount: v })} />
            </div>
            {showTax && (
              <div className="sm:col-span-2">
                <label className="label">Tax %</label>
                <Input inputMode="decimal" value={it.taxPercent} onChange={(e) => update(i, { taxPercent: e.target.value.replace(/[^0-9.]/g, '') })} />
              </div>
            )}
            <div className={`flex items-end justify-between gap-2 ${showTax ? 'sm:col-span-2' : 'sm:col-span-4'}`}>
              <div>
                <p className="label">Amount</p>
                <p className="py-2 text-sm font-semibold tabular">{money(itemAmount(it))}</p>
              </div>
              {items.length > 1 && (
                <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="mb-1 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => onChange([...items, emptyItem()])}>
          Add service
        </Button>
        <p className="text-sm">
          Total <span className="ml-2 text-lg font-semibold tabular">{money(total)}</span>
        </p>
      </div>
    </div>
  );
}
