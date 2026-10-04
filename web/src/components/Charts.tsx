import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { money, moneyShort } from '../lib/format';
import { Empty } from './ui';

/*
 * Chart conventions (validated reference palette, fixed order):
 * an entity always keeps its colour — Sales blue, Expenses orange,
 * Collection aqua, Profit violet — thin 2px lines, rounded bar ends,
 * recessive grid, hover tooltips, and a table view for every chart.
 */
export const COLORS = {
  sales: '#2a78d6',
  expenses: '#eb6834',
  collection: '#1baf7a',
  pending: '#eda100',
  profit: '#4a3aa7',
};
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const INK = { muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', text: '#0b0b0b', secondary: '#52514e' };

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

export function ChartCard({ title, subtitle, children, table, className }: { title: string; subtitle?: string; children: ReactNode; table?: { columns: string[]; rows: (string | number)[][] }; className?: string }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`card p-4 ${className ?? ''}`}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {table && (
          <button
            onClick={() => setShowTable((v) => !v)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={showTable ? 'Show chart' : 'Show table'}
            title={showTable ? 'Show chart' : 'Show table'}
          >
            {showTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
          </button>
        )}
      </header>
      {showTable && table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200">
                {table.columns.map((c, i) => (
                  <th key={c} className={`px-2 py-1.5 font-semibold text-slate-500 ${i ? 'text-right' : 'text-left'}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50">
                  {r.map((v, j) => (
                    <td key={j} className={`px-2 py-1 ${j ? 'text-right tabular' : ''}`}>
                      {typeof v === 'number' ? money(v) : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-4 text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular font-medium text-slate-900">{money(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Change over time. One y-axis only; all series share the rupee scale. */
export function TrendChart({ data, series, height = 260 }: { data: Record<string, any>[]; series: SeriesDef[]; height?: number }) {
  if (!data.length) return <Empty title="No data for this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.grid} strokeDasharray="0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={{ stroke: INK.axis }} minTickGap={16} />
        <YAxis tickFormatter={moneyShort} tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<MoneyTooltip />} cursor={{ stroke: INK.axis, strokeWidth: 1 }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK.secondary }} />}
        {series.map((s) => (
          <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={data.length <= 16 ? { r: 3, strokeWidth: 0, fill: s.color } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Side-by-side columns for comparing a few measures across categories. */
export function GroupedBars({ data, series, height = 260, categoryKey = 'name' }: { data: Record<string, any>[]; series: SeriesDef[]; height?: number; categoryKey?: string }) {
  if (!data.length) return <Empty title="No data for this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey={categoryKey} tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={{ stroke: INK.axis }} interval={0} tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 11) + '…' : v)} />
        <YAxis tickFormatter={moneyShort} tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK.secondary }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Ranked horizontal bars as plain HTML: exact values printed in ink next to
 * each bar, readable on phones, and accessible without hover.
 */
export function BarList({ data, color = COLORS.sales, format = money, max: maxItems = 8, emptyTitle = 'No data for this period' }: { data: { name: string; value: number; hint?: string }[]; color?: string; format?: (n: number) => string; max?: number; emptyTitle?: string }) {
  const items = data.filter((d) => d.value !== 0).slice(0, maxItems);
  if (!items.length) return <Empty title={emptyTitle} />;
  const max = Math.max(...items.map((d) => Math.abs(d.value)), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((d) => (
        <li key={d.name} title={`${d.name}: ${format(d.value)}${d.hint ? ` — ${d.hint}` : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-slate-700">{d.name}</span>
            <span className="shrink-0 tabular font-medium text-slate-900">{format(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max((Math.abs(d.value) / max) * 100, 2)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
