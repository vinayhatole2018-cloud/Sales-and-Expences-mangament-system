export type CellKind = 'text' | 'money' | 'number' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  kind?: CellKind;
}

export interface SummaryItem {
  label: string;
  value: number | string;
  kind: CellKind;
}

export interface ReportData {
  key: string;
  title: string;
  subtitle: string;
  period: { from: string; to: string };
  generatedAt: string;
  generatedBy: string;
  summary: SummaryItem[];
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totalsRow?: Record<string, unknown>;
  /** Optional chart data for on-screen display. */
  charts?: Record<string, { name: string; value: number }[] | Record<string, unknown>[]>;
}
