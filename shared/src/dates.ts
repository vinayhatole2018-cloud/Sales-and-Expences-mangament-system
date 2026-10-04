export const BUSINESS_TIMEZONE = 'Asia/Kolkata';

const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Business-local calendar date as YYYY-MM-DD. */
export function toYMD(d: Date = new Date()): string {
  return ymdFmt.format(d);
}

export function todayYMD(): string {
  return toYMD(new Date());
}

function ymdToUTC(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Adds days to a YYYY-MM-DD string (calendar arithmetic, timezone independent). */
export function addDays(ymd: string, days: number): string {
  return new Date(ymdToUTC(ymd) + days * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((ymdToUTC(toYmd) - ymdToUTC(fromYmd)) / 86400000);
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0');
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DATE_PRESETS = ['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'this_year', 'all_time', 'custom'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_year: 'This Year',
  all_time: 'All Time',
  custom: 'Custom Range',
};

/** Resolves a preset into an inclusive YYYY-MM-DD range in business time. */
export function resolvePreset(preset: DatePreset, now: Date = new Date()): { from: string; to: string } {
  const today = toYMD(now);
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y1 = addDays(today, -1);
      return { from: y1, to: y1 };
    }
    case 'this_week': {
      const dow = new Date(ymdToUTC(today)).getUTCDay(); // 0 = Sunday
      const offset = dow === 0 ? 6 : dow - 1; // weeks start on Monday
      return { from: addDays(today, -offset), to: today };
    }
    case 'this_month':
      return { from: monthRange(y, m).from, to: today };
    case 'last_month':
      return m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
    case 'this_year':
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: '2000-01-01', to: today };
  }
}

/** DD/MM/YYYY for display. */
export function formatDateDisplay(ymd?: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
