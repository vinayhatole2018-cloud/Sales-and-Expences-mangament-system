/**
 * Development seed data. These are TEST accounts for the local Firebase
 * emulator only — the seed script refuses to run against a real project.
 */

export const SEED_PASSWORD = 'Pbms@2026';

export const OWNER = { name: 'Vinay', email: 'vinay@pbms.test', mobile: '9822000001' };

export const EMPLOYEES = [
  { key: 'priya', name: 'Priya Sharma', email: 'priya@pbms.test', mobile: '9822000002', role: 'manager', department: 'Management', joiningDate: '2024-06-10' },
  { key: 'rahul', name: 'Rahul Patil', email: 'rahul@pbms.test', mobile: '9822000003', role: 'employee', department: 'Sales', joiningDate: '2024-08-01' },
  { key: 'sneha', name: 'Sneha Kulkarni', email: 'sneha@pbms.test', mobile: '9822000004', role: 'employee', department: 'Publication', joiningDate: '2025-01-15' },
  { key: 'amit', name: 'Amit Deshmukh', email: 'amit@pbms.test', mobile: '9822000005', role: 'employee', department: 'Writing', joiningDate: '2025-04-01' },
  { key: 'pooja', name: 'Pooja Joshi', email: 'pooja@pbms.test', mobile: '9822000006', role: 'employee', department: 'Sales', joiningDate: '2025-07-21' },
] as const;
export type EmpKey = (typeof EMPLOYEES)[number]['key'] | 'owner';

export const BUSINESS = {
  businessName: 'Vinay Publications & Research Services',
  tagline: 'Research Papers • Conferences • Books • PhD Support',
  address: 'Office 12, Shivaji Nagar, Pune, Maharashtra 411005',
  phone: '+91 98220 00001',
  email: 'accounts@pbms.test',
  website: 'www.pbms.test',
};

export const SERVICES = [
  { name: 'Research Paper Publication (Scopus)', category: 'Research Paper', basePrice: 12000, description: 'Writing support and publication in a Scopus indexed journal.' },
  { name: 'Research Paper Publication (UGC Care)', category: 'Research Paper', basePrice: 6000, description: 'Publication in a UGC Care listed journal.' },
  { name: 'Backdate Paper Publication', category: 'Research Paper', basePrice: 8000, description: 'Publication in an earlier journal issue.' },
  { name: 'International Conference Paper', category: 'Conference', basePrice: 4500, description: 'Registration, presentation and proceedings.' },
  { name: 'National Conference Paper', category: 'Conference', basePrice: 2500, description: 'National conference registration and certificate.' },
  { name: 'Book Writing & Publication', category: 'Book', basePrice: 25000, description: 'Writing, editing, ISBN and printing.' },
  { name: 'Book Chapter Publication', category: 'Book', basePrice: 5000, description: 'Chapter in an edited book with ISBN.' },
  { name: 'PhD Thesis Writing', category: 'PhD', basePrice: 60000, description: 'Complete thesis writing support.' },
  { name: 'PhD Thesis Printing & Binding', category: 'PhD', basePrice: 8000, description: 'Typing, formatting, printing and binding.' },
  { name: 'Academic Excellence Award', category: 'Award', basePrice: 5000, description: 'Award nomination and ceremony.' },
  { name: 'Participation Certificate', category: 'Certificate', basePrice: 300, description: 'Printed participation certificate.' },
  { name: 'Reviewer Certificate', category: 'Certificate', basePrice: 1500, description: 'Journal reviewer certificate.' },
  { name: 'Plagiarism Check', category: 'Other', basePrice: 800, description: 'Similarity report with analysis.' },
  { name: 'Formatting & Proofreading', category: 'Other', basePrice: 1500, description: 'Journal style formatting and language editing.' },
] as const;

export const COLLEGES = [
  { name: 'Sahyadri College of Engineering', city: 'Pune', state: 'Maharashtra', contactPerson: 'Dr. S. R. Pawar', mobile: '9890011001', email: 'principal@sahyadri-coe.test' },
  { name: 'Godavari Institute of Science', city: 'Nashik', state: 'Maharashtra', contactPerson: 'Prof. M. K. Jadhav', mobile: '9890011002', email: 'office@godavari-science.test' },
  { name: 'Vidarbha Arts & Commerce College', city: 'Nagpur', state: 'Maharashtra', contactPerson: 'Dr. A. P. Wankhede', mobile: '9890011003', email: 'vacc@college.test' },
  { name: 'Krishna Valley Institute of Pharmacy', city: 'Sangli', state: 'Maharashtra', contactPerson: 'Dr. R. S. Mane', mobile: '9890011004', email: 'kvip@college.test' },
  { name: 'Deccan Management Institute', city: 'Pune', state: 'Maharashtra', contactPerson: 'Prof. N. V. Gokhale', mobile: '9890011005', email: 'dmi@college.test' },
  { name: 'Konkan College of Education', city: 'Ratnagiri', state: 'Maharashtra', contactPerson: 'Dr. P. D. Sawant', mobile: '9890011006', email: 'kce@college.test' },
  { name: 'Marathwada Science College', city: 'Chhatrapati Sambhajinagar', state: 'Maharashtra', contactPerson: 'Dr. V. B. Shinde', mobile: '9890011007', email: 'msc@college.test' },
  { name: 'Indrayani Polytechnic', city: 'Talegaon', state: 'Maharashtra', contactPerson: 'Prof. K. L. Bhosale', mobile: '9890011008', email: 'indrayani@college.test' },
  { name: 'Western Ghats University', city: 'Kolhapur', state: 'Maharashtra', contactPerson: 'Dr. S. T. Chavan', mobile: '9890011009', email: 'registrar@wgu.test' },
  { name: 'Tapi Valley Engineering College', city: 'Jalgaon', state: 'Maharashtra', contactPerson: 'Dr. H. M. Patil', mobile: '9890011010', email: 'tvec@college.test' },
] as const;

/** [name, mobile, email, type, collegeIndex, designation, department, city, employee, daysAgo] */
export const CUSTOMERS: [string, string, string, string, number, string, string, string, EmpKey, number][] = [
  ['Dr. Anjali Deshpande', '9765400001', 'anjali.d@mail.test', 'Professor', 0, 'Associate Professor', 'Computer Engineering', 'Pune', 'rahul', 80],
  ['Rohan Kale', '9765400002', 'rohan.kale@mail.test', 'Research Scholar', 0, 'PhD Scholar', 'Mechanical Engineering', 'Pune', 'rahul', 78],
  ['Prof. Meera Iyer', '9765400003', 'meera.iyer@mail.test', 'Professor', 1, 'Assistant Professor', 'Chemistry', 'Nashik', 'sneha', 75],
  ['Suresh Gaikwad', '9765400004', 'suresh.g@mail.test', 'Research Scholar', 2, 'PhD Scholar', 'Commerce', 'Nagpur', 'amit', 70],
  ['Dr. Kavita Rane', '9765400005', 'kavita.rane@mail.test', 'Professor', 3, 'Professor', 'Pharmaceutics', 'Sangli', 'pooja', 66],
  ['Nikhil Thorat', '9765400006', 'nikhil.t@mail.test', 'Student', 4, 'MBA Student', 'Management', 'Pune', 'pooja', 60],
  ['Dr. Sameer Kulkarni', '9765400007', 'sameer.k@mail.test', 'Professor', 5, 'Head of Department', 'Education', 'Ratnagiri', 'sneha', 55],
  ['Aarti Shinde', '9765400008', 'aarti.s@mail.test', 'Research Scholar', 6, 'PhD Scholar', 'Physics', 'Chhatrapati Sambhajinagar', 'amit', 52],
  ['Prof. Vivek Joshi', '9765400009', 'vivek.j@mail.test', 'Professor', 7, 'Lecturer', 'Electrical', 'Talegaon', 'rahul', 48],
  ['Dr. Shalini Pawar', '9765400010', 'shalini.p@mail.test', 'Professor', 8, 'Associate Professor', 'Botany', 'Kolhapur', 'priya', 45],
  ['Ganesh More', '9765400011', 'ganesh.more@mail.test', 'Author', -1, 'Independent Author', '', 'Mumbai', 'pooja', 40],
  ['Snehal Bhosale', '9765400012', 'snehal.b@mail.test', 'Research Scholar', 9, 'PhD Scholar', 'Civil Engineering', 'Jalgaon', 'amit', 36],
  ['Dr. Prakash Nair', '9765400013', 'prakash.nair@mail.test', 'Professor', 0, 'Professor', 'Electronics', 'Pune', 'rahul', 30],
  ['Tejaswini Patil', '9765400014', 'tejaswini.p@mail.test', 'Student', 1, 'M.Sc. Student', 'Microbiology', 'Nashik', 'sneha', 26],
  ['Sahyadri College of Engineering', '9890011001', 'principal@sahyadri-coe.test', 'College', 0, '', 'Principal Office', 'Pune', 'priya', 22],
  ['Dr. Rekha Wagh', '9765400016', 'rekha.wagh@mail.test', 'Professor', 2, 'Assistant Professor', 'Economics', 'Nagpur', 'pooja', 18],
  ['Omkar Salunkhe', '9765400017', 'omkar.s@mail.test', 'Research Scholar', 8, 'PhD Scholar', 'Zoology', 'Kolhapur', 'amit', 12],
  ['Prof. Nandini Rao', '9765400018', 'nandini.rao@mail.test', 'Professor', 4, 'Professor', 'Finance', 'Pune', 'rahul', 8],
  ['Krishna Valley Institute of Pharmacy', '9890011004', 'kvip@college.test', 'Institution', 3, '', 'Research Cell', 'Sangli', 'priya', 4],
  ['Yash Chavan', '9765400020', 'yash.c@mail.test', 'Student', 9, 'B.Tech Student', 'Computer Engineering', 'Jalgaon', 'pooja', 1],
];

/** Conference master. `start` is days from today (negative = past); `finalStatus` is applied after registrations. */
export const CONFERENCE_EVENTS = [
  { code: 'ICPS-2026', name: 'International Conference on Pharmaceutical Sciences 2026', college: 3, level: 'International', mode: 'Offline', city: 'Sangli', venue: 'KVIP Auditorium', start: -50, days: 2, registrationFee: 3000, publicationFee: 1500, publicationDetails: 'Proceedings with ISBN', theme: 'Novel drug delivery and formulation', finalStatus: 'Completed' },
  { code: 'NCER-12', name: 'National Conference on Education Reforms', college: 5, level: 'National', mode: 'Hybrid', city: 'Ratnagiri', venue: 'KCE Seminar Hall', start: -40, days: 1, registrationFee: 1500, publicationFee: 1000, publicationDetails: 'UGC Care journal special issue', theme: 'NEP 2020 in practice', finalStatus: 'Completed' },
  { code: 'NCPS-7', name: 'National Conference on Power Systems', college: 7, level: 'National', mode: 'Offline', city: 'Talegaon', venue: 'Indrayani Polytechnic, Hall A', start: -30, days: 1, registrationFee: 2500, publicationFee: 0, publicationDetails: '', theme: 'Renewables and grid stability', finalStatus: 'Completed' },
  { code: 'ICEET-2026', name: 'International Conference on Emerging Engineering Trends', college: 0, level: 'International', mode: 'Offline', city: 'Pune', venue: 'Sahyadri College Main Auditorium', start: 12, days: 2, registrationFee: 2500, publicationFee: 1500, publicationDetails: 'Scopus indexed proceedings', theme: 'AI, IoT and sustainable engineering', finalStatus: 'Registration Open' },
  { code: 'ICLS-2026', name: 'International Conference on Life Sciences', college: 8, level: 'International', mode: 'Online', city: 'Kolhapur', venue: 'Online (Zoom)', start: 20, days: 2, registrationFee: 3000, publicationFee: 1500, publicationDetails: 'Journal special issue', theme: 'Biodiversity of the Western Ghats', finalStatus: 'Registration Open' },
  { code: 'NCAIE-2026', name: 'National Conference on AI in Education', college: 4, level: 'National', mode: 'Hybrid', city: 'Pune', venue: 'Deccan Management Institute', start: 45, days: 1, registrationFee: 2000, publicationFee: 1000, publicationDetails: 'Proceedings with ISBN', theme: 'Generative AI in teaching and assessment', finalStatus: 'Upcoming' },
] as const;
