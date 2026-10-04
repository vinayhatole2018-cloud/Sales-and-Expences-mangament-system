export const EMPLOYEE_STATUSES = ['Active', 'Inactive', 'Suspended'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const DEPARTMENTS = ['Management', 'Sales', 'Publication', 'Writing', 'Design', 'Accounts', 'Operations', 'Other'] as const;

export const CUSTOMER_TYPES = ['Author', 'Student', 'Professor', 'Research Scholar', 'College', 'Institution', 'Other'] as const;
export const CUSTOMER_STATUSES = ['Active', 'Inactive', 'Blocked'] as const;

export const SERVICE_CATEGORIES = ['Research Paper', 'Conference', 'Book', 'PhD', 'Award', 'Certificate', 'Other'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const DEFAULT_PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other'];

export const PAYMENT_TYPES = ['Advance', 'Partial Payment', 'Full Payment', 'Final Payment', 'Refund'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const ORDER_STATUSES = ['New', 'Assigned', 'In Progress', 'Pending Customer', 'Completed', 'Delivered', 'Cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
/** Order statuses that count as finished work. */
export const CLOSED_ORDER_STATUSES: readonly OrderStatus[] = ['Completed', 'Delivered', 'Cancelled'];
export const DONE_ORDER_STATUSES: readonly OrderStatus[] = ['Completed', 'Delivered'];

export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid', 'Refund Pending', 'Refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Printing', 'Stationery', 'Travel', 'Courier', 'Office', 'Marketing', 'Salary',
  'Software', 'Hosting', 'Electricity', 'Internet', 'Other',
];

export const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const TRANSACTION_TYPES = ['Sale', 'Payment', 'Refund', 'Expense', 'Adjustment'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ATTACHMENT_CATEGORIES = [
  'Research Paper', 'Manuscript', 'Certificate', 'Payment Receipt', 'Expense Receipt',
  'Book Cover', 'Agreement', 'Customer Document', 'Brochure', 'Profile Photo', 'Logo', 'Other',
] as const;

export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/plain': ['.txt'],
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const NOTIFICATION_TYPES = {
  ORDER_ASSIGNED: 'order_assigned',
  CONFERENCE_ADDED: 'conference_added',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_PENDING: 'payment_pending',
  EXPENSE_SUBMITTED: 'expense_submitted',
  EXPENSE_APPROVED: 'expense_approved',
  EXPENSE_REJECTED: 'expense_rejected',
  ORDER_COMPLETED: 'order_completed',
  DEADLINE_APPROACHING: 'deadline_approaching',
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  order_assigned: 'New order assigned',
  conference_added: 'New conference added',
  payment_received: 'Payment received',
  payment_pending: 'Payment pending',
  expense_submitted: 'Expense submitted',
  expense_approved: 'Expense approved',
  expense_rejected: 'Expense rejected',
  order_completed: 'Order completed',
  deadline_approaching: 'Order deadline approaching',
};

export const REPORT_TYPES = [
  { key: 'daily-sales', label: 'Daily Sales Report' },
  { key: 'monthly-sales', label: 'Monthly Sales Report' },
  { key: 'expenses', label: 'Expense Report' },
  { key: 'collections', label: 'Payment Collection Report' },
  { key: 'outstanding', label: 'Outstanding Payment Report' },
  { key: 'employee-performance', label: 'Employee Performance Report' },
  { key: 'customers', label: 'Customer Report' },
  { key: 'colleges', label: 'College Report' },
  { key: 'service-revenue', label: 'Service-wise Revenue Report' },
  { key: 'profit-loss', label: 'Profit / Loss Report' },
  { key: 'orders', label: 'Order Report' },
  { key: 'transactions', label: 'Transaction Report' },
] as const;
export type ReportKey = (typeof REPORT_TYPES)[number]['key'];

/** Collections included in database backups. */
export const BACKUP_COLLECTIONS = [
  'users', 'credentials', 'roles', 'settings', 'counters', 'customers', 'colleges', 'services', 'orders', 'sales',
  'payments', 'expenses', 'transactions', 'notifications', 'auditLogs', 'attachments', 'invoices',
  'researchPapers', 'conferences', 'conferenceEvents', 'books', 'phdProjects', 'awards', 'certificates',
];
