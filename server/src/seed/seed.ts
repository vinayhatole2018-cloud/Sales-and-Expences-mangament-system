/**
 * Development seed. Loads realistic demo data into the Firebase EMULATORS by
 * driving the real HTTP API as real signed-in employees, so every record goes
 * through the same validation, calculations and audit trail as production.
 *
 *   npm run emulators   (in one terminal)
 *   npm run seed        (in another)
 */
import type { AddressInfo } from 'node:net';
import { addDays, todayYMD, type ModuleKey } from '@pbms/shared';
import { config } from '../config';
import { createApp } from '../app';
import { ensureBaseData, ensureOwner } from './bootstrap';
import { invalidateDirectory } from '../lib/directory';
import { invalidateSettings } from '../lib/settings';
import { BUSINESS, COLLEGES, CONFERENCE_EVENTS, CUSTOMERS, EMPLOYEES, OWNER, SEED_PASSWORD, SERVICES, type EmpKey } from './seed-data';

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const today = todayYMD();
const ago = (n: number) => addDays(today, -n);

async function wipe() {
  const r = await fetch(`http://${FIRESTORE}/emulator/v1/projects/${config.projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Could not reach the Firestore emulator. Start it with `npm run emulators`.');
  invalidateDirectory();
  invalidateSettings();
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SEED_PASSWORD }),
  });
  const body = (await res.json()) as { token?: string; error?: string };
  if (!body.token) throw new Error(`Sign-in failed for ${email}: ${body.error}`);
  return body.token;
}

let base = '';
const tokens: Partial<Record<EmpKey, string>> = {};

async function api<T = any>(who: EmpKey, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} as ${who} → ${res.status}: ${data?.error ?? text}`);
  return data as T;
}

let txnSeq = 4100;
const txn = (mode: string) => (mode === 'Cash' ? '' : `${mode === 'UPI' ? 'UPI' : mode === 'Card' ? 'CRD' : 'NEFT'}${Date.now().toString().slice(-6)}${txnSeq++}`);

interface ModSeed {
  mod: ModuleKey;
  c: number;
  by: EmpKey;
  days: number;
  data: Record<string, unknown>;
  advance: number;
  mode: string;
  status?: string;
  reason?: string;
  due?: number;
  later?: { days: number; amount: number | 'rest'; mode: string }[];
}

const MODS: ModSeed[] = [
  // Research papers
  { mod: 'research-papers', c: 0, by: 'rahul', days: 80, data: { paperTitle: 'Deep Learning Approaches for Crop Disease Detection', paperType: 'Regular', journalName: 'International Journal of Advanced Computing', writingFees: 12000 }, advance: 5000, mode: 'UPI', status: 'Published', later: [{ days: 60, amount: 'rest', mode: 'Bank Transfer' }] },
  { mod: 'research-papers', c: 1, by: 'rahul', days: 77, data: { paperTitle: 'Thermal Analysis of Composite Brake Pads', paperType: 'Backdate', journalName: 'Journal of Mechanical Sciences', writingFees: 8000 }, advance: 3000, mode: 'Cash', status: 'Accepted', later: [{ days: 50, amount: 2000, mode: 'UPI' }] },
  { mod: 'research-papers', c: 2, by: 'sneha', days: 74, data: { paperTitle: 'Green Synthesis of Silver Nanoparticles Using Leaf Extract', paperType: 'Regular', journalName: 'Asian Journal of Chemistry', writingFees: 6000 }, advance: 6000, mode: 'UPI', status: 'Completed' },
  { mod: 'research-papers', c: 12, by: 'rahul', days: 29, data: { paperTitle: 'IoT Based Smart Energy Meter with Theft Detection', paperType: 'Regular', journalName: 'International Journal of Engineering Research', writingFees: 12000 }, advance: 4000, mode: 'UPI', status: 'Under Review', due: -1, later: [{ days: 10, amount: 3000, mode: 'Cash' }] },
  { mod: 'research-papers', c: 15, by: 'pooja', days: 17, data: { paperTitle: 'Impact of GST on MSMEs in the Vidarbha Region', paperType: 'Regular', journalName: 'UGC Care Economics Review', writingFees: 6000 }, advance: 2000, mode: 'Cash', status: 'Submitted', due: -2 },
  { mod: 'research-papers', c: 13, by: 'sneha', days: 25, data: { paperTitle: 'Probiotic Potential of Lactobacillus Strains from Curd', paperType: 'Conference', journalName: 'Proceedings of ICBS 2026', writingFees: 6000 }, advance: 0, mode: '', status: 'In Progress', later: [{ days: 5, amount: 2500, mode: 'UPI' }] },
  { mod: 'research-papers', c: 17, by: 'rahul', days: 7, data: { paperTitle: 'Behavioural Finance and Retail Investor Decisions', paperType: 'Certificate', journalName: 'Journal of Finance Studies', writingFees: 6000 }, advance: 3000, mode: 'Bank Transfer' },
  { mod: 'research-papers', c: 19, by: 'pooja', days: 0, data: { paperTitle: 'Blockchain for Academic Credential Verification', paperType: 'Regular', journalName: 'International Journal of Computer Science', writingFees: 12000 }, advance: 5000, mode: 'UPI' },
  // Conferences
  { mod: 'conferences', c: 4, by: 'pooja', days: 65, data: { conferenceName: 'International Conference on Pharmaceutical Sciences 2026', conferenceNumber: 'ICPS-2026', collegeName: 'Krishna Valley Institute of Pharmacy', paperTitle: 'Nanoemulsion Based Drug Delivery Systems', hardCopyRequired: true, pdfRequired: true, price: 3000, fees: 1500, authors: [{ name: 'Dr. Kavita Rane', mobile: '9765400005', email: 'kavita.rane@mail.test' }, { name: 'Neha Mane', mobile: '', email: '' }] }, advance: 4500, mode: 'UPI', status: 'Completed' },
  { mod: 'conferences', c: 6, by: 'sneha', days: 54, data: { conferenceName: 'National Conference on Education Reforms', conferenceNumber: 'NCER-12', collegeName: 'Konkan College of Education', paperTitle: 'NEP 2020 Implementation Challenges in Rural Schools', hardCopyRequired: false, pdfRequired: true, price: 1500, fees: 1000, authors: [{ name: 'Dr. Sameer Kulkarni', mobile: '9765400007', email: '' }] }, advance: 1000, mode: 'Cash', status: 'Presented', later: [{ days: 40, amount: 1500, mode: 'Cash' }] },
  { mod: 'conferences', c: 14, by: 'priya', days: 21, data: { conferenceName: 'International Conference on Emerging Engineering Trends', conferenceNumber: 'ICEET-2026', collegeName: 'Sahyadri College of Engineering', paperTitle: 'Conference proceedings volume (24 papers)', hardCopyRequired: true, pdfRequired: true, price: 45000, fees: 15000, authors: [{ name: 'Dr. S. R. Pawar', mobile: '9890011001', email: '' }, { name: 'Dr. Anjali Deshpande', mobile: '9765400001', email: '' }, { name: 'Dr. Prakash Nair', mobile: '9765400013', email: '' }] }, advance: 20000, mode: 'Bank Transfer', status: 'In Progress', due: -3, later: [{ days: 9, amount: 15000, mode: 'Bank Transfer' }] },
  { mod: 'conferences', c: 8, by: 'rahul', days: 47, data: { conferenceName: 'National Conference on Power Systems', conferenceNumber: 'NCPS-7', collegeName: 'Indrayani Polytechnic', paperTitle: 'Solar Inverter Efficiency Under Partial Shading', hardCopyRequired: true, pdfRequired: false, price: 2500, fees: 0, authors: [{ name: 'Prof. Vivek Joshi', mobile: '9765400009', email: '' }] }, advance: 0, mode: '', status: 'Cancelled', reason: 'Author withdrew the paper before submission.' },
  { mod: 'conferences', c: 16, by: 'amit', days: 11, data: { conferenceName: 'International Conference on Life Sciences', conferenceNumber: 'ICLS-2026', collegeName: 'Western Ghats University', paperTitle: 'Endemic Butterflies of the Northern Western Ghats', hardCopyRequired: false, pdfRequired: true, price: 3000, fees: 1500, authors: [{ name: 'Omkar Salunkhe', mobile: '9765400017', email: '' }] }, advance: 2000, mode: 'UPI', status: 'Accepted' },
  // Books
  { mod: 'books', c: 10, by: 'pooja', days: 40, data: { bookName: 'Rural Entrepreneurship in Maharashtra', pages: 220, copies: 100, writingAmount: 15000, publicationAmount: 20000, isbn: '978-93-5000-101-2' }, advance: 15000, mode: 'Bank Transfer', status: 'Printing', later: [{ days: 20, amount: 10000, mode: 'UPI' }] },
  { mod: 'books', c: 6, by: 'sneha', days: 52, data: { bookName: 'Pedagogy for the 21st Century Classroom', pages: 180, copies: 50, writingAmount: 0, publicationAmount: 18000, isbn: '978-93-5000-102-9' }, advance: 18000, mode: 'UPI', status: 'Delivered' },
  { mod: 'books', c: 9, by: 'priya', days: 44, data: { bookName: 'Medicinal Plants of Kolhapur District', pages: 250, copies: 200, writingAmount: 20000, publicationAmount: 30000, isbn: '978-93-5000-103-6' }, advance: 10000, mode: 'Cash', status: 'Editing', later: [{ days: 15, amount: 10000, mode: 'Bank Transfer' }] },
  { mod: 'books', c: 17, by: 'rahul', days: 6, data: { bookName: 'Corporate Finance: Concepts and Cases', pages: 300, copies: 100, writingAmount: 25000, publicationAmount: 25000, isbn: '' }, advance: 10000, mode: 'UPI', due: -20 },
  // PhD
  { mod: 'phd', c: 3, by: 'amit', days: 69, data: { subject: 'Commerce', researchTopic: 'Financial Inclusion through Microfinance in the Nagpur Region', pages: 280, bwPages: 250, colourPages: 30, copies: 5, typingCharges: 8000, writingCharges: 45000, bindingCharges: 3000, isbn: '' }, advance: 20000, mode: 'Bank Transfer', status: 'Printing', later: [{ days: 45, amount: 15000, mode: 'UPI' }, { days: 20, amount: 10000, mode: 'Cash' }] },
  { mod: 'phd', c: 7, by: 'amit', days: 51, data: { subject: 'Physics', researchTopic: 'Optical Properties of Doped ZnO Thin Films', pages: 220, bwPages: 200, colourPages: 20, copies: 4, typingCharges: 6000, writingCharges: 40000, bindingCharges: 2500, isbn: '' }, advance: 15000, mode: 'UPI', status: 'Writing', due: 2, later: [{ days: 30, amount: 10000, mode: 'UPI' }] },
  { mod: 'phd', c: 11, by: 'amit', days: 35, data: { subject: 'Civil Engineering', researchTopic: 'Performance of Recycled Aggregate Concrete', pages: 0, bwPages: 0, colourPages: 0, copies: 0, typingCharges: 0, writingCharges: 55000, bindingCharges: 0, isbn: '' }, advance: 20000, mode: 'Bank Transfer', status: 'Research' },
  { mod: 'phd', c: 16, by: 'amit', days: 10, data: { subject: 'Zoology', researchTopic: 'Butterfly Diversity of the Western Ghats', pages: 300, bwPages: 260, colourPages: 40, copies: 6, typingCharges: 9000, writingCharges: 0, bindingCharges: 4000, isbn: '978-93-5000-104-3' }, advance: 13000, mode: 'UPI', status: 'Completed' },
  // Awards
  { mod: 'awards', c: 9, by: 'priya', days: 43, data: { awardName: 'Best Researcher Award 2026', awardCategory: 'Life Sciences', place: 'Kolhapur', year: 2026, amount: 5000 }, advance: 5000, mode: 'UPI', status: 'Completed' },
  { mod: 'awards', c: 0, by: 'rahul', days: 33, data: { awardName: 'Excellence in Teaching Award', awardCategory: 'Engineering', place: 'Pune', year: 2026, amount: 5000 }, advance: 2000, mode: 'Cash', status: 'Confirmed' },
  { mod: 'awards', c: 5, by: 'pooja', days: 3, data: { awardName: 'Young Innovator Award', awardCategory: 'Management', place: 'Mumbai', year: 2026, amount: 4000 }, advance: 0, mode: '' },
  // Certificates
  { mod: 'certificates', c: 14, by: 'priya', days: 20, data: { certificateName: 'ICEET 2026 Participation Certificates', certificateType: 'Participation', quantity: 120, price: 250 }, advance: 15000, mode: 'Bank Transfer', status: 'Printed', later: [{ days: 8, amount: 15000, mode: 'Bank Transfer' }] },
  { mod: 'certificates', c: 18, by: 'priya', days: 3, data: { certificateName: 'Reviewer Certificates — Pharma Journal', certificateType: 'Reviewer', quantity: 10, price: 1500 }, advance: 5000, mode: 'UPI', status: 'In Progress' },
  { mod: 'certificates', c: 13, by: 'sneha', days: 2, data: { certificateName: 'Workshop Participation Certificate', certificateType: 'Participation', quantity: 1, price: 300 }, advance: 300, mode: 'Cash', status: 'Delivered' },
];

const EXPENSES: { by: EmpKey; days: number; category: string; description: string; amount: number; mode: string; review?: { by: EmpKey; decision: 'Approved' | 'Rejected'; remarks?: string } }[] = [
  { by: 'rahul', days: 60, category: 'Travel', description: 'Visit to Sahyadri College for author meetings', amount: 850, mode: 'Cash', review: { by: 'priya', decision: 'Approved' } },
  { by: 'rahul', days: 30, category: 'Courier', description: 'Journal hard copies couriered to authors', amount: 240, mode: 'UPI', review: { by: 'priya', decision: 'Approved' } },
  { by: 'rahul', days: 2, category: 'Travel', description: 'Nagpur trip for conference coordination', amount: 1200, mode: 'Cash' },
  { by: 'sneha', days: 50, category: 'Printing', description: 'Printing of 50 book copies (proof run)', amount: 3200, mode: 'Bank Transfer', review: { by: 'priya', decision: 'Approved' } },
  { by: 'sneha', days: 20, category: 'Stationery', description: 'Personal diary and pens', amount: 450, mode: 'Cash', review: { by: 'priya', decision: 'Rejected', remarks: 'Personal purchase — not reimbursable.' } },
  { by: 'sneha', days: 1, category: 'Courier', description: 'Certificates dispatched to Ratnagiri', amount: 180, mode: 'UPI' },
  { by: 'amit', days: 40, category: 'Printing', description: 'PhD thesis colour pages printing', amount: 5600, mode: 'Bank Transfer', review: { by: 'priya', decision: 'Approved' } },
  { by: 'amit', days: 14, category: 'Travel', description: 'Kolhapur visit for thesis submission', amount: 2100, mode: 'UPI', review: { by: 'priya', decision: 'Approved' } },
  { by: 'pooja', days: 35, category: 'Marketing', description: 'Facebook and Instagram ads — September campaign', amount: 4000, mode: 'Card', review: { by: 'priya', decision: 'Approved' } },
  { by: 'pooja', days: 0, category: 'Stationery', description: 'Letterheads and envelopes', amount: 650, mode: 'Cash' },
  { by: 'priya', days: 25, category: 'Travel', description: 'ICEET 2026 planning meeting, Pune', amount: 1500, mode: 'Cash', review: { by: 'owner', decision: 'Approved' } },
  { by: 'priya', days: 10, category: 'Office', description: 'Office chair replacement', amount: 2300, mode: 'Card', review: { by: 'owner', decision: 'Rejected', remarks: 'Already paid from office petty cash.' } },
  { by: 'owner', days: 45, category: 'Hosting', description: 'Website hosting — annual renewal', amount: 3500, mode: 'Card' },
  { by: 'owner', days: 15, category: 'Internet', description: 'Office broadband — quarterly bill', amount: 1180, mode: 'UPI' },
  { by: 'owner', days: 28, category: 'Salary', description: 'Part-time designer salary', amount: 12000, mode: 'Bank Transfer' },
];

/**
 * Loads the demo data through the API. With `wipe` (emulators only) the
 * database is emptied first; without it the target database must be empty.
 */
export async function loadDemoData(opts: { wipe: boolean }) {
  if (opts.wipe) {
    console.log('Wiping emulator data…');
    await wipe();
  }
  await ensureBaseData({ ...BUSINESS });
  await ensureOwner({ ...OWNER, password: SEED_PASSWORD });

  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  tokens.owner = await signIn(OWNER.email);

  console.log('Employees…');
  const empIds: Record<string, string> = {};
  for (const e of EMPLOYEES) {
    const { key, ...body } = e;
    const created = await api('owner', 'POST', '/employees', { ...body, status: 'Active', password: SEED_PASSWORD });
    empIds[key] = created.id;
    tokens[key] = await signIn(e.email);
  }

  console.log('Services…');
  for (const s of SERVICES) await api('owner', 'POST', '/services', { ...s, taxPercent: 0, status: 'Active' });

  console.log('Colleges…');
  const collegeIds: string[] = [];
  for (const [i, c] of COLLEGES.entries()) {
    const created = await api('priya', 'POST', '/colleges', { ...c, address: `${c.city}, ${c.state}`, assignedEmployeeId: empIds[['rahul', 'sneha', 'amit', 'pooja'][i % 4]] });
    collegeIds.push(created.id);
  }

  console.log('Customers…');
  const customerIds: string[] = [];
  for (const [name, mobile, email, type, collegeIdx, designation, department, city, by, days] of CUSTOMERS) {
    const created = await api(by, 'POST', '/customers', {
      name,
      mobile,
      email,
      customerType: type,
      collegeId: collegeIdx >= 0 ? collegeIds[collegeIdx] : '',
      designation,
      department,
      city,
      state: 'Maharashtra',
      dateAdded: ago(days),
      notes: '',
      status: 'Active',
    });
    customerIds.push(created.id);
  }

  console.log('Conferences…');
  const eventIds: Record<string, string> = {};
  for (const e of CONFERENCE_EVENTS) {
    const c = COLLEGES[e.college];
    const created = await api('priya', 'POST', '/conference-events', {
      name: e.name,
      code: e.code,
      level: e.level,
      theme: e.theme,
      organizerCollegeId: collegeIds[e.college],
      mode: e.mode,
      venue: e.venue,
      city: e.city,
      startDate: addDays(today, e.start),
      endDate: addDays(today, e.start + e.days - 1),
      registrationDeadline: addDays(today, e.start - 5),
      registrationFee: e.registrationFee,
      publicationFee: e.publicationFee,
      publicationDetails: e.publicationDetails,
      coordinatorName: c.contactPerson,
      coordinatorMobile: c.mobile,
      coordinatorEmail: c.email,
      status: 'Registration Open',
      notes: '',
    });
    eventIds[e.code] = created.id;
  }

  console.log('Publication records, orders and payments…');
  const created: { seed: ModSeed; record: any; order: any }[] = [];
  for (const m of MODS) {
    if (m.mod === 'conferences') m.data.conferenceEventId = eventIds[String(m.data.conferenceNumber)];
    const date = ago(m.days);
    const res = await api(m.by, 'POST', `/modules/${m.mod}`, {
      ...m.data,
      customerId: customerIds[m.c],
      date,
      expectedDate: m.due !== undefined ? addDays(today, -m.due) : addDays(date, 30),
      advance: m.advance,
      paymentMode: m.mode,
      txnNumber: m.advance ? txn(m.mode) : '',
      remarks: '',
    });
    created.push({ seed: m, record: res.moduleRecord, order: res.order });
  }

  // Additional generic orders (multiple services on one order).
  const svc = await api('owner', 'GET', '/services?pageSize=100');
  const byName = (n: string) => svc.items.find((s: any) => s.name === n);
  const item = (n: string, quantity: number, discount = 0) => {
    const s = byName(n);
    return { serviceId: s.id, serviceName: s.name, category: s.category, quantity, unitPrice: s.basePrice, discount, taxPercent: 0 };
  };
  const o1 = await api('rahul', 'POST', '/orders', { customerId: customerIds[1], items: [item('Plagiarism Check', 2), item('Formatting & Proofreading', 1, 300)], orderDate: ago(58), expectedDate: ago(54), priority: 'High', notes: 'Two drafts to check.', advance: { amount: 1000, mode: 'Cash', txnNumber: '', date: ago(58) } });
  await api('rahul', 'POST', '/payments', { orderId: o1.order.id, amount: 1800, date: ago(56), mode: 'UPI', txnNumber: txn('UPI'), remarks: 'Balance cleared' });
  await api('rahul', 'PUT', `/orders/${o1.order.id}`, { status: 'Completed' });
  await api('rahul', 'POST', `/orders/${o1.order.id}/invoice`);
  const o2 = await api('priya', 'POST', '/orders', { customerId: customerIds[18], items: [item('Book Chapter Publication', 3, 1000)], orderDate: ago(4), expectedDate: addDays(today, 2), priority: 'Urgent', notes: 'Three chapters for the edited volume.', employeeId: empIds.sneha, advance: { amount: 7000, mode: 'Bank Transfer', txnNumber: txn('Bank Transfer'), date: ago(4) } });
  await api('sneha', 'PUT', `/orders/${o2.order.id}`, { status: 'In Progress' });
  await api('pooja', 'POST', '/orders', { customerId: customerIds[19], items: [item('Plagiarism Check', 1)], orderDate: ago(1), expectedDate: addDays(today, 1), priority: 'Normal', notes: '' });

  // Follow-up payments, oldest first so balances evolve realistically.
  const followUps = created
    .flatMap((c) => (c.seed.later ?? []).map((l) => ({ ...l, c })))
    .sort((a, b) => b.days - a.days);
  for (const f of followUps) {
    const detail = await api(f.c.seed.by, 'GET', `/orders/${f.c.order.id}`);
    const amount = f.amount === 'rest' ? detail.order.balance : f.amount;
    await api(f.c.seed.by, 'POST', '/payments', { orderId: f.c.order.id, amount, date: ago(f.days), mode: f.mode, txnNumber: txn(f.mode), remarks: '' });
  }

  // Move records along their workflow.
  for (const c of created) {
    if (!c.seed.status) continue;
    await api(c.seed.by, 'PUT', `/modules/${c.seed.mod}/${c.record.id}`, { ...c.seed.data, status: c.seed.status, reason: c.seed.reason ?? '' });
  }
  // Past conferences are finished; future ones stay open or upcoming.
  for (const e of CONFERENCE_EVENTS) {
    if (e.finalStatus === 'Registration Open') continue;
    const current = (await api('owner', 'GET', `/conference-events/${eventIds[e.code]}`)).event;
    await api('priya', 'PUT', `/conference-events/${eventIds[e.code]}`, { ...current, status: e.finalStatus });
  }
  // Invoices for a few completed jobs.
  for (const c of created.filter((x) => ['Completed', 'Published', 'Delivered'].includes(x.seed.status ?? '')).slice(0, 4)) {
    await api(c.seed.by, 'POST', `/orders/${c.order.id}/invoice`);
  }

  console.log('Expenses…');
  for (const e of EXPENSES) {
    const exp = await api(e.by, 'POST', '/expenses', { date: ago(e.days), category: e.category, description: e.description, amount: e.amount, mode: e.mode, remarks: '' });
    if (e.review) await api(e.review.by, 'PUT', `/expenses/${exp.id}/approve`, { decision: e.review.decision, remarks: e.review.remarks ?? '' });
  }

  const dash = await api('owner', 'GET', '/dashboard');
  server.close();
  console.log('\nSeed complete.');
  console.log(`  Orders this month: ${dash.overview.totalOrders}   Sales: ₹${dash.overview.totalSales}   Collected: ₹${dash.overview.totalCollection}   Outstanding (all): ₹${dash.overview.pendingAmount}`);
  console.log(`  Sign in as the owner (${OWNER.email}) or any employee in src/seed/seed-data.ts.`);
  return dash;
}

// CLI: `npm run seed` — emulators only; wipes the database and reloads the demo.
const isCli = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('seed/seed.ts');
if (isCli) {
  if (!config.useEmulators) {
    console.error('Refusing to seed: `npm run seed` wipes the database and only runs against the local emulators. For a live project use `npm run setup:prod -- --with-demo`.');
    process.exit(1);
  }
  loadDemoData({ wipe: true })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('\nSeed failed:', e.message ?? e);
      process.exit(1);
    });
}
