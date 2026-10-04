export const PERMISSIONS = {
  'dashboard.view': 'View dashboard',
  'finance.view_all': 'View company-wide financial figures',
  'employees.view': 'View employees',
  'employees.manage': 'Add / edit / suspend any user and set their password',
  'employees.manage_staff': 'Add / edit employees (Employee role only) and set their passwords',
  'roles.manage': 'Create and edit roles',
  'customers.view_all': 'View all customers (not only own)',
  'customers.create': 'Add customers',
  'customers.edit': 'Edit customers',
  'customers.delete': 'Delete customers (soft delete)',
  'orders.view_all': 'View all orders, sales and publication records',
  'orders.create': 'Create orders and publication records',
  'orders.edit': 'Update orders and publication records',
  'orders.edit_amount': 'Change order amounts (with reason)',
  'orders.delete': 'Delete orders (soft delete)',
  'payments.view_all': 'View all payments',
  'payments.create': 'Record payments and advances',
  'payments.void': 'Void payments',
  'expenses.view_all': 'View all expenses',
  'expenses.create': 'Submit expenses',
  'expenses.approve': 'Approve / reject expenses',
  'expenses.delete': 'Delete expenses (soft delete)',
  'services.manage': 'Configure services and pricing',
  'conferences.manage': 'Add / edit / delete conferences (everyone can view them)',
  'colleges.view': 'View colleges',
  'colleges.manage': 'Add / edit colleges',
  'reports.view': 'View reports',
  'reports.export': 'Export reports',
  'analytics.view': 'View analytics',
  'performance.view_all': 'View performance of all employees',
  'audit.view': 'View audit logs',
  'settings.manage': 'Configure business settings',
  'backup.manage': 'Export / restore backups',
  'records.restore': 'Restore deleted records',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export interface RoleDefinition {
  name: string;
  description: string;
  permissions: Permission[];
}

export const SYSTEM_ROLES: Record<'super_admin' | 'manager' | 'employee', RoleDefinition> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Business owner. Full access to everything.',
    permissions: ALL_PERMISSIONS,
  },
  manager: {
    name: 'Manager',
    description: 'Runs daily operations and reporting. Cannot delete financial records or change configuration.',
    permissions: [
      'dashboard.view', 'finance.view_all', 'employees.view', 'employees.manage_staff',
      'customers.view_all', 'customers.create', 'customers.edit',
      'orders.view_all', 'orders.create', 'orders.edit', 'orders.edit_amount',
      'payments.view_all', 'payments.create',
      'expenses.view_all', 'expenses.create', 'expenses.approve',
      'conferences.manage',
      'colleges.view', 'colleges.manage',
      'reports.view', 'reports.export', 'analytics.view', 'performance.view_all',
    ],
  },
  employee: {
    name: 'Employee',
    description: 'Handles own customers, orders, payments and expenses.',
    permissions: [
      'dashboard.view', 'customers.create', 'customers.edit',
      'orders.create', 'orders.edit', 'payments.create', 'expenses.create', 'colleges.view',
    ],
  },
};

export type SystemRoleId = keyof typeof SYSTEM_ROLES;

/**
 * Permissions introduced after first release, per version. When the server
 * starts, built-in roles stored in the database receive the permissions of any
 * newer version they have not seen yet (admins' own edits are otherwise kept).
 */
export const PERMISSION_MIGRATIONS: { version: number; grants: Partial<Record<SystemRoleId, Permission[]>> }[] = [
  { version: 2, grants: { manager: ['conferences.manage'] } },
  { version: 3, grants: { manager: ['employees.manage_staff'] } },
];
export const PERMISSIONS_VERSION = PERMISSION_MIGRATIONS.reduce((m, x) => Math.max(m, x.version), 1);
export const SUPER_ADMIN_ROLE: SystemRoleId = 'super_admin';
