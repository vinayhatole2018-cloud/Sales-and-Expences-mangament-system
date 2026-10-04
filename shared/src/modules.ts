import type { OrderStatus, ServiceCategory } from './constants';
import { round2 } from './money';

/**
 * Publication modules (research papers, conferences, books, PhD, awards,
 * certificates) share one engine. Each module is described declaratively here:
 * the server builds validation and total calculation from it, and the web app
 * builds forms, tables and detail views from it.
 *
 * Every module record is linked to exactly one Order, which owns the money
 * (total, payments, balance). Common fields such as customer, employee, date,
 * status, payment mode, transaction number, advance and remarks are handled
 * by the engine and are not listed in `fields`.
 */

export type FieldType = 'text' | 'email' | 'tel' | 'number' | 'money' | 'date' | 'select' | 'textarea' | 'checkbox' | 'authors' | 'conference';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  /** Span the full form width. */
  full?: boolean;
  /** Must be unique across the module (e.g. ISBN). */
  unique?: boolean;
  /** Filled by the server from a linked master record; shown read-only. */
  derived?: boolean;
}

export interface ConferenceAuthor {
  name: string;
  mobile?: string;
  email?: string;
}

export type ModuleKey = 'research-papers' | 'conferences' | 'books' | 'phd' | 'awards' | 'certificates';

export interface ModuleDef {
  key: ModuleKey;
  collection: string;
  label: string;
  singular: string;
  idLabel: string;
  /** Prefix of the human readable record number, e.g. PAP-2026-00001. */
  prefix: string;
  category: ServiceCategory;
  statuses: readonly string[];
  defaultStatus: string;
  /** Field that best describes a record (used in titles, search, orders). */
  titleField: string;
  fields: FieldDef[];
  /** Money fields that make up the total. */
  amountFields: string[];
  computeTotal: (v: Record<string, unknown>) => number;
  /** Module-specific fields shown in list tables. */
  listColumns: string[];
  /** Fields matched by global search in addition to number/customer. */
  searchFields: string[];
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const MODULES: Record<ModuleKey, ModuleDef> = {
  'research-papers': {
    key: 'research-papers',
    collection: 'researchPapers',
    label: 'Research Papers',
    singular: 'Research Paper',
    idLabel: 'Paper ID',
    prefix: 'PAP',
    category: 'Research Paper',
    statuses: ['New', 'In Progress', 'Submitted', 'Under Review', 'Accepted', 'Published', 'Completed', 'Cancelled'],
    defaultStatus: 'New',
    titleField: 'paperTitle',
    fields: [
      { name: 'paperTitle', label: 'Paper Title', type: 'text', required: true, full: true },
      { name: 'paperType', label: 'Paper Type', type: 'select', options: ['Regular', 'Backdate', 'Conference', 'Certificate'], required: true },
      { name: 'journalName', label: 'Journal / Publication Name', type: 'text' },
      { name: 'writingFees', label: 'Writing Fees', type: 'money', required: true, min: 0 },
    ],
    amountFields: ['writingFees'],
    computeTotal: (v) => round2(num(v.writingFees)),
    listColumns: ['paperTitle', 'paperType', 'journalName'],
    searchFields: ['paperTitle', 'journalName'],
  },
  conferences: {
    key: 'conferences',
    collection: 'conferences',
    label: 'Conference Registrations',
    singular: 'Conference Registration',
    idLabel: 'Registration ID',
    prefix: 'CREG',
    category: 'Conference',
    statuses: ['New', 'In Progress', 'Submitted', 'Accepted', 'Presented', 'Published', 'Completed', 'Cancelled'],
    defaultStatus: 'New',
    titleField: 'conferenceName',
    fields: [
      // The conference itself comes from the Conference master (conferenceEvents).
      { name: 'conferenceEventId', label: 'Conference', type: 'conference', required: true, full: true },
      { name: 'conferenceName', label: 'Conference Name', type: 'text', derived: true, full: true },
      { name: 'conferenceNumber', label: 'Conference Code', type: 'text', derived: true },
      { name: 'collegeName', label: 'Organising College', type: 'text', derived: true },
      { name: 'paperTitle', label: 'Paper Title', type: 'text', full: true },
      { name: 'hardCopyRequired', label: 'Hard Copy Required', type: 'checkbox' },
      { name: 'pdfRequired', label: 'PDF Required', type: 'checkbox' },
      { name: 'price', label: 'Registration Price', type: 'money', min: 0 },
      { name: 'fees', label: 'Publication / Other Fees', type: 'money', min: 0 },
      { name: 'authors', label: 'Authors', type: 'authors', full: true },
    ],
    amountFields: ['price', 'fees'],
    computeTotal: (v) => round2(num(v.price) + num(v.fees)),
    listColumns: ['conferenceName', 'conferenceNumber', 'paperTitle'],
    searchFields: ['conferenceName', 'conferenceNumber', 'collegeName', 'paperTitle'],
  },
  books: {
    key: 'books',
    collection: 'books',
    label: 'Books',
    singular: 'Book',
    idLabel: 'Book ID',
    prefix: 'BK',
    category: 'Book',
    statuses: ['Manuscript Received', 'Writing', 'Editing', 'Designing', 'Printing', 'Published', 'Delivered', 'Completed', 'Cancelled'],
    defaultStatus: 'Manuscript Received',
    titleField: 'bookName',
    fields: [
      { name: 'bookName', label: 'Book Name', type: 'text', required: true, full: true },
      { name: 'pages', label: 'Number of Pages', type: 'number', min: 0 },
      { name: 'copies', label: 'Number of Copies', type: 'number', min: 0 },
      { name: 'writingAmount', label: 'Writing Amount', type: 'money', min: 0 },
      { name: 'publicationAmount', label: 'Publication Amount', type: 'money', min: 0 },
      { name: 'isbn', label: 'ISBN Number', type: 'text', unique: true },
    ],
    amountFields: ['writingAmount', 'publicationAmount'],
    computeTotal: (v) => round2(num(v.writingAmount) + num(v.publicationAmount)),
    listColumns: ['bookName', 'isbn', 'copies'],
    searchFields: ['bookName', 'isbn'],
  },
  phd: {
    key: 'phd',
    collection: 'phdProjects',
    label: 'PhD Projects',
    singular: 'PhD Project',
    idLabel: 'PhD ID',
    prefix: 'PHD',
    category: 'PhD',
    statuses: ['Topic', 'Research', 'Writing', 'Typing', 'Formatting', 'Printing', 'Binding', 'Final Delivery', 'Completed', 'Cancelled'],
    defaultStatus: 'Topic',
    titleField: 'researchTopic',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'researchTopic', label: 'Research Topic', type: 'text', required: true, full: true },
      { name: 'pages', label: 'Number of Pages', type: 'number', min: 0 },
      { name: 'bwPages', label: 'Black & White Pages', type: 'number', min: 0 },
      { name: 'colourPages', label: 'Colour Pages', type: 'number', min: 0 },
      { name: 'copies', label: 'Copies', type: 'number', min: 0 },
      { name: 'typingCharges', label: 'Typing Charges', type: 'money', min: 0 },
      { name: 'writingCharges', label: 'Writing Charges', type: 'money', min: 0 },
      { name: 'bindingCharges', label: 'Binding Charges', type: 'money', min: 0 },
      { name: 'isbn', label: 'ISBN Number', type: 'text', unique: true },
    ],
    amountFields: ['typingCharges', 'writingCharges', 'bindingCharges'],
    computeTotal: (v) => round2(num(v.typingCharges) + num(v.writingCharges) + num(v.bindingCharges)),
    listColumns: ['researchTopic', 'subject', 'pages'],
    searchFields: ['researchTopic', 'subject', 'isbn'],
  },
  awards: {
    key: 'awards',
    collection: 'awards',
    label: 'Awards',
    singular: 'Award',
    idLabel: 'Award ID',
    prefix: 'AWD',
    category: 'Award',
    statuses: ['New', 'In Progress', 'Confirmed', 'Delivered', 'Completed', 'Cancelled'],
    defaultStatus: 'New',
    titleField: 'awardName',
    fields: [
      { name: 'awardName', label: 'Award Name', type: 'text', required: true, full: true },
      { name: 'awardCategory', label: 'Award Category', type: 'text' },
      { name: 'place', label: 'Place', type: 'text' },
      { name: 'year', label: 'Year', type: 'number', min: 1900, max: 2100 },
      { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0 },
    ],
    amountFields: ['amount'],
    computeTotal: (v) => round2(num(v.amount)),
    listColumns: ['awardName', 'awardCategory', 'year'],
    searchFields: ['awardName', 'awardCategory', 'place'],
  },
  certificates: {
    key: 'certificates',
    collection: 'certificates',
    label: 'Certificates',
    singular: 'Certificate',
    idLabel: 'Certificate ID',
    prefix: 'CRT',
    category: 'Certificate',
    statuses: ['New', 'In Progress', 'Printed', 'Delivered', 'Completed', 'Cancelled'],
    defaultStatus: 'New',
    titleField: 'certificateName',
    fields: [
      { name: 'certificateName', label: 'Certificate Name', type: 'text', required: true, full: true },
      { name: 'certificateType', label: 'Certificate Type', type: 'text' },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 1 },
      { name: 'price', label: 'Price (per certificate)', type: 'money', required: true, min: 0 },
    ],
    amountFields: ['price'],
    computeTotal: (v) => round2(Math.max(1, num(v.quantity)) * num(v.price)),
    listColumns: ['certificateName', 'certificateType', 'quantity'],
    searchFields: ['certificateName', 'certificateType'],
  },
};

export const MODULE_LIST: ModuleDef[] = Object.values(MODULES);

export function getModule(key: string): ModuleDef | undefined {
  return (MODULES as Record<string, ModuleDef>)[key];
}

/** Maps a module workflow status onto the central order status. */
export function orderStatusForModuleStatus(mod: ModuleDef, status: string): OrderStatus {
  if (status === 'Cancelled') return 'Cancelled';
  if (status === 'Completed') return 'Completed';
  if (status === 'Delivered' || status === 'Final Delivery') return 'Delivered';
  if (status === mod.defaultStatus) return 'New';
  return 'In Progress';
}

// ---------------------------------------------------------------------------
// Conference master (conference events that registrations link to)
// ---------------------------------------------------------------------------

export const CONFERENCE_STATUSES = ['Upcoming', 'Registration Open', 'Registration Closed', 'Completed', 'Cancelled'] as const;
export type ConferenceStatus = (typeof CONFERENCE_STATUSES)[number];
/** Statuses in which new registrations are accepted. */
export const CONFERENCE_OPEN_STATUSES: readonly ConferenceStatus[] = ['Upcoming', 'Registration Open'];
export const CONFERENCE_MODES = ['Offline', 'Online', 'Hybrid'] as const;
export const CONFERENCE_LEVELS = ['International', 'National', 'State', 'University', 'College'] as const;
