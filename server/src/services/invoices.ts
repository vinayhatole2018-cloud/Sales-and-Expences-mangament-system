import PDFDocument from 'pdfkit';
import { formatDateDisplay, formatRs, pdfSafe, todayYMD } from '@pbms/shared';
import { db, COL } from '../firebase';
import type { Ctx } from '../lib/context';
import { badRequest, notFound } from '../lib/errors';
import { allocIds } from '../lib/ids';
import { writeAudit } from '../lib/audit';
import { fetchAll, fetchDoc, nowIso, type Doc } from '../lib/list';
import { getSettings } from '../lib/settings';
import { assertViewOrder, type OrderDoc } from './orders';
import { collectPdf, PDF_COLORS } from '../reports/exporters';
import { loadImage } from '../routes/attachments';

/**
 * Creates the invoice for an order, or refreshes its paid/balance figures if
 * it already exists (the invoice number and date never change).
 */
export async function generateInvoice(ctx: Ctx, orderId: string) {
  const settings = await getSettings();
  const pre = await fetchDoc(COL.orders, orderId);
  if (!pre) throw notFound('Order');
  assertViewOrder(ctx, pre as unknown as OrderDoc);
  const [customer, payments] = await Promise.all([
    fetchDoc(COL.customers, pre.customerId),
    fetchAll(COL.payments, { where: ['orderId', '==', orderId] }),
  ]);
  const validPayments = payments.filter((p) => !p.voided).sort((a, b) => a.date.localeCompare(b.date));

  return db.runTransaction(async (tx) => {
    const oSnap = await tx.get(db.collection(COL.orders).doc(orderId));
    const order = oSnap.data() as OrderDoc;
    if (order.deleted) throw badRequest('This order has been deleted.');
    if (order.status === 'Cancelled') throw badRequest('Cannot invoice a cancelled order.');
    const existing = order.invoiceId ? await tx.get(db.collection(COL.invoices).doc(order.invoiceId)) : null;
    const ids = existing?.exists ? null : await allocIds(tx, { invoice: 1 });

    const now = nowIso();
    const ref = existing?.exists ? existing.ref : db.collection(COL.invoices).doc();
    const prev = existing?.exists ? (existing.data() as Doc) : null;
    const invoice = {
      id: ref.id,
      invoiceNo: prev?.invoiceNo ?? ids!.next('invoice'),
      invoiceDate: prev?.invoiceDate ?? todayYMD(),
      orderId: order.id,
      orderNo: order.orderNo,
      orderDate: order.orderDate,
      customer: {
        id: order.customerId,
        customerNo: order.customerNo,
        name: order.customerName,
        mobile: order.customerMobile,
        email: order.customerEmail,
        address: [customer?.address, customer?.city, customer?.state].filter(Boolean).join(', '),
        college: order.collegeName,
      },
      business: {
        name: settings.businessName,
        tagline: settings.tagline,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        website: settings.website,
        gstin: settings.gstEnabled ? settings.gstin : '',
        logoAttachmentId: settings.logoAttachmentId,
      },
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discountTotal,
      tax: order.taxTotal,
      total: order.totalAmount,
      paid: order.paidAmount,
      balance: order.balance,
      paymentStatus: order.paymentStatus,
      paymentMode: order.lastPaymentMode,
      txnNumber: order.lastTxnNumber,
      payments: validPayments.map((p) => ({ date: p.date, paymentNo: p.paymentNo, type: p.type, mode: p.mode, txnNumber: p.txnNumber, amount: p.type === 'Refund' ? -p.amount : p.amount })),
      terms: settings.invoiceTerms,
      signatory: settings.authorizedSignatory,
      employeeName: order.employeeName,
      version: (prev?.version ?? 0) + 1,
      createdAt: prev?.createdAt ?? now,
      createdBy: prev?.createdBy ?? ctx.user.uid,
      updatedAt: now,
      updatedBy: ctx.user.uid,
    };
    ids?.commit();
    tx.set(ref, invoice);
    if (!prev) tx.update(oSnap.ref, { invoiceId: ref.id });
    writeAudit(tx, ctx, {
      action: prev ? 'invoice_refresh' : 'invoice_create',
      module: 'invoices',
      recordId: ref.id,
      recordLabel: invoice.invoiceNo,
      message: `${ctx.user.name} ${prev ? 'refreshed' : 'generated'} invoice ${invoice.invoiceNo} for ${order.orderNo} (total ${formatRs(invoice.total)}, balance ${formatRs(invoice.balance)}).`,
    });
    return invoice;
  });
}

export async function getInvoiceForViewer(ctx: Ctx, id: string) {
  const inv = await fetchDoc(COL.invoices, id);
  if (!inv) throw notFound('Invoice');
  const order = await fetchDoc(COL.orders, inv.orderId);
  if (!order) throw notFound('Order');
  assertViewOrder(ctx, order as unknown as OrderDoc);
  return inv;
}

export async function invoicePdf(inv: Doc): Promise<Buffer> {
  const settings = await getSettings();
  const logo = await loadImage(inv.business?.logoAttachmentId ?? settings.logoAttachmentId);
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${inv.invoiceNo}`, Author: inv.business.name } });
  const out = collectPdf(doc);
  const left = 40;
  const width = doc.page.width - 80;
  const right = left + width;

  // Header: business
  let textX = left;
  if (logo) {
    try {
      doc.image(logo, left, 40, { fit: [60, 60] });
      textX = left + 70;
    } catch {
      /* ignore bad logo */
    }
  }
  doc.fillColor(PDF_COLORS.primary).font('Helvetica-Bold').fontSize(18).text(inv.business.name, textX, 42, { width: 300 });
  doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(8.5);
  for (const line of [inv.business.tagline, inv.business.address, [inv.business.phone, inv.business.email].filter(Boolean).join('  •  '), inv.business.gstin ? `GSTIN: ${inv.business.gstin}` : '']) {
    if (line) doc.text(line, textX, doc.y, { width: 300 });
  }
  doc.fillColor(PDF_COLORS.text).font('Helvetica-Bold').fontSize(22).text('INVOICE', right - 200, 42, { width: 200, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(PDF_COLORS.muted);
  const meta: [string, string][] = [
    ['Invoice No.', inv.invoiceNo],
    ['Invoice Date', formatDateDisplay(inv.invoiceDate)],
    ['Order ID', inv.orderNo],
    ['Order Date', formatDateDisplay(inv.orderDate)],
  ];
  let my = 72;
  for (const [k, v] of meta) {
    doc.fillColor(PDF_COLORS.muted).text(k, right - 200, my, { width: 90 });
    doc.fillColor(PDF_COLORS.text).font('Helvetica-Bold').text(v, right - 110, my, { width: 110, align: 'right' });
    doc.font('Helvetica');
    my += 13;
  }

  // Bill to
  let y = Math.max(doc.y, my) + 18;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(PDF_COLORS.line).lineWidth(1).stroke();
  y += 10;
  doc.fillColor(PDF_COLORS.muted).font('Helvetica-Bold').fontSize(8).text('BILL TO', left, y);
  doc.fillColor(PDF_COLORS.text).font('Helvetica-Bold').fontSize(11).text(inv.customer.name, left, y + 12);
  doc.font('Helvetica').fontSize(9);
  for (const line of [inv.customer.college, inv.customer.address, inv.customer.mobile && `Mobile: ${inv.customer.mobile}`, inv.customer.email && `Email: ${inv.customer.email}`, inv.customer.customerNo && `Customer ID: ${inv.customer.customerNo}`]) {
    if (line) doc.text(pdfSafe(line), left, doc.y, { width: 300 });
  }
  const billEnd = doc.y;
  const statusColor = inv.balance > 0 ? '#B45309' : '#15803D';
  doc.roundedRect(right - 120, y + 8, 120, 26, 4).fill(inv.balance > 0 ? '#FEF3C7' : '#DCFCE7');
  doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(10).text(inv.balance > 0 ? `BALANCE DUE` : 'PAID IN FULL', right - 120, y + 17, { width: 120, align: 'center' });

  // Items table
  y = Math.max(billEnd, y + 40) + 16;
  const cols = [
    { label: '#', w: 24, align: 'left' as const },
    { label: 'Service / Description', w: width - 24 - 40 - 75 - 65 - 85, align: 'left' as const },
    { label: 'Qty', w: 40, align: 'right' as const },
    { label: 'Price', w: 75, align: 'right' as const },
    { label: 'Discount', w: 65, align: 'right' as const },
    { label: 'Amount', w: 85, align: 'right' as const },
  ];
  doc.rect(left, y, width, 20).fill(PDF_COLORS.primary);
  let x = left;
  for (const c of cols) {
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9).text(c.label, x + 5, y + 6, { width: c.w - 10, align: c.align });
    x += c.w;
  }
  y += 20;
  inv.items.forEach((it: Doc, i: number) => {
    const desc = it.description ? `${it.serviceName}\n${it.description}` : it.serviceName;
    doc.font('Helvetica').fontSize(9);
    const h = Math.max(doc.heightOfString(desc, { width: cols[1].w - 10 }), 12) + 10;
    if (i % 2 === 1) doc.rect(left, y, width, h).fill(PDF_COLORS.zebra);
    const vals = [String(i + 1), desc, String(it.quantity), formatRs(it.unitPrice), it.discount ? formatRs(it.discount) : '—', formatRs(it.amount)];
    x = left;
    vals.forEach((v, j) => {
      doc.fillColor(PDF_COLORS.text).font(j === 5 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(v, x + 5, y + 5, { width: cols[j].w - 10, align: cols[j].align });
      x += cols[j].w;
    });
    y += h;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(PDF_COLORS.line).lineWidth(0.5).stroke();
  });

  // Totals
  y += 10;
  const tRows: [string, string, boolean?][] = [
    ['Subtotal', formatRs(inv.subtotal)],
    ...(inv.discount ? [['Discount', `- ${formatRs(inv.discount)}`] as [string, string]] : []),
    ...(inv.tax ? [['Tax', formatRs(inv.tax)] as [string, string]] : []),
    ['Total', formatRs(inv.total), true],
    ['Paid', formatRs(inv.paid)],
    ['Balance', formatRs(inv.balance), true],
  ];
  const tx0 = right - 220;
  for (const [k, v, bold] of tRows) {
    if (bold) doc.rect(tx0, y - 3, 220, 18).fill('#EEF2FF');
    doc.fillColor(PDF_COLORS.text).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(k, tx0 + 8, y, { width: 100 });
    doc.text(v, tx0 + 100, y, { width: 112, align: 'right' });
    y += 18;
  }

  // Payment details (left of totals)
  let py = y - tRows.length * 18;
  doc.fillColor(PDF_COLORS.muted).font('Helvetica-Bold').fontSize(8).text('PAYMENT DETAILS', left, py);
  py += 12;
  doc.font('Helvetica').fontSize(8.5).fillColor(PDF_COLORS.text);
  if (!inv.payments.length) doc.text('No payments received yet.', left, py);
  for (const p of inv.payments.slice(0, 8)) {
    doc.text(`${formatDateDisplay(p.date)}  ${p.type}  ${p.mode}${p.txnNumber ? ` (${p.txnNumber})` : ''}  ${formatRs(p.amount)}`, left, py, { width: width - 240 });
    py = doc.y + 2;
  }

  // Terms and signature
  y = Math.max(y, py) + 24;
  if (y > doc.page.height - 170) {
    doc.addPage();
    y = 50;
  }
  doc.fillColor(PDF_COLORS.muted).font('Helvetica-Bold').fontSize(8).text('TERMS & CONDITIONS', left, y);
  doc.fillColor(PDF_COLORS.text).font('Helvetica').fontSize(8.5).text(pdfSafe(inv.terms || '-'), left, y + 12, { width: width - 200 });
  const sy = y + 50;
  doc.moveTo(right - 170, sy).lineTo(right, sy).strokeColor(PDF_COLORS.text).lineWidth(0.7).stroke();
  doc.fillColor(PDF_COLORS.text).font('Helvetica-Bold').fontSize(9).text(inv.signatory || 'Authorized Signatory', right - 170, sy + 5, { width: 170, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor(PDF_COLORS.muted).text(`For ${inv.business.name}`, right - 170, sy + 17, { width: 170, align: 'center' });

  doc.fillColor(PDF_COLORS.muted).fontSize(7.5).text(`Thank you for your business. Prepared by ${inv.employeeName || inv.business.name}.`, left, doc.page.height - 55, { width, align: 'center', lineBreak: false });
  doc.end();
  return out;
}
