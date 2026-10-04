import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Empty, Spinner } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Shown as the card title on phones. */
  primary?: boolean;
  /** Hidden in the phone card layout. */
  hideOnMobile?: boolean;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  sort?: string;
  dir?: 'asc' | 'desc';
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  empty?: ReactNode;
  footer?: ReactNode;
  rowClass?: (row: T) => string;
}

/**
 * Table on tablets/desktops, stacked cards on phones so data entry and lookup
 * stay usable on a small screen.
 */
export function DataTable<T extends Record<string, any>>({ columns, rows, loading, rowKey = (r) => r.id, onRowClick, sort, dir, onSort, empty, footer, rowClass }: Props<T>) {
  if (loading && !rows) return <Spinner />;
  if (!rows?.length) return <>{empty ?? <Empty title="No records found" message="Try changing the filters or date range." />}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const render = (c: Column<T>, r: T) => (c.cell ? c.cell(r) : (r[c.key] ?? '—'));

  return (
    <div className={clsx(loading && 'opacity-60 transition')}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={clsx(
                    'whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    c.sortable && onSort && 'cursor-pointer select-none hover:text-slate-800',
                  )}
                  onClick={() => c.sortable && onSort?.(c.key, sort === c.key && dir === 'desc' ? 'asc' : 'desc')}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sort === c.key && (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={() => onRowClick?.(r)}
                className={clsx(onRowClick && 'cursor-pointer', 'transition hover:bg-slate-50', rowClass?.(r))}
              >
                {columns.map((c) => (
                  <td key={c.key} className={clsx('px-3 py-2.5 align-middle text-slate-700', c.align === 'right' ? 'text-right tabular' : c.align === 'center' ? 'text-center' : '', c.className)}>
                    {render(c, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">{footer}</tfoot>}
        </table>
      </div>

      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} onClick={() => onRowClick?.(r)} className={clsx('px-1 py-3', onRowClick && 'cursor-pointer active:bg-slate-50', rowClass?.(r))}>
            <div className="mb-1.5 font-medium text-slate-900">{render(primary, r)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              {columns
                .filter((c) => c !== primary && !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">{c.header}</dt>
                    <dd className="truncate text-sm text-slate-700">{render(c, r)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <p className="px-1 pt-3 text-xs text-slate-500">{total} record{total === 1 ? '' : 's'}</p> : null;
  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-3 text-xs text-slate-500">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button className="rounded-md border border-slate-200 p-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2">
          Page {page} / {pages}
        </span>
        <button className="rounded-md border border-slate-200 p-1.5 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
