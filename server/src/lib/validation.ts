import { z } from 'zod';
import { round2 } from '@pbms/shared';

export function normalizeMobile(v: string): string {
  return v.replace(/[\s\-()]/g, '');
}

export const zMobile = z
  .string({ required_error: 'Mobile number is required.' })
  .trim()
  .min(1, 'Mobile number is required.')
  .transform(normalizeMobile)
  .refine((v) => /^\+?\d{10,15}$/.test(v), 'Enter a valid mobile number (10 to 15 digits).');

export const zOptionalMobile = z
  .string()
  .trim()
  .transform(normalizeMobile)
  .refine((v) => v === '' || /^\+?\d{10,15}$/.test(v), 'Enter a valid mobile number (10 to 15 digits).')
  .optional()
  .default('');

export const zEmail = z.string().trim().toLowerCase().email('Enter a valid email address.');
export const zOptionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address.')
  .optional()
  .default('');

export const zText = (max = 200) => z.string().trim().max(max, `Must be at most ${max} characters.`);
export const zOptionalText = (max = 200) => zText(max).optional().default('');
export const zRequiredText = (label: string, max = 200) =>
  z.string({ required_error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} must be at most ${max} characters.`);

export const zDate = z
  .string({ required_error: 'Date is required.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date (YYYY-MM-DD).')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date.');
export const zOptionalDate = z.union([zDate, z.literal('')]).optional().default('');

const zNumberish = z.union([z.number(), z.string().trim()]).transform((v, ctx) => {
  if (v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v.replace(/,/g, ''));
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount must be a number.' });
    return z.NEVER;
  }
  return n;
});

export const zMoney = zNumberish
  .refine((n) => n >= 0, 'Amount cannot be negative.')
  .refine((n) => n <= 1_000_000_000, 'Amount is too large.')
  .transform(round2);

export const zPositiveMoney = zMoney.refine((n) => n > 0, 'Amount must be greater than zero.');

export const zCount = zNumberish.refine((n) => Number.isInteger(n) && n >= 0, 'Must be a whole number, 0 or more.');

export const zTxnNumber = z
  .string()
  .trim()
  .max(64, 'Transaction number is too long.')
  .refine((v) => v === '' || /^[A-Za-z0-9\-_/.#]+$/.test(v), 'Transaction number may only contain letters, digits and - _ / . #')
  .optional()
  .default('');

export const zId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_\-]+$/, 'Invalid id.');

/** Standard list query parameters. */
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  search: z.string().trim().max(100).optional().default(''),
  sort: z.string().trim().max(50).optional().default(''),
  dir: z.enum(['asc', 'desc']).optional().default('desc'),
  from: z.union([zDate, z.literal('')]).optional().default(''),
  to: z.union([zDate, z.literal('')]).optional().default(''),
  includeDeleted: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});
export type ListQuery = z.infer<typeof listQuery>;
