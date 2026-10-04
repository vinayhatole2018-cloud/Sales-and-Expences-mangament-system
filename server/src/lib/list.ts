import type { Query } from 'firebase-admin/firestore';
import { db } from '../firebase';
import type { ListQuery } from './validation';

/*
 * Listing strategy: Firestore queries are kept to a single range filter
 * (typically on a YYYY-MM-DD date field) so no composite indexes are needed.
 * Remaining filters, text search, sorting and pagination run in memory. This
 * is fast and cheap at the scale of a single business (tens of thousands of
 * records). See docs/ARCHITECTURE.md for the scaling path.
 */

export interface Doc {
  id: string;
  [key: string]: any;
}

export async function fetchAll(
  collection: string,
  opts: { dateField?: string; from?: string; to?: string; where?: [string, FirebaseFirestore.WhereFilterOp, unknown] } = {},
): Promise<Doc[]> {
  let q: Query = db.collection(collection);
  if (opts.where) q = q.where(...opts.where);
  if (opts.dateField && opts.from) q = q.where(opts.dateField, '>=', opts.from);
  if (opts.dateField && opts.to) q = q.where(opts.dateField, '<=', opts.to);
  const snap = await q.get();
  return snap.docs.map((d) => ({ ...(d.data() as Record<string, any>), id: d.id }));
}

export async function fetchDoc(collection: string, id: string): Promise<Doc | null> {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? ({ ...(snap.data() as Record<string, any>), id: snap.id } as Doc) : null;
}

export function matchesSearch(item: Record<string, any>, fields: string[], search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return fields.some((f) => {
    const v = item[f];
    return v !== undefined && v !== null && String(v).toLowerCase().includes(needle);
  });
}

export function sortItems<T extends Record<string, any>>(items: T[], sort: string, dir: 'asc' | 'desc', fallback: string): T[] {
  const key = sort || fallback;
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === undefined || av === null || av === '') return 1;
    if (bv === undefined || bv === null || bv === '') return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
    return String(av).localeCompare(String(bv), 'en', { numeric: true }) * mul;
  });
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paginate<T>(items: T[], q: Pick<ListQuery, 'page' | 'pageSize'>): Page<T> {
  const start = (q.page - 1) * q.pageSize;
  return { items: items.slice(start, start + q.pageSize), total: items.length, page: q.page, pageSize: q.pageSize };
}

/** Applies search, sort and paginate in one go. */
export function listResponse<T extends Record<string, any>>(
  items: T[],
  q: ListQuery,
  searchFields: string[],
  defaultSort: string,
  extra: Record<string, unknown> = {},
): Page<T> & Record<string, unknown> {
  const filtered = items.filter((i) => matchesSearch(i, searchFields, q.search));
  return { ...paginate(sortItems(filtered, q.sort, q.dir, defaultSort), q), ...extra };
}

/** Timestamp for createdAt/updatedAt fields. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function pick<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}
