import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_PAYMENT_MODES, NOTIFICATION_TYPES, type NotificationType } from '@pbms/shared';
import { db, COL } from '../firebase';

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  logoAttachmentId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  gstEnabled: boolean;
  gstin: string;
  defaultTaxPercent: number;
  invoicePrefix: string;
  orderPrefix: string;
  paymentModes: string[];
  expenseCategories: string[];
  /** Allow a payment larger than the order balance (records an overpayment / refund due). */
  allowOverpayment: boolean;
  /** Maximum discount (percent of line amount) employees may give without extra permission. */
  maxEmployeeDiscountPercent: number;
  invoiceTerms: string;
  authorizedSignatory: string;
  notifications: Record<NotificationType, boolean>;
  deadlineReminderDays: number;
  pendingPaymentReminderDays: number;
  backup: { enabled: boolean; hour: number; keep: number };
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'Vinay Publications',
  tagline: 'Research • Publication • Academic Services',
  logoAttachmentId: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  gstEnabled: false,
  gstin: '',
  defaultTaxPercent: 0,
  invoicePrefix: 'INV',
  orderPrefix: 'ORD',
  paymentModes: DEFAULT_PAYMENT_MODES,
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  allowOverpayment: false,
  maxEmployeeDiscountPercent: 20,
  invoiceTerms:
    '1. Payment once made is non-refundable except as agreed in writing.\n2. Balance amount is payable before final delivery.\n3. This is a computer generated invoice.',
  authorizedSignatory: 'Authorized Signatory',
  notifications: Object.fromEntries(Object.values(NOTIFICATION_TYPES).map((t) => [t, true])) as Record<NotificationType, boolean>,
  deadlineReminderDays: 2,
  pendingPaymentReminderDays: 7,
  backup: { enabled: true, hour: 23, keep: 14 },
};

const ref = () => db.collection(COL.settings).doc('business');
let cache: { value: BusinessSettings; at: number } | null = null;
const TTL_MS = 30_000;

export async function getSettings(): Promise<BusinessSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const snap = await ref().get();
  const stored = (snap.data() ?? {}) as Partial<BusinessSettings>;
  const value: BusinessSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(stored.notifications ?? {}) },
    backup: { ...DEFAULT_SETTINGS.backup, ...(stored.backup ?? {}) },
  };
  cache = { value, at: Date.now() };
  return value;
}

/** Last loaded settings without I/O (defaults until first load). */
export function peekSettings(): BusinessSettings {
  return cache?.value ?? DEFAULT_SETTINGS;
}

export async function saveSettings(next: BusinessSettings): Promise<void> {
  await ref().set(next);
  cache = { value: next, at: Date.now() };
}

export function invalidateSettings(): void {
  cache = null;
}
