import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, Inbox, Loader2, X } from 'lucide-react';

// ------------------------------------------------------------------ Button ---

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
          variants[variant],
          className,
        )}
        {...rest}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  },
);

export function LinkButton({ to, children, variant = 'secondary', icon, className }: { to: string; children: ReactNode; variant?: Variant; icon?: ReactNode; className?: string }) {
  return (
    <Link to={to} className={clsx('inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition', variants[variant], className)}>
      {icon}
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------ Fields ---

export function Field({ label, error, hint, required, children, className }: { label?: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={clsx('input', invalid && 'input-error', className)} {...rest} />;
});

export function MoneyInput({ value, onChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">₹</span>
      <input
        className="input pl-7 tabular"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        {...rest}
      />
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('input pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx('input min-h-[72px]', className)} {...rest} />;
});

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="size-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ------------------------------------------------------------------- Layout ---

export function Card({ title, actions, children, className, bodyClass }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          {typeof title === 'string' ? <h2 className="text-sm font-semibold text-slate-800">{title}</h2> : title}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-4', bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ChevronLeft className="size-3.5" /> Back
          </Link>
        )}
        <h1 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="size-5 animate-spin" /> {label}
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Inbox className="size-8 text-slate-300" />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {message && <p className="max-w-sm text-sm text-slate-500">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {message}
    </div>
  );
}

export function DefinitionList({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 2 | 3 }) {
  return (
    <dl className={clsx('grid grid-cols-1 gap-x-6 gap-y-3', cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-900">{v === '' || v === undefined || v === null ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ Badges ---

const TONES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export type Tone = keyof typeof TONES;

const STATUS_TONES: Record<string, Tone> = {
  // money
  Paid: 'green', Partial: 'amber', Unpaid: 'red', 'Refund Pending': 'violet', Refunded: 'gray',
  // work
  New: 'blue', Assigned: 'blue', 'In Progress': 'amber', 'Pending Customer': 'violet', Completed: 'green', Delivered: 'green', Cancelled: 'gray',
  Published: 'green', Accepted: 'green', Submitted: 'blue', 'Under Review': 'violet', Presented: 'green', Confirmed: 'green', Printed: 'green',
  'Final Delivery': 'green', 'Manuscript Received': 'blue', Topic: 'blue',
  // approval & accounts
  Pending: 'amber', Approved: 'green', Rejected: 'red', Active: 'green', Inactive: 'gray', Suspended: 'red', Blocked: 'red',
  // priority
  Low: 'gray', Normal: 'blue', High: 'amber', Urgent: 'red',
  // ledger
  Sale: 'blue', Payment: 'green', Refund: 'violet', Expense: 'red', Adjustment: 'gray',
};

export function Badge({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const t = tone ?? STATUS_TONES[String(children)] ?? 'amber';
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[t])}>{children}</span>;
}

// ------------------------------------------------------------------- Stats ---

export function StatCard({ label, value, sub, icon, tone = 'blue', to }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate'; to?: string }) {
  const iconTone = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];
  const body = (
    <div className="card flex h-full items-start gap-3 p-4 transition hover:border-slate-300">
      {icon && <div className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', iconTone)}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold text-slate-900 sm:text-xl">{value}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

// -------------------------------------------------------------------- Tabs ---

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
            value === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- Modal ---

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={clsx('relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', width)}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ----------------------------------------------------------------- Confirm ---

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Ask for a reason (required). Resolves with the reason text. */
  reason?: boolean | string;
}
type Asker = (o: ConfirmOptions) => Promise<string | null>;
const ConfirmCtx = createContext<Asker | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: string | null) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ask = useCallback<Asker>((o) => new Promise((resolve) => {
    setReason('');
    setState({ ...o, resolve });
  }), []);
  const close = (v: string | null) => {
    state?.resolve(v);
    setState(null);
  };
  useEffect(() => {
    if (state?.reason) setTimeout(() => inputRef.current?.focus(), 50);
  }, [state]);
  const needsReason = Boolean(state?.reason);
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(null)}
        title={state?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(null)}>Cancel</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} disabled={needsReason && reason.trim().length < 3} onClick={() => close(needsReason ? reason.trim() : 'ok')}>
              {state?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-slate-600">{state.message}</div>}
        {needsReason && (
          <Field label={typeof state?.reason === 'string' ? state.reason : 'Reason'} required className="mt-3">
            <Textarea ref={inputRef} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="This is saved in the audit log." />
          </Field>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): Asker {
  const v = useContext(ConfirmCtx);
  if (!v) throw new Error('useConfirm outside ConfirmProvider');
  return v;
}
