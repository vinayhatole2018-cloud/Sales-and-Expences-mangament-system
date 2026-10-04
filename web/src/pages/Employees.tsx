import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, RotateCcw, UserX } from 'lucide-react';
import { DEPARTMENTS, EMPLOYEE_STATUSES, todayYMD } from '@pbms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useList, useListState } from '../lib/hooks';
import { date, dateTime, initials } from '../lib/format';
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, useConfirm } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { FilterBar, FilterSelect, SearchBox } from '../components/Filters';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  const base = Array.from(arr, (n) => chars[n % chars.length]).join('');
  return `${base.slice(0, 5)}@${base.slice(5)}7`;
}

const EMPTY = { name: '', employeeId: '', email: '', mobile: '', role: 'employee', department: 'Sales', joiningDate: todayYMD(), status: 'Active', password: '' };

function EmployeeModal({ open, onClose, employee }: { open: boolean; onClose: () => void; employee?: any }) {
  const { profile } = useAuth();
  // Only roles this user may assign (managers: Employee only).
  const { data: roles } = useQuery({ queryKey: ['assignable-roles'], queryFn: () => api.get<any[]>('/employees/assignable-roles') });
  const [f, setF] = useState(EMPTY);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (open) {
      setF(employee ? { ...EMPTY, ...employee, password: '' } : { ...EMPTY, password: generatePassword() });
      setShow(!employee);
    }
  }, [open, employee]);
  const set = (p: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...p }));
  const save = useAction(
    () => {
      const { password, ...rest } = f;
      return employee ? api.put(`/employees/${employee.id}`, rest) : api.post('/employees', f);
    },
    (e: any) => (employee ? 'Employee updated.' : `${e.name} can now sign in with ${e.email}.`),
  );
  const isSelf = employee?.id === profile?.id;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? `Edit ${employee.name}` : 'Add employee'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>{employee ? 'Save' : 'Create login'}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" required><Input value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <Field label="Employee ID" hint="Leave blank to auto-generate (EMP-###)"><Input value={f.employeeId} onChange={(e) => set({ employeeId: e.target.value })} /></Field>
        <Field label="Email (login)" required><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Mobile"><Input inputMode="tel" value={f.mobile} onChange={(e) => set({ mobile: e.target.value })} /></Field>
        <Field label="Role" required hint={isSelf ? 'You cannot change your own role.' : undefined}>
          <Select value={f.role} disabled={isSelf} onChange={(e) => set({ role: e.target.value })}>
            {employee && !(roles ?? []).some((r) => r.id === f.role) && <option value={f.role}>{employee.roleName ?? f.role}</option>}
            {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Department">
          <Select value={f.department} onChange={(e) => set({ department: e.target.value })}>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label="Joining date" required><Input type="date" value={f.joiningDate} onChange={(e) => set({ joiningDate: e.target.value })} /></Field>
        <Field label="Status">
          <Select value={f.status} disabled={isSelf} onChange={(e) => set({ status: e.target.value })}>
            {EMPLOYEE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        {!employee && (
          <Field label="Initial password" required hint="Share this with the employee securely. They can change it after signing in." className="sm:col-span-2">
            <div className="flex gap-2">
              <Input type={show ? 'text' : 'password'} value={f.password} onChange={(e) => set({ password: e.target.value })} />
              <Button type="button" variant="secondary" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</Button>
              <Button type="button" variant="secondary" onClick={() => set({ password: generatePassword() })}>Generate</Button>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ employee, onClose }: { employee: any; onClose: () => void }) {
  const [password, setPassword] = useState('');
  useEffect(() => setPassword(employee ? generatePassword() : ''), [employee]);
  const save = useAction(() => api.post(`/employees/${employee.id}/reset-password`, { password }), 'New password saved. They have been signed out of all devices and must use the new password.');
  return (
    <Modal
      open={Boolean(employee)}
      onClose={onClose}
      size="sm"
      title={`Set new password — ${employee?.name ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Save new password</Button>
        </>
      }
    >
      <Field label="New password" hint="At least 8 characters with letters and numbers. Share it securely.">
        <div className="flex gap-2">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>Generate</Button>
        </div>
      </Field>
    </Modal>
  );
}

export default function Employees() {
  const { can, profile } = useAuth();
  const confirm = useConfirm();
  const { params, set } = useListState({ page: '1', pageSize: '50', sort: 'name', dir: 'asc' });
  const { data, isLoading } = useList('employees', '/employees', params);
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api.get<any[]>('/roles') });
  const [modal, setModal] = useState<{ open: boolean; employee?: any }>({ open: false });
  const [reset, setReset] = useState<any>(null);
  const remove = useAction((id: string) => api.del(`/employees/${id}`), 'Employee removed. Their records are kept.');
  const restore = useAction((id: string) => api.post(`/employees/${id}/restore`), 'Employee restored.');
  const manage = can('employees.manage');
  const canAdd = can('employees.manage', 'employees.manage_staff');

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={manage ? 'Create logins and set passwords for managers and employees.' : canAdd ? 'You can create logins and set passwords for employees.' : 'Team members and their roles.'}
        actions={canAdd && <Button icon={<Plus className="size-4" />} onClick={() => setModal({ open: true })}>Add employee</Button>}
      />
      <Card bodyClass="p-3">
        <FilterBar>
          <SearchBox value={params.search ?? ''} onChange={(v) => set({ search: v })} placeholder="Name, ID, email, mobile…" />
          <FilterSelect label="Status" value={params.status ?? ''} onChange={(v) => set({ status: v })} options={EMPLOYEE_STATUSES} />
          <FilterSelect label="Role" value={params.role ?? ''} onChange={(v) => set({ role: v })} options={(roles ?? []).map((r) => ({ value: r.id, label: r.name }))} />
          {manage && <div className="flex items-end pb-2"><Checkbox label="Show removed" checked={params.includeDeleted === 'true'} onChange={(v) => set({ includeDeleted: v ? 'true' : '' })} /></div>}
        </FilterBar>
        <DataTable
          rows={data?.items}
          loading={isLoading}
          sort={params.sort}
          dir={params.dir as any}
          onSort={(sort, dir) => set({ sort, dir })}
          rowClass={(r) => (r.deleted ? 'opacity-50' : '')}
          columns={[
            {
              key: 'name',
              header: 'Employee',
              primary: true,
              sortable: true,
              cell: (r) => (
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(r.name)}</span>
                  <div>
                    <p className="font-medium text-slate-900">{r.name}{r.id === profile?.id && <span className="ml-1 text-xs text-slate-500">(you)</span>}</p>
                    <p className="text-xs text-slate-500">{r.employeeId} • {r.email}</p>
                  </div>
                </div>
              ),
            },
            { key: 'mobile', header: 'Mobile' },
            { key: 'roleName', header: 'Role', sortable: true, cell: (r) => <Badge tone={r.role === 'super_admin' ? 'violet' : r.role === 'manager' ? 'blue' : 'gray'}>{r.roleName}</Badge> },
            { key: 'department', header: 'Department', hideOnMobile: true },
            { key: 'joiningDate', header: 'Joined', sortable: true, hideOnMobile: true, cell: (r) => date(r.joiningDate) },
            { key: 'lastLoginAt', header: 'Last sign-in', hideOnMobile: true, cell: (r) => (r.lastLoginAt ? dateTime(r.lastLoginAt) : 'Never') },
            { key: 'status', header: 'Status', cell: (r) => <Badge>{r.deleted ? 'Removed' : r.status}</Badge> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (r) =>
                (r.canManage || (manage && r.deleted)) && (
                  <div className="flex justify-end gap-1">
                    {!r.deleted && (
                      <>
                        <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => setModal({ open: true, employee: r })}><Pencil className="size-4" /></button>
                        <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Set new password" onClick={() => setReset(r)}><KeyRound className="size-4" /></button>
                        {manage && r.id !== profile?.id && (
                          <button
                            className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            title="Remove"
                            onClick={async () => {
                              if (await confirm({ title: `Remove ${r.name}?`, message: 'Their login is disabled immediately. All their customers, orders and payments are kept.', danger: true, confirmLabel: 'Remove' })) remove.mutate(r.id);
                            }}
                          >
                            <UserX className="size-4" />
                          </button>
                        )}
                      </>
                    )}
                    {r.deleted && manage && <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Restore" onClick={() => restore.mutate(r.id)}><RotateCcw className="size-4" /></button>}
                  </div>
                ),
            },
          ]}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <EmployeeModal open={modal.open} employee={modal.employee} onClose={() => setModal({ open: false })} />
      <ResetPasswordModal employee={reset} onClose={() => setReset(null)} />
    </>
  );
}
