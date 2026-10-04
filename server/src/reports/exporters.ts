import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatDateDisplay, formatRs, pdfSafe } from '@pbms/shared';
import type { BusinessSettings } from '../lib/settings';
import type { CellKind, ReportData } from './types';

// ---------------------------------------------------------------- helpers ---

function plain(value: unknown, kind: CellKind | undefined): string | number {
  if (value === null || value === undefined) return '';
  if (kind === 'money' || kind === 'number' || kind === 'percent') return Number(value) || 0;
  if (kind === 'date') return formatDateDisplay(String(value));
  return String(value);
}

function display(value: unknown, kind: CellKind | undefined): string {
  return pdfSafe(displayRaw(value, kind));
}

function displayRaw(value: unknown, kind: CellKind | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  switch (kind) {
    case 'money':
      return formatRs(Number(value));
    case 'number':
      return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
    case 'percent':
      return `${Number(value).toFixed(1)}%`;
    case 'date':
      return formatDateDisplay(String(value));
    default:
      return String(value);
  }
}

export function reportFileName(r: ReportData, ext: string): string {
  const period = r.period.from === r.period.to ? r.period.from : `${r.period.from}_to_${r.period.to}`;
  return `${r.key}_${period}.${ext}`.replace(/[^A-Za-z0-9_.\-]/g, '_');
}

// -------------------------------------------------------------------- CSV ---

function csvCell(v: string | number): string {
  const s = String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(r: ReportData): Buffer {
  const lines: string[] = [];
  lines.push(csvCell(r.title));
  lines.push(csvCell(r.subtitle));
  for (const s of r.summary) lines.push([csvCell(s.label), csvCell(plain(s.value, s.kind))].join(','));
  lines.push('');
  lines.push(r.columns.map((c) => csvCell(c.label)).join(','));
  for (const row of r.rows) lines.push(r.columns.map((c) => csvCell(plain(row[c.key], c.kind))).join(','));
  if (r.totalsRow) lines.push(r.columns.map((c) => csvCell(plain(r.totalsRow![c.key], c.kind))).join(','));
  // BOM so Excel opens UTF-8 (₹, Indian names) correctly.
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

// ------------------------------------------------------------------- XLSX ---

export async function toXlsx(r: ReportData, settings: BusinessSettings): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.businessName;
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 0 }] });
  const ncol = Math.max(r.columns.length, 2);

  ws.mergeCells(1, 1, 1, ncol);
  ws.getCell(1, 1).value = settings.businessName;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, ncol);
  ws.getCell(2, 1).value = `${r.title} — ${r.subtitle}`;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
  ws.mergeCells(3, 1, 3, ncol);
  ws.getCell(3, 1).value = `Generated ${new Date(r.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} by ${r.generatedBy}`;
  ws.getCell(3, 1).font = { italic: true, size: 9, color: { argb: 'FF666666' } };

  let row = 5;
  for (const s of r.summary) {
    ws.getCell(row, 1).value = s.label;
    ws.getCell(row, 1).font = { bold: true };
    const c = ws.getCell(row, 2);
    c.value = plain(s.value, s.kind);
    if (s.kind === 'money') c.numFmt = '"₹"#,##0.00';
    if (s.kind === 'percent') c.numFmt = '0.0"%"';
    row += 1;
  }
  row += 1;

  const headerRow = ws.getRow(row);
  r.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { vertical: 'middle', horizontal: col.kind === 'money' || col.kind === 'number' ? 'right' : 'left' };
  });
  ws.views = [{ state: 'frozen', ySplit: row }];
  ws.autoFilter = { from: { row, column: 1 }, to: { row, column: r.columns.length } };

  const writeRow = (data: Record<string, unknown>, bold = false) => {
    row += 1;
    const xr = ws.getRow(row);
    r.columns.forEach((col, i) => {
      const cell = xr.getCell(i + 1);
      cell.value = plain(data[col.key], col.kind);
      if (col.kind === 'money') cell.numFmt = '"₹"#,##0.00';
      if (col.kind === 'percent') cell.numFmt = '0.0"%"';
      if (bold) cell.font = { bold: true };
    });
  };
  for (const data of r.rows) writeRow(data, Boolean(data.bold));
  if (r.totalsRow) writeRow(r.totalsRow, true);

  r.columns.forEach((col, i) => {
    const longest = Math.max(col.label.length, ...r.rows.slice(0, 500).map((d) => String(plain(d[col.key], col.kind)).length));
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, col.kind === 'money' ? 14 : 10), 50);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// -------------------------------------------------------------------- PDF ---

export const PDF_COLORS = { primary: '#1E40AF', text: '#111827', muted: '#6B7280', line: '#E5E7EB', zebra: '#F8FAFC' };

export function pdfHeader(doc: PDFKit.PDFDocument, settings: BusinessSettings, logo: Buffer | null, title: string, subtitle: string) {
  title = pdfSafe(title);
  subtitle = pdfSafe(subtitle);
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let x = left;
  if (logo) {
    try {
      doc.image(logo, left, doc.y, { fit: [48, 48] });
      x = left + 58;
    } catch {
      /* unsupported image format: skip logo */
    }
  }
  const top = doc.y;
  doc.fillColor(PDF_COLORS.primary).font('Helvetica-Bold').fontSize(16).text(settings.businessName, x, top, { width: width - (x - left) });
  const contact = [settings.address, settings.phone, settings.email].filter(Boolean).join('  •  ');
  if (contact) doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(8).text(contact, x, doc.y, { width: width - (x - left) });
  doc.y = Math.max(doc.y, top + 50);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor(PDF_COLORS.primary).stroke();
  doc.moveDown(0.6);
  doc.fillColor(PDF_COLORS.text).font('Helvetica-Bold').fontSize(13).text(title, left, doc.y, { width });
  doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(9).text(subtitle, { width });
  doc.moveDown(0.6);
}

function pdfFooter(doc: PDFKit.PDFDocument, note: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 28;
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7);
    doc.text(pdfSafe(note), doc.page.margins.left, bottom, { lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.width - doc.page.margins.right - 60, bottom, { width: 60, align: 'right', lineBreak: false });
    doc.page.margins.bottom = saved;
  }
}

export function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export async function toPdf(r: ReportData, settings: BusinessSettings, logo: Buffer | null): Promise<Buffer> {
  const landscape = r.columns.length > 6;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: r.title, Author: settings.businessName } });
  const out = collectPdf(doc);
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  pdfHeader(doc, settings, logo, r.title, r.subtitle);

  // Summary tiles
  if (r.summary.length) {
    const perRow = Math.min(r.summary.length, landscape ? 6 : 4);
    const tileW = (width - (perRow - 1) * 8) / perRow;
    let i = 0;
    while (i < r.summary.length) {
      const y = doc.y;
      for (let j = 0; j < perRow && i < r.summary.length; j++, i++) {
        const s = r.summary[i];
        const x = left + j * (tileW + 8);
        doc.roundedRect(x, y, tileW, 38, 4).fillAndStroke('#F1F5F9', PDF_COLORS.line);
        doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.5).text(pdfSafe(s.label.toUpperCase()), x + 8, y + 7, { width: tileW - 16, lineBreak: false, ellipsis: true });
        doc.fillColor(PDF_COLORS.text).font('Helvetica-Bold').fontSize(11).text(display(s.value, s.kind) || '0', x + 8, y + 19, { width: tileW - 16, lineBreak: false, ellipsis: true });
      }
      doc.y = y + 46;
    }
    doc.moveDown(0.4);
  }

  // Column widths: money/number narrower, text shares the rest.
  const weights = r.columns.map((c) => (c.kind === 'money' ? 1.15 : c.kind === 'number' || c.kind === 'date' ? 0.85 : c.key.match(/description|service|name|head/i) ? 1.8 : 1.1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const colW = weights.map((w) => (w / wsum) * width);
  const fontSize = r.columns.length > 9 ? 7 : 8;
  const pad = 3;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y, width, 16).fill(PDF_COLORS.primary);
    let x = left;
    r.columns.forEach((c, i) => {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(fontSize).text(pdfSafe(c.label), x + pad, y + 4, {
        width: colW[i] - pad * 2,
        align: c.kind === 'money' || c.kind === 'number' ? 'right' : 'left',
        lineBreak: false,
        ellipsis: true,
      });
      x += colW[i];
    });
    doc.y = y + 16;
  };

  const drawRow = (data: Record<string, unknown>, index: number, bold: boolean) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    const texts = r.columns.map((c) => display(data[c.key], c.kind));
    const heights = texts.map((t, i) => doc.heightOfString(t || ' ', { width: colW[i] - pad * 2 }));
    const h = Math.min(Math.max(...heights), 40) + pad * 2;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (bold) doc.rect(left, y, width, h).fill('#E0E7FF');
    else if (index % 2 === 1) doc.rect(left, y, width, h).fill(PDF_COLORS.zebra);
    let x = left;
    texts.forEach((t, i) => {
      const c = r.columns[i];
      doc.fillColor(PDF_COLORS.text).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).text(t, x + pad, y + pad, {
        width: colW[i] - pad * 2,
        height: h - pad,
        align: c.kind === 'money' || c.kind === 'number' ? 'right' : 'left',
        ellipsis: true,
      });
      x += colW[i];
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(PDF_COLORS.line).stroke();
    doc.y = y + h;
  };

  drawHeader();
  if (!r.rows.length) {
    doc.moveDown(0.5).fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(9).text('No records for this period.', left, doc.y, { width, align: 'center' });
  }
  r.rows.forEach((row, i) => drawRow(row, i, Boolean(row.bold)));
  if (r.totalsRow) drawRow(r.totalsRow, 0, true);

  pdfFooter(doc, `${settings.businessName} • ${r.title} • Generated ${new Date(r.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} by ${r.generatedBy}`);
  doc.end();
  return out;
}
