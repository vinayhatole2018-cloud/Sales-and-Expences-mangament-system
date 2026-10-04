import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  getModule,
  orderStatusForModuleStatus,
  NOTIFICATION_TYPES,
  ORDER_STATUSES,
  PAYMENT_TYPES,
  PRIORITIES,
  SERVICE_CATEGORIES,
  formatINR,
  round2,
  todayYMD,
  type ModuleDef,
  type OrderStatus,
  type PaymentStatus,
  type PaymentType,
} from '@pbms/shared';
import { db, COL } from '../firebase';
import { can, assertCan, type Ctx } from '../lib/context';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { allocIds } from '../lib/ids';
import { writeAudit, diff, describeChanges, type Writer } from '../lib/audit';
import { queueNotifications } from '../lib/notify';
import { getSettings } from '../lib/settings';
import { getUser, usersWithPermission } from '../lib/directory';
import { nowIso, type Doc } from '../lib/list';
import {
  zCount,
  zDate,
  zMoney,
  zOptionalDate,
  zOptionalEmail,
  zOptionalText,
  zPositiveMoney,
  zRequiredText,
  zMobile,
  zTxnNumber,
} from '../lib/validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderItem {
  serviceId: string;
  serviceName: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxPercent: number;
  taxAmount: number;
  amount: number;
}

export interface OrderDoc {
  id: string;
  orderNo: string;
  customerId: string;
  customerNo: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  collegeId: string;
  collegeName: string;
  items: OrderItem[];
  serviceSummary: string;
  category: string;
  module: string;
  moduleRecordId: string;
  moduleRecordNo: string;
  employeeId: string;
  employeeName: string;
  orderDate: string;
  expectedDate: string;
  priority: string;
  status: OrderStatus;
  notes: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  totalAmount: number;
  /** Amount billed to the customer: the total, or 0 when cancelled. */
  billedAmount: number;
  advanceAmount: number;
  /** Net amount received (payments minus refunds). */
  paidAmount: number;
  refundedAmount: number;
  balance: number;
  refundDue: number;
  paymentStatus: PaymentStatus;
  paymentCount: number;
  lastPaymentDate: string;
  lastPaymentMode: string;
  lastTxnNumber: string;
  saleId: string;
  saleNo: string;
  invoiceId: string;
  completedAt: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt: string;
  updatedBy: string;
  deleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const zTaxPercent = z.coerce.number().min(0, 'Tax cannot be negative.').max(100, 'Tax cannot exceed 100%.').default(0);

export const itemInput = z.object({
  serviceId: z.string().trim().max(128).optional().default(''),
  serviceName: zRequiredText('Service', 150),
  category: z.enum(SERVICE_CATEGORIES, { errorMap: () => ({ message: 'Select a valid service category.' }) }),
  description: zOptionalText(300),
  quantity: zCount.refine((n) => n >= 1, 'Quantity must be at least 1.'),
  unitPrice: zMoney,
  discount: zMoney.optional().default(0),
  taxPercent: zTaxPercent,
});
export type ItemInput = z.infer<typeof itemInput>;

export const newCustomerInput = z.object({
  name: zRequiredText('Customer name', 120),
  mobile: zMobile,
  email: zOptionalEmail,
  collegeId: z.string().trim().max(128).optional().default(''),
  collegeName: zOptionalText(200),
  customerType: zOptionalText(40),
});

export const advanceInput = z.object({
  amount: zMoney,
  mode: zOptionalText(40),
  txnNumber: zTxnNumber,
  date: zOptionalDate,
});

export const createOrderInput = z.object({
  customerId: z.string().trim().max(128).optional().default(''),
  newCustomer: newCustomerInput.optional(),
  items: z.array(itemInput).min(1, 'Add at least one service.').max(50),
  employeeId: z.string().trim().max(128).optional().default(''),
  orderDate: zDate,
  expectedDate: zOptionalDate,
  priority: z.enum(PRIORITIES).optional().default('Normal'),
  notes: zOptionalText(2000),
  advance: advanceInput.optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderInput>;

export const updateOrderInput = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  expectedDate: zOptionalDate.optional(),
  notes: zOptionalText(2000).optional(),
  employeeId: z.string().trim().max(128).optional(),
  items: z.array(itemInput).min(1).max(50).optional(),
  reason: zOptionalText(500),
});
export type UpdateOrderInput = z.infer<typeof updateOrderInput>;

export const paymentInput = z.object({
  orderId: z.string().trim().min(1, 'Select an order.'),
  amount: zPositiveMoney,
  date: zDate,
  mode: zRequiredText('Payment mode', 40),
  txnNumber: zTxnNumber,
  type: z.enum(PAYMENT_TYPES).optional(),
  remarks: zOptionalText(500),
});
export type PaymentInput = z.infer<typeof paymentInput>;

// ---------------------------------------------------------------------------
// Pure calculations
// ---------------------------------------------------------------------------

export function priceItems(items: ItemInput[]) {
  const priced: OrderItem[] = items.map((it) => {
    const gross = round2(it.quantity * it.unitPrice);
    if (it.discount > gross) throw badRequest(`Discount on "${it.serviceName}" cannot exceed its amount (${formatINR(gross)}).`);
    const taxable = round2(gross - it.discount);
    const taxAmount = round2((taxable * it.taxPercent) / 100);
    return {
      serviceId: it.serviceId ?? '',
      serviceName: it.serviceName,
      category: it.category,
      description: it.description ?? '',
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount,
      taxPercent: it.taxPercent,
      taxAmount,
      amount: round2(taxable + taxAmount),
    };
  });
  const subtotal = round2(priced.reduce((a, i) => a + i.quantity * i.unitPrice, 0));
  const discountTotal = round2(priced.reduce((a, i) => a + i.discount, 0));
  const taxTotal = round2(priced.reduce((a, i) => a + i.taxAmount, 0));
  const total = round2(priced.reduce((a, i) => a + i.amount, 0));
  return { items: priced, subtotal, discountTotal, taxTotal, total };
}

/** Recomputes every derived money field of an order. The single source of truth for balances. */
export function deriveFinancials<T extends Pick<OrderDoc, 'totalAmount' | 'paidAmount' | 'refundedAmount' | 'status'>>(o: T) {
  const billedAmount = o.status === 'Cancelled' ? 0 : round2(o.totalAmount);
  const paid = round2(o.paidAmount);
  const balance = round2(Math.max(billedAmount - paid, 0));
  const refundDue = round2(Math.max(paid - billedAmount, 0));
  let paymentStatus: PaymentStatus;
  if (refundDue > 0) paymentStatus = 'Refund Pending';
  else if (paid === 0) paymentStatus = o.refundedAmount > 0 ? 'Refunded' : billedAmount === 0 && o.status !== 'Cancelled' ? 'Paid' : 'Unpaid';
  else if (balance === 0) paymentStatus = 'Paid';
  else paymentStatus = 'Partial';
  return { billedAmount, paidAmount: paid, balance, refundDue, paymentStatus };
}

async function checkDiscountAuthority(ctx: Ctx, items: OrderItem[]) {
  if (can(ctx, 'orders.edit_amount')) return;
  const { maxEmployeeDiscountPercent } = await getSettings();
  for (const it of items) {
    const gross = it.quantity * it.unitPrice;
    if (gross > 0 && (it.discount / gross) * 100 > maxEmployeeDiscountPercent + 1e-9) {
      throw forbidden(`Discounts above ${maxEmployeeDiscountPercent}% need manager approval.`);
    }
  }
}

function serviceSummary(items: OrderItem[]) {
  return items.map((i) => (i.quantity > 1 ? `${i.serviceName} ×${i.quantity}` : i.serviceName)).join(', ');
}

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

export function canViewOrder(ctx: Ctx, o: Pick<OrderDoc, 'employeeId' | 'createdBy'>): boolean {
  return can(ctx, 'orders.view_all') || o.employeeId === ctx.user.uid || o.createdBy === ctx.user.uid;
}

export function assertViewOrder(ctx: Ctx, o: Pick<OrderDoc, 'employeeId' | 'createdBy'>) {
  if (!canViewOrder(ctx, o)) throw forbidden();
}

async function resolveEmployee(ctx: Ctx, employeeId: string | undefined) {
  const id = employeeId || ctx.user.uid;
  if (id !== ctx.user.uid && !can(ctx, 'orders.view_all')) throw forbidden('You can only assign orders to yourself.');
  if (id === 'system') return { id, name: ctx.user.name };
  const u = await getUser(id);
  if (!u || u.deleted) throw badRequest('Selected employee does not exist.');
  if (u.status !== 'Active') throw badRequest(`${u.name} is ${u.status.toLowerCase()} and cannot be assigned work.`);
  return { id: u.id, name: u.name };
}

async function assertPaymentMode(mode: string) {
  if (!mode) return;
  const { paymentModes } = await getSettings();
  if (!paymentModes.includes(mode)) throw badRequest(`Unknown payment mode "${mode}".`);
}

async function assertTxnNumberUnique(tx: Transaction, txnNumber: string) {
  if (!txnNumber) return;
  const dup = await tx.get(db.collection(COL.payments).where('txnNumber', '==', txnNumber).limit(5));
  if (dup.docs.some((d) => !d.get('voided'))) throw conflict(`Transaction number ${txnNumber} already exists.`);
}

// ---------------------------------------------------------------------------
// Write helpers (write phase only)
// ---------------------------------------------------------------------------

function saleFromOrder(o: OrderDoc) {
  const qty = o.items.reduce((a, i) => a + i.quantity, 0);
  return {
    id: o.saleId,
    saleNo: o.saleNo,
    date: o.orderDate,
    orderId: o.id,
    orderNo: o.orderNo,
    customerId: o.customerId,
    customerName: o.customerName,
    customerMobile: o.customerMobile,
    employeeId: o.employeeId,
    employeeName: o.employeeName,
    serviceName: o.serviceSummary,
    category: o.category,
    module: o.module,
    quantity: qty,
    unitPrice: o.items.length === 1 ? o.items[0].unitPrice : round2(o.subtotal / Math.max(qty, 1)),
    subtotal: o.subtotal,
    discount: o.discountTotal,
    tax: o.taxTotal,
    totalAmount: o.totalAmount,
    billedAmount: o.billedAmount,
    advanceAmount: o.advanceAmount,
    paidAmount: o.paidAmount,
    balance: o.balance,
    paymentStatus: o.paymentStatus,
    paymentMode: o.lastPaymentMode,
    txnNumber: o.lastTxnNumber,
    remarks: o.notes,
    orderStatus: o.status,
    collegeId: o.collegeId,
    collegeName: o.collegeName,
    createdAt: o.createdAt,
    createdBy: o.createdBy,
    updatedAt: o.updatedAt,
    deleted: o.deleted,
  };
}

function contribution(o: OrderDoc | null) {
  if (!o || o.deleted) return { billed: 0, paid: 0, balance: 0, count: 0 };
  return { billed: o.billedAmount, paid: o.paidAmount, balance: o.balance, count: 1 };
}

function queueLedger(
  w: Writer,
  ctx: Ctx,
  e: {
    type: 'Sale' | 'Payment' | 'Refund' | 'Expense' | 'Adjustment';
    amount: number;
    date: string;
    description: string;
    order?: OrderDoc;
    refId?: string;
    refNo?: string;
    paymentMode?: string;
    txnNumber?: string;
    employeeId?: string;
    employeeName?: string;
    category?: string;
  },
) {
  const ref = db.collection(COL.transactions).doc();
  w.set(ref, {
    id: ref.id,
    txnNo: `TXN-${e.date.replace(/-/g, '')}-${ref.id.slice(0, 6).toUpperCase()}`,
    type: e.type,
    amount: round2(e.amount),
    date: e.date,
    description: e.description,
    orderId: e.order?.id ?? '',
    orderNo: e.order?.orderNo ?? '',
    customerId: e.order?.customerId ?? '',
    customerName: e.order?.customerName ?? '',
    serviceName: e.order?.serviceSummary ?? '',
    category: e.category ?? e.order?.category ?? '',
    employeeId: e.employeeId ?? e.order?.employeeId ?? ctx.user.uid,
    employeeName: e.employeeName ?? e.order?.employeeName ?? ctx.user.name,
    orderTotal: e.order?.totalAmount ?? 0,
    orderAdvance: e.order?.advanceAmount ?? 0,
    orderPaid: e.order?.paidAmount ?? 0,
    orderBalance: e.order?.balance ?? 0,
    paymentMode: e.paymentMode ?? '',
    txnNumber: e.txnNumber ?? '',
    refId: e.refId ?? '',
    refNo: e.refNo ?? '',
    createdAt: nowIso(),
    createdBy: ctx.user.uid,
    createdByName: ctx.user.name,
  });
}
export { queueLedger };

/**
 * Writes an order together with everything derived from it: its sale record,
 * the customer's running totals and the linked publication record's money
 * mirror. Always call with the previous version (or null for new orders).
 */
export interface OrderWriteOptions {
  skipCustomer?: boolean;
  skipModuleMirror?: boolean;
  /** Extra fields merged into the customer write (a document is written once per transaction). */
  customerExtra?: Record<string, unknown>;
  /** Extra fields merged into the linked publication record write. */
  moduleExtra?: Record<string, unknown>;
}

export function moduleMirror(o: OrderDoc) {
  return {
    totalAmount: o.totalAmount,
    advanceAmount: o.advanceAmount,
    paidAmount: o.paidAmount,
    balance: o.balance,
    paymentStatus: o.paymentStatus,
    orderStatus: o.status,
    employeeId: o.employeeId,
    employeeName: o.employeeName,
    deleted: o.deleted,
    updatedAt: o.updatedAt,
  };
}

function queueOrderWrites(tx: Transaction, before: OrderDoc | null, after: OrderDoc, opts: OrderWriteOptions = {}) {
  tx.set(db.collection(COL.orders).doc(after.id), after);
  tx.set(db.collection(COL.sales).doc(after.saleId), saleFromOrder(after));

  if (!opts.skipCustomer) {
    const b = contribution(before);
    const a = contribution(after);
    const d = {
      billed: round2(a.billed - b.billed),
      paid: round2(a.paid - b.paid),
      balance: round2(a.balance - b.balance),
      count: a.count - b.count,
    };
    const data: Record<string, unknown> = { ...(opts.customerExtra ?? {}) };
    if (d.billed || d.paid || d.balance || d.count) {
      Object.assign(data, {
        totalBilled: FieldValue.increment(d.billed),
        totalPaid: FieldValue.increment(d.paid),
        balance: FieldValue.increment(d.balance),
        orderCount: FieldValue.increment(d.count),
      });
    }
    if (Object.keys(data).length) tx.set(db.collection(COL.customers).doc(after.customerId), data, { merge: true });
  }

  if (!opts.skipModuleMirror && after.module && after.moduleRecordId) {
    const mod = getModule(after.module);
    if (mod) {
      tx.set(db.collection(mod.collection).doc(after.moduleRecordId), { ...moduleMirror(after), ...(opts.moduleExtra ?? {}) }, { merge: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface ModulePayload {
  def: ModuleDef;
  /** Module specific fields (already validated). */
  data: Record<string, unknown>;
  status: string;
  remarks: string;
}

export async function createOrder(ctx: Ctx, input: CreateOrderInput, moduleP?: ModulePayload) {
  assertCan(ctx, 'orders.create');
  const settings = await getSettings();
  const employee = await resolveEmployee(ctx, input.employeeId);
  const priced = priceItems(input.items);
  await checkDiscountAuthority(ctx, priced.items);

  const advance = input.advance && input.advance.amount > 0 ? input.advance : undefined;
  if (advance) {
    assertCan(ctx, 'payments.create');
    if (advance.amount > priced.total) throw badRequest(`Advance (${formatINR(advance.amount)}) cannot exceed the total amount (${formatINR(priced.total)}).`);
    if (!advance.mode) throw badRequest('Select the payment mode for the advance.');
    await assertPaymentMode(advance.mode);
  }
  if (!input.customerId && !input.newCustomer) throw badRequest('Select a customer or enter new customer details.');

  const now = nowIso();
  const orderRef = db.collection(COL.orders).doc();
  const saleRef = db.collection(COL.sales).doc();
  const moduleRef = moduleP ? db.collection(moduleP.def.collection).doc() : null;

  return db.runTransaction(async (tx) => {
    // ---- reads ----
    let customer: Doc | null = null;
    if (input.customerId) {
      const snap = await tx.get(db.collection(COL.customers).doc(input.customerId));
      if (!snap.exists) throw notFound('Customer');
      customer = { ...(snap.data() as Doc), id: snap.id };
    } else if (input.newCustomer) {
      const found = await tx.get(db.collection(COL.customers).where('mobile', '==', input.newCustomer.mobile).limit(1));
      if (!found.empty) customer = { ...(found.docs[0].data() as Doc), id: found.docs[0].id };
    }
    if (customer?.deleted) throw badRequest('This customer has been deleted. Restore the customer first.');
    const isNewCustomer = !customer;
    if (isNewCustomer) assertCan(ctx, 'customers.create');
    if (advance) await assertTxnNumberUnique(tx, advance.txnNumber);

    const ids = await allocIds(tx, {
      order: 1,
      sale: 1,
      payment: advance ? 1 : 0,
      customer: isNewCustomer ? 1 : 0,
      ...(moduleP ? { [moduleP.def.key]: 1 } : {}),
    });

    // ---- build ----
    const orderDate = input.orderDate || todayYMD();
    if (isNewCustomer) {
      const nc = input.newCustomer!;
      const ref = db.collection(COL.customers).doc();
      customer = {
        id: ref.id,
        customerNo: ids.next('customer'),
        name: nc.name,
        mobile: nc.mobile,
        altMobile: '',
        email: nc.email,
        address: '',
        city: '',
        state: '',
        collegeId: nc.collegeId,
        collegeName: nc.collegeName,
        department: '',
        designation: '',
        customerType: nc.customerType || 'Author',
        assignedEmployeeId: employee.id,
        assignedEmployeeName: employee.name,
        dateAdded: orderDate,
        notes: '',
        status: 'Active',
        totalBilled: 0,
        totalPaid: 0,
        balance: 0,
        orderCount: 0,
        createdAt: now,
        createdBy: ctx.user.uid,
        createdByName: ctx.user.name,
        updatedAt: now,
        deleted: false,
      };
    }
    const c = customer!;

    const status: OrderStatus = moduleP
      ? moduleStatusToOrder(moduleP.def, moduleP.status)
      : employee.id !== ctx.user.uid
        ? 'Assigned'
        : 'New';

    const paid = advance?.amount ?? 0;
    const base = {
      totalAmount: priced.total,
      paidAmount: paid,
      refundedAmount: 0,
      status,
    };
    const derived = deriveFinancials(base);
    const orderNo = ids.next('order');
    const moduleRecordNo = moduleP ? ids.next(moduleP.def.key) : '';
    const advancePaymentNo = advance ? ids.next('payment') : '';

    const order: OrderDoc = {
      id: orderRef.id,
      orderNo,
      customerId: c.id,
      customerNo: c.customerNo ?? '',
      customerName: c.name,
      customerMobile: c.mobile ?? '',
      customerEmail: c.email ?? '',
      collegeId: c.collegeId ?? '',
      collegeName: c.collegeName ?? '',
      items: priced.items,
      serviceSummary: serviceSummary(priced.items),
      category: priced.items[0].category,
      module: moduleP?.def.key ?? '',
      moduleRecordId: moduleRef?.id ?? '',
      moduleRecordNo,
      employeeId: employee.id,
      employeeName: employee.name,
      orderDate,
      expectedDate: input.expectedDate ?? '',
      priority: input.priority ?? 'Normal',
      notes: input.notes ?? '',
      subtotal: priced.subtotal,
      discountTotal: priced.discountTotal,
      taxTotal: priced.taxTotal,
      ...base,
      ...derived,
      advanceAmount: paid,
      paymentCount: advance ? 1 : 0,
      lastPaymentDate: advance ? advance.date || orderDate : '',
      lastPaymentMode: advance?.mode ?? '',
      lastTxnNumber: advance?.txnNumber ?? '',
      saleId: saleRef.id,
      saleNo: ids.next('sale'),
      invoiceId: '',
      completedAt: status === 'Completed' || status === 'Delivered' ? now : '',
      createdAt: now,
      createdBy: ctx.user.uid,
      createdByName: ctx.user.name,
      updatedAt: now,
      updatedBy: ctx.user.uid,
      deleted: false,
    };

    // ---- writes ----
    ids.commit();
    if (isNewCustomer) {
      c.totalBilled = order.billedAmount;
      c.totalPaid = order.paidAmount;
      c.balance = order.balance;
      c.orderCount = 1;
      c.lastOrderDate = orderDate;
      tx.set(db.collection(COL.customers).doc(c.id), c);
      writeAudit(tx, ctx, {
        action: 'create',
        module: 'customers',
        recordId: c.id,
        recordLabel: c.customerNo,
        message: `${ctx.user.name} added customer ${c.name} (${c.customerNo}).`,
        newValue: { name: c.name, mobile: c.mobile, email: c.email },
      });
    }
    queueOrderWrites(tx, null, order, {
      skipCustomer: isNewCustomer,
      skipModuleMirror: true,
      customerExtra: orderDate > (c.lastOrderDate ?? '') ? { lastOrderDate: orderDate } : undefined,
    });

    let moduleRecord: Record<string, unknown> | null = null;
    if (moduleP && moduleRef) {
      moduleRecord = {
        id: moduleRef.id,
        recordNo: moduleRecordNo,
        ...moduleP.data,
        customerId: c.id,
        customerName: c.name,
        mobile: c.mobile ?? '',
        email: c.email ?? '',
        collegeId: c.collegeId ?? '',
        employeeId: employee.id,
        employeeName: employee.name,
        date: orderDate,
        expectedDate: order.expectedDate,
        status: moduleP.status,
        remarks: moduleP.remarks,
        paymentMode: advance?.mode ?? '',
        txnNumber: advance?.txnNumber ?? '',
        orderId: order.id,
        orderNo: order.orderNo,
        totalAmount: order.totalAmount,
        advanceAmount: order.advanceAmount,
        paidAmount: order.paidAmount,
        balance: order.balance,
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        createdAt: now,
        createdBy: ctx.user.uid,
        createdByName: ctx.user.name,
        updatedAt: now,
        deleted: false,
      };
      tx.set(moduleRef, moduleRecord);
      writeAudit(tx, ctx, {
        action: 'create',
        module: moduleP.def.key,
        recordId: moduleRef.id,
        recordLabel: moduleRecordNo,
        message: `${ctx.user.name} created ${moduleP.def.singular.toLowerCase()} ${moduleRecordNo} for ${c.name} (${formatINR(order.totalAmount)}).`,
        newValue: moduleRecord,
      });
    }

    queueLedger(tx, ctx, {
      type: 'Sale',
      amount: order.totalAmount,
      date: orderDate,
      description: `Sale ${order.saleNo} — ${order.serviceSummary}`,
      order,
      refId: order.saleId,
      refNo: order.saleNo,
    });

    writeAudit(tx, ctx, {
      action: 'create',
      module: 'orders',
      recordId: order.id,
      recordLabel: order.orderNo,
      message: `${ctx.user.name} created order ${order.orderNo} for ${c.name}: ${order.serviceSummary} (${formatINR(order.totalAmount)}).`,
      newValue: { totalAmount: order.totalAmount, items: order.items, employee: employee.name, status },
    });

    let payment: Record<string, unknown> | null = null;
    if (advance) {
      payment = buildPayment(ctx, advancePaymentNo, order, {
        amount: advance.amount,
        date: advance.date || orderDate,
        mode: advance.mode,
        txnNumber: advance.txnNumber,
        type: advance.amount >= order.totalAmount ? 'Full Payment' : 'Advance',
        remarks: 'Recorded with order',
      });
      tx.set(db.collection(COL.payments).doc(payment.id as string), payment);
      queueLedger(tx, ctx, {
        type: 'Payment',
        amount: advance.amount,
        date: payment.date as string,
        description: `${payment.type} ${payment.paymentNo} for ${order.orderNo}`,
        order,
        refId: payment.id as string,
        refNo: payment.paymentNo as string,
        paymentMode: advance.mode,
        txnNumber: advance.txnNumber,
        employeeId: ctx.user.uid,
        employeeName: ctx.user.name,
      });
      writeAudit(tx, ctx, {
        action: 'create',
        module: 'payments',
        recordId: payment.id as string,
        recordLabel: payment.paymentNo as string,
        message: `${ctx.user.name} recorded ${String(payment.type).toLowerCase()} of ${formatINR(advance.amount)} for ${order.orderNo} (${advance.mode}).`,
        newValue: payment,
      });
    }

    queueNotifications(
      tx,
      [employee.id],
      {
        type: NOTIFICATION_TYPES.ORDER_ASSIGNED,
        title: 'New order assigned',
        message: `${order.orderNo} — ${order.serviceSummary} for ${c.name}`,
        link: `/orders/${order.id}`,
      },
      { excludeUid: ctx.user.uid },
    );

    return { order, payment, moduleRecord, customer: c };
  });
}

export const moduleStatusToOrder = orderStatusForModuleStatus;

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function buildPayment(
  ctx: Ctx,
  paymentNo: string,
  order: OrderDoc,
  p: { amount: number; date: string; mode: string; txnNumber: string; type: PaymentType; remarks: string },
) {
  const ref = db.collection(COL.payments).doc();
  return {
    id: ref.id,
    paymentNo,
    orderId: order.id,
    orderNo: order.orderNo,
    customerId: order.customerId,
    customerName: order.customerName,
    customerMobile: order.customerMobile,
    serviceName: order.serviceSummary,
    category: order.category,
    module: order.module,
    collegeId: order.collegeId,
    collegeName: order.collegeName,
    orderEmployeeId: order.employeeId,
    employeeId: ctx.user.uid,
    employeeName: ctx.user.name,
    amount: round2(p.amount),
    date: p.date,
    mode: p.mode,
    txnNumber: p.txnNumber,
    type: p.type,
    remarks: p.remarks,
    voided: false,
    createdAt: nowIso(),
    createdBy: ctx.user.uid,
    createdByName: ctx.user.name,
  };
}

export async function recordPayment(ctx: Ctx, input: PaymentInput) {
  assertCan(ctx, 'payments.create');
  await assertPaymentMode(input.mode);
  const settings = await getSettings();
  const notifyTo = await usersWithPermission('finance.view_all');

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(db.collection(COL.orders).doc(input.orderId));
    if (!orderSnap.exists) throw notFound('Order');
    const before = orderSnap.data() as OrderDoc;
    if (before.deleted) throw badRequest('This order has been deleted.');
    if (!canViewOrder(ctx, before) && !can(ctx, 'payments.view_all')) throw forbidden();
    await assertTxnNumberUnique(tx, input.txnNumber);
    const ids = await allocIds(tx, { payment: 1 });

    const isRefund = input.type === 'Refund';
    if (isRefund) {
      if (input.amount > before.paidAmount) {
        throw badRequest(`Refund cannot exceed the amount paid (${formatINR(before.paidAmount)}).`);
      }
    } else {
      if (before.status === 'Cancelled') throw badRequest('Cannot record a payment on a cancelled order.');
      if (before.balance <= 0 && !settings.allowOverpayment) throw badRequest('This order is already fully paid.');
      if (input.amount > before.balance && !settings.allowOverpayment) {
        throw badRequest(`Payment amount cannot exceed outstanding balance (${formatINR(before.balance)}).`);
      }
    }

    let type: PaymentType = input.type ?? (input.amount >= before.balance ? (before.paidAmount > 0 ? 'Final Payment' : 'Full Payment') : before.paidAmount > 0 ? 'Partial Payment' : 'Advance');
    if (!isRefund && type === 'Refund') type = 'Partial Payment';

    const paidAmount = round2(before.paidAmount + (isRefund ? -input.amount : input.amount));
    const refundedAmount = round2(before.refundedAmount + (isRefund ? input.amount : 0));
    const now = nowIso();
    const after: OrderDoc = {
      ...before,
      paidAmount,
      refundedAmount,
      advanceAmount: round2(before.advanceAmount + (type === 'Advance' ? input.amount : 0)),
      paymentCount: before.paymentCount + 1,
      lastPaymentDate: input.date > (before.lastPaymentDate || '') ? input.date : before.lastPaymentDate,
      lastPaymentMode: input.mode,
      lastTxnNumber: input.txnNumber || before.lastTxnNumber,
      updatedAt: now,
      updatedBy: ctx.user.uid,
    };
    Object.assign(after, deriveFinancials(after));

    const payment = buildPayment(ctx, ids.next('payment'), after, { ...input, type });

    ids.commit();
    tx.set(db.collection(COL.payments).doc(payment.id), payment);
    queueOrderWrites(tx, before, after);
    queueLedger(tx, ctx, {
      type: isRefund ? 'Refund' : 'Payment',
      amount: input.amount,
      date: input.date,
      description: `${type} ${payment.paymentNo} for ${after.orderNo}`,
      order: after,
      refId: payment.id,
      refNo: payment.paymentNo,
      paymentMode: input.mode,
      txnNumber: input.txnNumber,
      employeeId: ctx.user.uid,
      employeeName: ctx.user.name,
    });
    writeAudit(tx, ctx, {
      action: isRefund ? 'refund' : 'create',
      module: 'payments',
      recordId: payment.id,
      recordLabel: payment.paymentNo,
      message: `${ctx.user.name} recorded ${type.toLowerCase()} of ${formatINR(input.amount)} for ${after.orderNo} (${input.mode}). Balance ${formatINR(before.balance)} → ${formatINR(after.balance)}.`,
      oldValue: { paidAmount: before.paidAmount, balance: before.balance, paymentStatus: before.paymentStatus },
      newValue: { paidAmount: after.paidAmount, balance: after.balance, paymentStatus: after.paymentStatus, payment },
    });
    queueNotifications(
      tx,
      [after.employeeId, ...notifyTo],
      {
        type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
        title: isRefund ? 'Refund recorded' : 'Payment received',
        message: `${formatINR(input.amount)} ${isRefund ? 'refunded to' : 'from'} ${after.customerName} for ${after.orderNo} (${input.mode})`,
        link: `/orders/${after.id}`,
      },
      { excludeUid: ctx.user.uid },
    );
    return { payment, order: after };
  });
}

export async function voidPayment(ctx: Ctx, paymentId: string, reason: string) {
  assertCan(ctx, 'payments.void', 'Only the owner can void payments.');
  if (!reason || reason.trim().length < 3) throw badRequest('Enter a reason for voiding this payment.');
  return db.runTransaction(async (tx) => {
    const pSnap = await tx.get(db.collection(COL.payments).doc(paymentId));
    if (!pSnap.exists) throw notFound('Payment');
    const p = pSnap.data() as Doc;
    if (p.voided) throw badRequest('This payment is already voided.');
    const oSnap = await tx.get(db.collection(COL.orders).doc(p.orderId));
    if (!oSnap.exists) throw notFound('Order');
    const before = oSnap.data() as OrderDoc;
    const isRefund = p.type === 'Refund';
    const now = nowIso();
    const after: OrderDoc = {
      ...before,
      paidAmount: round2(before.paidAmount + (isRefund ? p.amount : -p.amount)),
      refundedAmount: round2(before.refundedAmount - (isRefund ? p.amount : 0)),
      advanceAmount: round2(before.advanceAmount - (p.type === 'Advance' ? p.amount : 0)),
      paymentCount: Math.max(before.paymentCount - 1, 0),
      updatedAt: now,
      updatedBy: ctx.user.uid,
    };
    if (after.paidAmount < 0) throw badRequest('Voiding this payment would make the paid amount negative. Void the related refund first.');
    Object.assign(after, deriveFinancials(after));

    tx.update(pSnap.ref, { voided: true, voidReason: reason.trim(), voidedAt: now, voidedBy: ctx.user.uid, voidedByName: ctx.user.name });
    queueOrderWrites(tx, before, after);
    queueLedger(tx, ctx, {
      type: 'Adjustment',
      amount: isRefund ? p.amount : -p.amount,
      date: todayYMD(),
      description: `Voided ${p.type} ${p.paymentNo}: ${reason.trim()}`,
      order: after,
      refId: p.id,
      refNo: p.paymentNo,
      paymentMode: p.mode,
      txnNumber: p.txnNumber,
    });
    writeAudit(tx, ctx, {
      action: 'void',
      module: 'payments',
      recordId: p.id,
      recordLabel: p.paymentNo,
      message: `${ctx.user.name} voided payment ${p.paymentNo} of ${formatINR(p.amount)} on ${before.orderNo}. Balance ${formatINR(before.balance)} → ${formatINR(after.balance)}.`,
      oldValue: { voided: false, balance: before.balance },
      newValue: { voided: true, balance: after.balance },
      reason: reason.trim(),
    });
    return { order: after };
  });
}

// ---------------------------------------------------------------------------
// Update / delete / restore
// ---------------------------------------------------------------------------

/**
 * Applies a change to an order inside a transaction the caller controls (so
 * publication modules can update their own record atomically). Returns the new
 * order; the caller must have done all its reads before calling.
 */
export async function prepareOrderUpdate(
  ctx: Ctx,
  before: OrderDoc,
  input: UpdateOrderInput,
): Promise<{ after: OrderDoc; changed: boolean; commit: (tx: Transaction, opts?: OrderWriteOptions) => void }> {
  if (before.deleted) throw badRequest('This order has been deleted.');
  assertCan(ctx, 'orders.edit');
  assertViewOrder(ctx, before);

  const now = nowIso();
  const after: OrderDoc = { ...before, updatedAt: now, updatedBy: ctx.user.uid };
  const reason = (input.reason ?? '').trim();

  if (input.priority !== undefined) after.priority = input.priority;
  if (input.expectedDate !== undefined) after.expectedDate = input.expectedDate;
  if (input.notes !== undefined) after.notes = input.notes;

  let newEmployee: { id: string; name: string } | null = null;
  if (input.employeeId !== undefined && input.employeeId !== before.employeeId) {
    if (!can(ctx, 'orders.view_all')) throw forbidden('Only managers can reassign orders.');
    newEmployee = await resolveEmployee(ctx, input.employeeId);
    after.employeeId = newEmployee.id;
    after.employeeName = newEmployee.name;
    if (after.status === 'New') after.status = 'Assigned';
  }

  if (input.status !== undefined && input.status !== before.status) {
    if (before.status === 'Cancelled' && !can(ctx, 'orders.edit_amount')) throw forbidden('Only managers can reopen cancelled orders.');
    after.status = input.status;
    if ((input.status === 'Completed' || input.status === 'Delivered') && !before.completedAt) after.completedAt = now;
    if (input.status === 'Cancelled' && !reason) throw badRequest('Enter a reason for cancelling this order.');
  }

  let amountChanged = false;
  if (input.items) {
    const priced = priceItems(input.items);
    const changed = JSON.stringify(priced.items) !== JSON.stringify(before.items);
    if (changed) {
      if (priced.total !== before.totalAmount || priced.discountTotal !== before.discountTotal) {
        assertCan(ctx, 'orders.edit_amount', 'Only managers can change order amounts.');
        if (!reason) throw badRequest('Enter a reason for changing the order amount.');
        amountChanged = priced.total !== before.totalAmount;
      }
      await checkDiscountAuthority(ctx, priced.items);
      if (priced.total < before.paidAmount) {
        throw badRequest(`New total (${formatINR(priced.total)}) cannot be less than the amount already paid (${formatINR(before.paidAmount)}). Record a refund first.`);
      }
      Object.assign(after, {
        items: priced.items,
        subtotal: priced.subtotal,
        discountTotal: priced.discountTotal,
        taxTotal: priced.taxTotal,
        totalAmount: priced.total,
        serviceSummary: serviceSummary(priced.items),
        category: priced.items[0].category,
      });
    }
  }

  Object.assign(after, deriveFinancials(after));
  const { changed, oldValue, newValue } = diff(before, after, [
    'status', 'priority', 'expectedDate', 'notes', 'employeeName', 'items', 'totalAmount', 'billedAmount', 'balance', 'paymentStatus',
  ]);
  const notifyTo = after.status === 'Completed' && before.status !== 'Completed' ? await usersWithPermission('finance.view_all') : [];

  const commit = (tx: Transaction, opts: OrderWriteOptions = {}) => {
    if (!changed.length) {
      // Nothing changed on the order itself; still apply any module field changes.
      if (opts.moduleExtra && after.module && after.moduleRecordId) {
        const mod = getModule(after.module);
        if (mod) tx.set(db.collection(mod.collection).doc(after.moduleRecordId), opts.moduleExtra, { merge: true });
      }
      return;
    }
    queueOrderWrites(tx, before, after, opts);
    const billedDelta = round2(after.billedAmount - before.billedAmount);
    if (billedDelta !== 0) {
      queueLedger(tx, ctx, {
        type: 'Adjustment',
        amount: billedDelta,
        date: todayYMD(),
        description:
          after.status === 'Cancelled' && before.status !== 'Cancelled'
            ? `Order ${after.orderNo} cancelled${reason ? `: ${reason}` : ''}`
            : before.status === 'Cancelled' && after.status !== 'Cancelled'
              ? `Order ${after.orderNo} reopened`
              : `Order ${after.orderNo} amount changed ${formatINR(before.totalAmount)} → ${formatINR(after.totalAmount)}${reason ? `: ${reason}` : ''}`,
        order: after,
        refId: after.saleId,
        refNo: after.saleNo,
      });
    }
    const message = amountChanged
      ? `${ctx.user.name} changed order ${after.orderNo} amount from ${formatINR(before.totalAmount)} to ${formatINR(after.totalAmount)}.`
      : `${ctx.user.name} updated order ${after.orderNo}: ${describeChanges(changed, oldValue, newValue)}.`;
    writeAudit(tx, ctx, {
      action: amountChanged ? 'amount_change' : input.status === 'Cancelled' ? 'cancel' : 'update',
      module: 'orders',
      recordId: after.id,
      recordLabel: after.orderNo,
      message,
      oldValue,
      newValue,
      reason,
    });
    if (newEmployee) {
      queueNotifications(
        tx,
        [newEmployee.id],
        {
          type: NOTIFICATION_TYPES.ORDER_ASSIGNED,
          title: 'Order assigned to you',
          message: `${after.orderNo} — ${after.serviceSummary} for ${after.customerName}`,
          link: `/orders/${after.id}`,
        },
        { excludeUid: ctx.user.uid },
      );
    }
    if (notifyTo.length) {
      queueNotifications(
        tx,
        [...notifyTo, after.employeeId],
        {
          type: NOTIFICATION_TYPES.ORDER_COMPLETED,
          title: 'Order completed',
          message: `${after.orderNo} for ${after.customerName} was marked completed${after.balance > 0 ? ` (balance ${formatINR(after.balance)})` : ''}.`,
          link: `/orders/${after.id}`,
        },
        { excludeUid: ctx.user.uid },
      );
    }
  };
  return { after, changed: changed.length > 0, commit };
}

export async function updateOrder(ctx: Ctx, orderId: string, input: UpdateOrderInput) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(COL.orders).doc(orderId));
    if (!snap.exists) throw notFound('Order');
    const before = snap.data() as OrderDoc;
    let moduleSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    const mod = before.module ? getModule(before.module) : undefined;
    if (mod && before.moduleRecordId) moduleSnap = await tx.get(db.collection(mod.collection).doc(before.moduleRecordId));

    const { after, commit } = await prepareOrderUpdate(ctx, before, input);
    // Keep the publication record's workflow status in step with terminal order statuses.
    let moduleExtra: Record<string, unknown> | undefined;
    if (mod && moduleSnap?.exists && after.status !== before.status) {
      const target = after.status === 'Delivered' && !mod.statuses.includes('Delivered') ? 'Completed' : after.status;
      if (mod.statuses.includes(target)) moduleExtra = { status: target };
    }
    commit(tx, { moduleExtra });
    return after;
  });
}

export async function softDeleteOrder(ctx: Ctx, orderId: string, reason: string) {
  assertCan(ctx, 'orders.delete', 'Only the owner can delete orders.');
  if (!reason || reason.trim().length < 3) throw badRequest('Enter a reason for deleting this order.');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(COL.orders).doc(orderId));
    if (!snap.exists) throw notFound('Order');
    const before = snap.data() as OrderDoc;
    if (before.deleted) throw badRequest('This order is already deleted.');
    if (before.paidAmount !== 0 || before.paymentCount > 0) {
      throw badRequest('This order has payments. Cancel it and refund (or void the payments) instead of deleting it.');
    }
    const now = nowIso();
    const after: OrderDoc = { ...before, deleted: true, deletedAt: now, deletedBy: ctx.user.uid, deleteReason: reason.trim(), updatedAt: now };
    queueOrderWrites(tx, before, after);
    if (before.billedAmount) {
      queueLedger(tx, ctx, {
        type: 'Adjustment',
        amount: -before.billedAmount,
        date: todayYMD(),
        description: `Order ${before.orderNo} deleted: ${reason.trim()}`,
        order: after,
      });
    }
    writeAudit(tx, ctx, {
      action: 'delete',
      module: 'orders',
      recordId: before.id,
      recordLabel: before.orderNo,
      message: `${ctx.user.name} deleted order ${before.orderNo} (${formatINR(before.totalAmount)}).`,
      oldValue: { deleted: false },
      newValue: { deleted: true },
      reason: reason.trim(),
    });
    return after;
  });
}

export async function restoreOrder(ctx: Ctx, orderId: string) {
  assertCan(ctx, 'records.restore');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(COL.orders).doc(orderId));
    if (!snap.exists) throw notFound('Order');
    const before = snap.data() as OrderDoc;
    if (!before.deleted) throw badRequest('This order is not deleted.');
    const now = nowIso();
    const after: OrderDoc = { ...before, deleted: false, deletedAt: '', deletedBy: '', deleteReason: '', updatedAt: now };
    queueOrderWrites(tx, before, after);
    if (after.billedAmount) {
      queueLedger(tx, ctx, {
        type: 'Adjustment',
        amount: after.billedAmount,
        date: todayYMD(),
        description: `Order ${after.orderNo} restored`,
        order: after,
      });
    }
    writeAudit(tx, ctx, {
      action: 'restore',
      module: 'orders',
      recordId: after.id,
      recordLabel: after.orderNo,
      message: `${ctx.user.name} restored order ${after.orderNo}.`,
      oldValue: { deleted: true },
      newValue: { deleted: false },
    });
    return after;
  });
}
