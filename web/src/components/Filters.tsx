import { useEffect, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { DATE_PRESETS, DATE_PRESET_LABELS, resolvePreset, type DatePreset } from '@pbms/shared';
import { useDebounced, useEmployeeOptions } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Select } from './ui';

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-end gap-2 [&>*]:min-w-[140px] [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const debounced = useDebounced(text, 350);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <div className="relative sm:!min-w-[240px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9 pr-8" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
      {text && (
        <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700" onClick={() => setText('')} aria-label="Clear search">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, allLabel = 'All' }: { label: string; value: string; onChange: (v: string) => void; options: readonly (string | { value: string; label: string })[]; allLabel?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </Select>
    </label>
  );
}

/** Employee filter, shown only to users who can see other people's work. */
export function EmployeeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { can } = useAuth();
  const { data } = useEmployeeOptions();
  if (!can('orders.view_all', 'finance.view_all')) return null;
  return <FilterSelect label="Employee" value={value} onChange={onChange} options={(data ?? []).map((e) => ({ value: e.id, label: e.name }))} />;
}

/**
 * Date range with presets (Today, Yesterday, This Week, This Month, Last Month,
 * This Year, All Time, Custom). Emits an inclusive from/to pair.
 */
export function DateRangeFilter({ from, to, onChange, allowAll = true, defaultPreset = 'this_month' }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void; allowAll?: boolean; defaultPreset?: DatePreset }) {
  const detect = (): DatePreset => {
    if (!from && !to) return allowAll ? 'all_time' : defaultPreset;
    for (const p of DATE_PRESETS) {
      if (p === 'custom' || p === 'all_time') continue;
      const r = resolvePreset(p);
      if (r.from === from && r.to === to) return p;
    }
    return 'custom';
  };
  const [preset, setPreset] = useState<DatePreset>(detect);
  useEffect(() => setPreset(detect()), [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p: DatePreset) => {
    setPreset(p);
    if (p === 'custom') return;
    if (p === 'all_time') onChange({ from: '', to: '' });
    else onChange(resolvePreset(p));
  };

  return (
    <>
      <label className="block">
        <span className="label">Period</span>
        <Select value={preset} onChange={(e) => choose(e.target.value as DatePreset)}>
          {DATE_PRESETS.filter((p) => allowAll || p !== 'all_time').map((p) => (
            <option key={p} value={p}>
              {DATE_PRESET_LABELS[p]}
            </option>
          ))}
        </Select>
      </label>
      {preset === 'custom' && (
        <>
          <label className="block">
            <span className="label">From</span>
            <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to: to || e.target.value })} />
          </label>
          <label className="block">
            <span className="label">To</span>
            <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => onChange({ from: from || e.target.value, to: e.target.value })} />
          </label>
        </>
      )}
    </>
  );
}
