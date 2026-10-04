/** Round to 2 decimals, avoiding binary floating point drift. */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function sum<T>(items: T[], pick: (item: T) => number): number {
  return round2(items.reduce((acc, it) => acc + (Number(pick(it)) || 0), 0));
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function formatINR(n: number | null | undefined, decimals = true): string {
  return (decimals ? inr : inr0).format(Number(n) || 0);
}

/** "Rs." variant for output targets whose fonts lack the rupee glyph. */
export function formatRs(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return (v < 0 ? '-' : '') + 'Rs. ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Math.abs(v));
}

/** Replaces characters the built-in PDF fonts (WinAnsi) cannot draw. */
export function pdfSafe(s: string): string {
  return s.replace(/→/g, 'to').replace(/[−–]/g, '-').replace(/₹\s?/g, 'Rs. ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}
