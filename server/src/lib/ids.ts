import type { Transaction } from 'firebase-admin/firestore';
import { MODULE_LIST, todayYMD } from '@pbms/shared';
import { db, COL } from '../firebase';
import { getSettings } from './settings';

/*
 * Human readable, sequential record numbers such as ORD-2026-00001.
 * Sequences are stored in `counters/{key}-{year}` and advanced inside the same
 * Firestore transaction that creates the records, so numbers are never reused.
 */

const FIXED_PREFIXES: Record<string, string> = {
  customer: 'CUS',
  college: 'COL',
  conference: 'CONF',
  service: 'SRV',
  sale: 'SAL',
  payment: 'PAY',
  expense: 'EXP',
  txn: 'TXN',
  ...Object.fromEntries(MODULE_LIST.map((m) => [m.key, m.prefix])),
};

async function prefixFor(key: string): Promise<string> {
  if (key === 'order' || key === 'invoice') {
    const s = await getSettings();
    return (key === 'order' ? s.orderPrefix : s.invoicePrefix) || key.toUpperCase().slice(0, 3);
  }
  const p = FIXED_PREFIXES[key];
  if (!p) throw new Error(`Unknown id key: ${key}`);
  return p;
}

export interface IdAllocation {
  /** Next number for a key (call as many times as requested). */
  next(key: string): string;
  /** Queue the counter writes. Call during the transaction's write phase. */
  commit(): void;
}

/**
 * Reserves record numbers. Performs transaction READS only; call `commit()`
 * after all other reads are done.
 */
export async function allocIds(tx: Transaction, wants: Record<string, number>): Promise<IdAllocation> {
  const year = todayYMD().slice(0, 4);
  const keys = Object.keys(wants).filter((k) => wants[k] > 0);
  const refs = keys.map((k) => db.collection(COL.counters).doc(`${k}-${year}`));
  const snaps = refs.length ? await tx.getAll(...refs) : [];
  const prefixes = await Promise.all(keys.map(prefixFor));

  const state = keys.map((k, i) => ({
    key: k,
    ref: refs[i],
    prefix: prefixes[i],
    start: Number(snaps[i].get('seq') ?? 0),
    used: 0,
    max: wants[k],
  }));

  let committed = false;
  return {
    next(key: string) {
      // Numbers taken after commit() would never be saved and would repeat.
      if (committed) throw new Error(`Id allocated after commit: ${key}`);
      const s = state.find((x) => x.key === key);
      if (!s) throw new Error(`Id key not reserved: ${key}`);
      if (s.used >= s.max) throw new Error(`Id key exhausted: ${key}`);
      s.used += 1;
      return `${s.prefix}-${year}-${String(s.start + s.used).padStart(5, '0')}`;
    },
    commit() {
      committed = true;
      for (const s of state) if (s.used > 0) tx.set(s.ref, { seq: s.start + s.used, key: s.key, year }, { merge: true });
    },
  };
}

/** Convenience wrapper for single, standalone record numbers. */
export async function nextId(key: string): Promise<string> {
  return db.runTransaction(async (tx) => {
    const a = await allocIds(tx, { [key]: 1 });
    const id = a.next(key);
    a.commit();
    return id;
  });
}
