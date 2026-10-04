/**
 * Integration tests: run against the Firebase emulators after `npm run seed`.
 *
 *   npm run emulators   (terminal 1)
 *   npm run seed && npm test   (terminal 2)
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { todayYMD, round2 } from '@pbms/shared';
import { createApp } from '../app';
import { OWNER, SEED_PASSWORD } from '../seed/seed-data';

let server: Server;
let base = '';
const tokens: Record<string, string> = {};

async function signIn(email: string, password = SEED_PASSWORD) {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const b = (await res.json()) as { token: string };
  return b.token;
}

async function call(who: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data: data as any, type };
}

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  tokens.owner = await signIn(OWNER.email);
  tokens.priya = await signIn('priya@pbms.test');
  tokens.rahul = await signIn('rahul@pbms.test');
  tokens.pooja = await signIn('pooja@pbms.test');
});
after(() => server.close());

async function newOrder(who: string, total: number, advance = 0) {
  const mobile = `9${String(Date.now()).slice(-9)}`;
  const r = await call(who, 'POST', '/orders', {
    newCustomer: { name: `Test Customer ${mobile}`, mobile, email: '' },
    items: [{ serviceName: 'Plagiarism Check', category: 'Other', quantity: 1, unitPrice: total, discount: 0, taxPercent: 0 }],
    orderDate: todayYMD(),
    advance: advance ? { amount: advance, mode: 'Cash', txnNumber: '' } : undefined,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

describe('authentication and roles', () => {
  it('rejects requests without a token', async () => {
    const res = await fetch(`${base}/dashboard`);
    assert.equal(res.status, 401);
  });
  it('returns the signed-in profile with permissions', async () => {
    const r = await call('rahul', 'GET', '/me');
    assert.equal(r.status, 200);
    assert.equal(r.data.role, 'employee');
    assert.ok(r.data.permissions.includes('payments.create'));
    assert.ok(!r.data.permissions.includes('payments.void'));
  });
  it('blocks employees from admin areas', async () => {
    assert.equal((await call('rahul', 'GET', '/audit-logs')).status, 403);
    assert.equal((await call('rahul', 'POST', '/employees', {})).status, 403);
    assert.equal((await call('rahul', 'PUT', '/settings', {})).status, 403);
    assert.equal((await call('priya', 'PUT', '/settings', {})).status, 403);
  });
  it('limits employees to their own orders', async () => {
    const theirs = await newOrder('pooja', 1000);
    const r = await call('rahul', 'GET', `/orders/${theirs.order.id}`);
    assert.equal(r.status, 403);
    const list = await call('rahul', 'GET', '/orders?pageSize=500');
    assert.ok(list.data.items.every((o: any) => o.employeeId === list.data.items[0].employeeId));
  });
});

describe('financial rules', () => {
  it('computes balance and payment status from payments', async () => {
    const { order } = await newOrder('rahul', 5000, 2000);
    assert.equal(order.balance, 3000);
    assert.equal(order.paymentStatus, 'Partial');
    const p = await call('rahul', 'POST', '/payments', { orderId: order.id, amount: 3000, date: todayYMD(), mode: 'UPI', txnNumber: `T${Date.now()}` });
    assert.equal(p.status, 201);
    assert.equal(p.data.order.balance, 0);
    assert.equal(p.data.order.paymentStatus, 'Paid');
  });
  it('rejects a payment larger than the outstanding balance', async () => {
    const { order } = await newOrder('rahul', 1000, 400);
    const r = await call('rahul', 'POST', '/payments', { orderId: order.id, amount: 700, date: todayYMD(), mode: 'Cash' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /cannot exceed outstanding balance/i);
  });
  it('rejects negative and zero amounts', async () => {
    const { order } = await newOrder('rahul', 1000);
    assert.equal((await call('rahul', 'POST', '/payments', { orderId: order.id, amount: -5, date: todayYMD(), mode: 'Cash' })).status, 400);
    assert.equal((await call('rahul', 'POST', '/expenses', { date: todayYMD(), category: 'Travel', description: 'x', amount: -100, mode: 'Cash' })).status, 400);
    assert.equal((await call('rahul', 'POST', '/expenses', { date: todayYMD(), category: 'Travel', description: 'x', amount: 0, mode: 'Cash' })).status, 400);
  });
  it('rejects duplicate transaction numbers', async () => {
    const { order } = await newOrder('rahul', 5000);
    const txn = `DUP${Date.now()}`;
    assert.equal((await call('rahul', 'POST', '/payments', { orderId: order.id, amount: 100, date: todayYMD(), mode: 'UPI', txnNumber: txn })).status, 201);
    const r = await call('rahul', 'POST', '/payments', { orderId: order.id, amount: 100, date: todayYMD(), mode: 'UPI', txnNumber: txn });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /already exists/);
  });
  it('rejects an advance above the order total', async () => {
    const mobile = `8${String(Date.now()).slice(-9)}`;
    const r = await call('rahul', 'POST', '/orders', {
      newCustomer: { name: 'Adv Test', mobile },
      items: [{ serviceName: 'X', category: 'Other', quantity: 1, unitPrice: 1000 }],
      orderDate: todayYMD(),
      advance: { amount: 1500, mode: 'Cash' },
    });
    assert.equal(r.status, 400);
  });
  it('requires manager rights and a reason to change an order amount, and audits it', async () => {
    const { order } = await newOrder('rahul', 5000, 1000);
    const items = [{ ...order.items[0], unitPrice: 6000 }];
    assert.equal((await call('rahul', 'PUT', `/orders/${order.id}`, { items, reason: 'extra' })).status, 403);
    const noReason = await call('priya', 'PUT', `/orders/${order.id}`, { items });
    assert.equal(noReason.status, 400);
    const ok = await call('priya', 'PUT', `/orders/${order.id}`, { items, reason: 'Additional service' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.totalAmount, 6000);
    assert.equal(ok.data.balance, 5000);
    const log = await call('owner', 'GET', `/audit-logs?recordId=${order.id}`);
    const entry = log.data.items.find((a: any) => a.action === 'amount_change');
    assert.ok(entry, 'amount change audited');
    assert.equal(entry.reason, 'Additional service');
    assert.equal(entry.oldValue.totalAmount, 5000);
    assert.equal(entry.newValue.totalAmount, 6000);
  });
  it('does not allow a new total below what has been paid', async () => {
    const { order } = await newOrder('rahul', 5000, 4000);
    const r = await call('priya', 'PUT', `/orders/${order.id}`, { items: [{ ...order.items[0], unitPrice: 3000 }], reason: 'Wrong price' });
    assert.equal(r.status, 400);
  });
  it('never reuses record numbers (orders, sales, payments)', async () => {
    await newOrder('rahul', 1000, 300);
    await newOrder('rahul', 2000, 500);
    for (const [path, key] of [['/payments?showVoided=true', 'paymentNo'], ['/orders?includeDeleted=true', 'orderNo'], ['/sales?all=1', 'saleNo']] as const) {
      const r = await call('owner', 'GET', `${path}&pageSize=500&from=2000-01-01`);
      const nums = r.data.items.map((x: any) => x[key]);
      assert.equal(new Set(nums).size, nums.length, `duplicate ${key}`);
    }
  });
  it('keeps customer balances equal to the sum of their order balances', async () => {
    const customers = await call('owner', 'GET', '/customers?pageSize=500');
    const orders = await call('owner', 'GET', '/orders?pageSize=500');
    for (const c of customers.data.items) {
      const expected = round2(orders.data.items.filter((o: any) => o.customerId === c.id && !o.deleted).reduce((a: number, o: any) => a + o.balance, 0));
      assert.equal(round2(c.balance), expected, `customer ${c.customerNo}`);
    }
  });
  it('prevents employees voiding payments and deleting orders', async () => {
    const { order, payment } = await newOrder('rahul', 1000, 500);
    assert.equal((await call('rahul', 'POST', `/payments/${payment.id}/void`, { reason: 'mistake' })).status, 403);
    assert.equal((await call('priya', 'DELETE', `/orders/${order.id}`, { reason: 'test' })).status, 403);
    // Owner can void (with reason); balance returns.
    const v = await call('owner', 'POST', `/payments/${payment.id}/void`, { reason: 'Entered twice' });
    assert.equal(v.status, 200);
    assert.equal(v.data.order.balance, 1000);
  });
});

describe('expense workflow', () => {
  it('employee submits, cannot approve; manager approves', async () => {
    const e = await call('rahul', 'POST', '/expenses', { date: todayYMD(), category: 'Courier', description: 'Test courier', amount: 150, mode: 'Cash' });
    assert.equal(e.status, 201);
    assert.equal(e.data.approvalStatus, 'Pending');
    assert.equal((await call('rahul', 'PUT', `/expenses/${e.data.id}/approve`, { decision: 'Approved' })).status, 403);
    const a = await call('priya', 'PUT', `/expenses/${e.data.id}/approve`, { decision: 'Approved' });
    assert.equal(a.status, 200);
    assert.equal(a.data.approvalStatus, 'Approved');
  });
  it('manager cannot approve their own expense', async () => {
    const e = await call('priya', 'POST', '/expenses', { date: todayYMD(), category: 'Travel', description: 'Own', amount: 100, mode: 'Cash' });
    const r = await call('priya', 'PUT', `/expenses/${e.data.id}/approve`, { decision: 'Approved' });
    assert.equal(r.status, 403);
  });
});

describe('reports and search', () => {
  it('builds every report', async () => {
    for (const key of ['daily-sales', 'monthly-sales', 'expenses', 'collections', 'outstanding', 'employee-performance', 'customers', 'colleges', 'service-revenue', 'profit-loss', 'orders', 'transactions']) {
      const r = await call('owner', 'GET', `/reports/${key}?from=2026-01-01&to=${todayYMD()}`);
      assert.equal(r.status, 200, key);
      assert.ok(Array.isArray(r.data.rows), key);
    }
  });
  it('exports PDF, Excel and CSV', async () => {
    const pdf = await call('owner', 'GET', '/reports/orders/export?format=pdf');
    assert.equal(pdf.status, 200);
    assert.equal(Buffer.from(pdf.data).subarray(0, 4).toString(), '%PDF');
    const xlsx = await call('owner', 'GET', '/reports/orders/export?format=xlsx');
    assert.equal(Buffer.from(xlsx.data).subarray(0, 2).toString(), 'PK');
    const csv = await call('owner', 'GET', '/reports/orders/export?format=csv');
    assert.match(Buffer.from(csv.data).toString('utf8'), /Order ID/);
  });
  it('dashboard figures match the underlying records', async () => {
    const dash = await call('owner', 'GET', `/dashboard?from=2000-01-01&to=${todayYMD()}`);
    const orders = await call('owner', 'GET', '/orders?pageSize=500');
    const live = orders.data.items.filter((o: any) => !o.deleted);
    assert.equal(dash.data.overview.totalOrders, live.length);
    assert.equal(dash.data.overview.totalSales, round2(live.reduce((a: number, o: any) => a + o.billedAmount, 0)));
  });
  it('generates an invoice PDF', async () => {
    const { order } = await newOrder('rahul', 2500, 1000);
    const inv = await call('rahul', 'POST', `/orders/${order.id}/invoice`);
    assert.equal(inv.status, 200);
    assert.match(inv.data.invoiceNo, /^INV-\d{4}-\d{5}$/);
    const pdf = await call('rahul', 'GET', `/invoices/${inv.data.id}/pdf`);
    assert.equal(Buffer.from(pdf.data).subarray(0, 4).toString(), '%PDF');
  });
  it('global search finds customers by mobile and order ID', async () => {
    const byMobile = await call('owner', 'GET', '/search?q=9765400001');
    assert.ok(byMobile.data.results.some((g: any) => g.group === 'Customers'));
    const orders = await call('owner', 'GET', '/orders?pageSize=1');
    const byOrder = await call('owner', 'GET', `/search?q=${orders.data.items[0].orderNo}`);
    assert.ok(byOrder.data.results.some((g: any) => g.group === 'Orders'));
  });
});

describe('conference master', () => {
  const base = {
    name: 'Test Conference on Data Science',
    level: 'National',
    mode: 'Online',
    startDate: '2026-12-10',
    endDate: '2026-12-11',
    registrationFee: 2000,
    publicationFee: 500,
    status: 'Registration Open',
  };

  it('is visible to every employee', async () => {
    const r = await call('rahul', 'GET', '/conference-events?pageSize=100');
    assert.equal(r.status, 200);
    assert.ok(r.data.items.length > 0);
    const opts = await call('pooja', 'GET', '/conference-events/options');
    assert.equal(opts.status, 200);
  });

  it('employees cannot create, edit or delete conferences', async () => {
    const r = await call('rahul', 'POST', '/conference-events', { ...base, code: `EMP-${Date.now()}` });
    assert.equal(r.status, 403);
    const any = (await call('rahul', 'GET', '/conference-events?pageSize=1')).data.items[0];
    assert.equal((await call('rahul', 'PUT', `/conference-events/${any.id}`, { ...any, name: 'Hacked' })).status, 403);
    assert.equal((await call('rahul', 'DELETE', `/conference-events/${any.id}`, { reason: 'test' })).status, 403);
  });

  it('managers and the owner have full CRUD', async () => {
    const code = `MGR-${Date.now()}`;
    const c = await call('priya', 'POST', '/conference-events', { ...base, code });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    assert.match(c.data.conferenceNo, /^CONF-\d{4}-\d{5}$/);
    assert.equal((await call('priya', 'POST', '/conference-events', { ...base, code })).status, 409, 'duplicate code rejected');
    const u = await call('owner', 'PUT', `/conference-events/${c.data.id}`, { ...c.data, venue: 'Online (Meet)' });
    assert.equal(u.status, 200);
    assert.equal(u.data.venue, 'Online (Meet)');
    assert.equal((await call('priya', 'DELETE', `/conference-events/${c.data.id}`, { reason: 'Created by mistake' })).status, 200);
    assert.equal((await call('rahul', 'GET', `/conference-events/${c.data.id}`)).status, 404, 'deleted hidden from employees');
    assert.equal((await call('priya', 'POST', `/conference-events/${c.data.id}/restore`)).status, 200);
  });

  it('registrations must link to an open conference and copy its details', async () => {
    const ev = await call('priya', 'POST', '/conference-events', { ...base, code: `REG-${Date.now()}`, organizerName: 'Test College' });
    const mobile = `7${String(Date.now()).slice(-9)}`;
    const reg = await call('rahul', 'POST', '/modules/conferences', {
      newCustomer: { name: 'Conf Author', mobile },
      conferenceEventId: ev.data.id,
      conferenceName: 'typed by client — ignored',
      paperTitle: 'A study',
      price: 2000,
      fees: 500,
      date: todayYMD(),
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));
    assert.equal(reg.data.moduleRecord.conferenceName, base.name);
    assert.equal(reg.data.moduleRecord.conferenceNumber, ev.data.code);
    assert.equal(reg.data.moduleRecord.collegeName, 'Test College');
    assert.equal(reg.data.order.totalAmount, 2500);

    const missing = await call('rahul', 'POST', '/modules/conferences', { newCustomer: { name: 'X', mobile: `6${mobile.slice(1)}` }, paperTitle: 'x', date: todayYMD() });
    assert.equal(missing.status, 400);

    // Cannot delete a conference that has registrations; closing blocks new ones.
    assert.equal((await call('priya', 'DELETE', `/conference-events/${ev.data.id}`, { reason: 'x' })).status, 400);
    await call('priya', 'PUT', `/conference-events/${ev.data.id}`, { ...ev.data, status: 'Registration Closed' });
    const closed = await call('rahul', 'POST', '/modules/conferences', { newCustomer: { name: 'Late Author', mobile: `8${mobile.slice(1)}` }, conferenceEventId: ev.data.id, paperTitle: 'late', date: todayYMD() });
    assert.equal(closed.status, 400);
    assert.match(closed.data.error, /closed/i);

    // Detail shows the registration and totals.
    const detail = await call('priya', 'GET', `/conference-events/${ev.data.id}`);
    assert.equal(detail.data.summary.registrations, 1);
    assert.equal(detail.data.summary.revenue, 2500);
  });
});

describe('database login and password management', () => {
  const stamp = Date.now();
  const person = (role: string, tag: string) => ({
    name: `Test ${tag} ${stamp}`,
    email: `${tag}.${stamp}@pbms.test`,
    mobile: '',
    role,
    department: 'Sales',
    joiningDate: todayYMD(),
    status: 'Active',
    password: 'Start@1234',
  });
  async function login(email: string, password: string) {
    const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    return { status: res.status, data: (await res.json()) as any };
  }
  async function withToken(token: string, method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as any };
  }

  it('signs in against the database and rejects wrong passwords', async () => {
    const bad = await login(OWNER.email, 'wrong-password-1');
    assert.equal(bad.status, 401);
    assert.equal(bad.data.error, 'Incorrect email or password.');
    const unknown = await login('nobody@pbms.test', 'whatever1');
    assert.equal(unknown.status, 401);
    const ok = await login(OWNER.email.toUpperCase(), SEED_PASSWORD);
    assert.equal(ok.status, 200);
    assert.ok(ok.data.token.length > 30);
  });

  it('logout ends the session', async () => {
    const { data } = await login('sneha@pbms.test', SEED_PASSWORD);
    assert.equal((await withToken(data.token, 'GET', '/me')).status, 200);
    await withToken(data.token, 'POST', '/auth/logout');
    assert.equal((await withToken(data.token, 'GET', '/me')).status, 401);
  });

  it('never returns password hashes', async () => {
    const r = await call('owner', 'GET', '/employees?pageSize=100');
    assert.ok(!JSON.stringify(r.data).includes('scrypt$'));
    assert.ok(r.data.items.every((u: any) => !('passwordHash' in u)));
  });

  it('Super Admin creates managers and employees and sets their passwords', async () => {
    const mgr = await call('owner', 'POST', '/employees', person('manager', 'mgr'));
    assert.equal(mgr.status, 201, JSON.stringify(mgr.data));
    const emp = await call('owner', 'POST', '/employees', person('employee', 'emp'));
    assert.equal(emp.status, 201);
    const mgrLogin = await login(`mgr.${stamp}@pbms.test`, 'Start@1234');
    assert.equal(mgrLogin.status, 200, 'new manager can sign in');

    // Owner sets a new password for the manager: old password and old session stop working.
    assert.equal((await call('owner', 'POST', `/employees/${mgr.data.id}/reset-password`, { password: 'Owner@5678' })).status, 200);
    assert.equal((await login(`mgr.${stamp}@pbms.test`, 'Start@1234')).status, 401);
    assert.equal((await withToken(mgrLogin.data.token, 'GET', '/me')).status, 401, 'old session revoked');
    assert.equal((await login(`mgr.${stamp}@pbms.test`, 'Owner@5678')).status, 200);
    assert.equal((await call('owner', 'POST', `/employees/${emp.data.id}/reset-password`, { password: 'Owner@9999' })).status, 200);
    assert.equal((await login(`emp.${stamp}@pbms.test`, 'Owner@9999')).status, 200);
  });

  it('Managers create employees and set employee passwords only', async () => {
    const created = await call('priya', 'POST', '/employees', person('employee', 'staff'));
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal((await login(`staff.${stamp}@pbms.test`, 'Start@1234')).status, 200);
    assert.equal((await call('priya', 'POST', `/employees/${created.data.id}/reset-password`, { password: 'Mgr@24680' })).status, 200);
    assert.equal((await login(`staff.${stamp}@pbms.test`, 'Mgr@24680')).status, 200);

    // Editing an employee works; promoting them to manager does not.
    assert.equal((await call('priya', 'PUT', `/employees/${created.data.id}`, { ...created.data, department: 'Publication' })).status, 200);
    assert.equal((await call('priya', 'PUT', `/employees/${created.data.id}`, { ...created.data, role: 'manager' })).status, 403);

    // Cannot create managers or Super Admins, or touch managers / the owner.
    assert.equal((await call('priya', 'POST', '/employees', person('manager', 'nope'))).status, 403);
    assert.equal((await call('priya', 'POST', '/employees', person('super_admin', 'nope2'))).status, 403);
    const users = (await call('owner', 'GET', '/employees?pageSize=200')).data.items;
    const owner = users.find((u: any) => u.role === 'super_admin');
    const otherMgr = users.find((u: any) => u.role === 'manager' && u.email !== 'priya@pbms.test');
    assert.equal((await call('priya', 'POST', `/employees/${owner.id}/reset-password`, { password: 'Hack@1234' })).status, 403);
    assert.equal((await call('priya', 'POST', `/employees/${otherMgr.id}/reset-password`, { password: 'Hack@1234' })).status, 403);
    assert.equal((await call('priya', 'PUT', `/employees/${otherMgr.id}`, { ...otherMgr, name: 'Renamed' })).status, 403);

    // The manager's list marks only employees as manageable; assignable roles = Employee only.
    const mine = (await call('priya', 'GET', '/employees?pageSize=200')).data.items;
    assert.ok(mine.filter((u: any) => u.canManage).every((u: any) => u.role === 'employee'));
    const roles = (await call('priya', 'GET', '/employees/assignable-roles')).data;
    assert.deepEqual(roles.map((r: any) => r.id), ['employee']);
  });

  it('employees cannot create users or set passwords', async () => {
    const users = (await call('owner', 'GET', '/employees?pageSize=200')).data.items;
    const pooja = users.find((u: any) => u.email === 'pooja@pbms.test');
    assert.equal((await call('rahul', 'POST', `/employees/${pooja.id}/reset-password`, { password: 'Hack@1234' })).status, 403);
    assert.equal((await call('rahul', 'POST', '/employees', person('employee', 'x'))).status, 403);
  });

  it('users change their own password with the current one', async () => {
    const email = `emp.${stamp}@pbms.test`;
    const { data } = await login(email, 'Owner@9999');
    assert.equal((await withToken(data.token, 'POST', '/auth/change-password', { currentPassword: 'wrong1234', newPassword: 'Mine@2468' })).status, 400);
    assert.equal((await withToken(data.token, 'POST', '/auth/change-password', { currentPassword: 'Owner@9999', newPassword: 'Mine@2468' })).status, 200);
    assert.equal((await login(email, 'Owner@9999')).status, 401);
    assert.equal((await login(email, 'Mine@2468')).status, 200);
  });

  it('locks an account after 5 wrong passwords', async () => {
    const email = `staff.${stamp}@pbms.test`;
    for (let i = 0; i < 5; i++) await login(email, `Wrong@${i}000`);
    const locked = await login(email, 'Mgr@24680');
    assert.equal(locked.status, 403);
    assert.match(locked.data.error, /locked/i);
    // A manager setting a new password unlocks it.
    const users = (await call('owner', 'GET', '/employees?pageSize=200')).data.items;
    const staff = users.find((u: any) => u.email === email);
    await call('priya', 'POST', `/employees/${staff.id}/reset-password`, { password: 'Fresh@1357' });
    assert.equal((await login(email, 'Fresh@1357')).status, 200);
  });

  it('suspending a user blocks sign-in and ends their sessions', async () => {
    const email = `staff.${stamp}@pbms.test`;
    const { data } = await login(email, 'Fresh@1357');
    const users = (await call('priya', 'GET', '/employees?pageSize=200')).data.items;
    const staff = users.find((u: any) => u.email === email);
    assert.equal((await call('priya', 'PUT', `/employees/${staff.id}`, { ...staff, status: 'Suspended' })).status, 200);
    assert.equal((await withToken(data.token, 'GET', '/me')).status, 401);
    const blocked = await login(email, 'Fresh@1357');
    assert.equal(blocked.status, 403);
    assert.match(blocked.data.error, /suspended/i);
  });
});
