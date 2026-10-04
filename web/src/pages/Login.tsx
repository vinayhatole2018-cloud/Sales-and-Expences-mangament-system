import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button, Checkbox, ErrorBox, Field, Input } from '../components/ui';

/** One-time owner creation on a brand-new live database (needs the setup code). */
function FirstSetup({ onDone }: { onDone: (email: string, password: string) => Promise<void> }) {
  const [f, setF] = useState({ setupCode: '', name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (f.password !== f.confirm) return setError('The passwords do not match.');
    setBusy(true);
    try {
      await api.post('/setup/owner', { setupCode: f.setupCode, name: f.name, email: f.email, password: f.password });
      await onDone(f.email, f.password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">First-time setup</h2>
        <p className="mt-1 text-sm text-slate-500">The database is empty. Create the owner (Super Admin) login. This screen disappears once the owner exists.</p>
      </div>
      {error && <ErrorBox message={error} />}
      <Field label="Setup code" required hint="From server/.setup-code on the computer that deployed the app.">
        <Input value={f.setupCode} onChange={(e) => setF({ ...f, setupCode: e.target.value })} autoComplete="off" autoFocus />
      </Field>
      <Field label="Your name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Email (login ID)" required><Input type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Password" required hint="At least 8 characters with letters and numbers."><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="Confirm password" required><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      <Button type="submit" className="w-full" loading={busy}>Create owner login</Button>
    </form>
  );
}

export function LoginPage() {
  const { user, profile, login, profileError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setup = useQuery({ queryKey: ['setup-status'], queryFn: () => api.get<{ needsOwner: boolean }>('/setup/status'), retry: false, staleTime: 60_000 });

  if (user && profile) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      await login(email, password, remember);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-white/15 font-bold">VP</div>
          <span className="text-lg font-semibold">Publication Manager</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">Every order, payment and expense — in one place.</h1>
          <p className="mt-3 max-w-md text-brand-100">Research papers, conferences, books, PhD projects, awards and certificates, with live balances, reports and a complete audit trail.</p>
        </div>
        <p className="text-xs text-brand-200">Accounts are created by the administrator. Contact the owner for access.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        {setup.data?.needsOwner ? (
          <FirstSetup
            onDone={async (email, pw) => {
              await login(email, pw, true);
              navigate('/settings', { replace: true });
            }}
          />
        ) : (
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Use the email and password given to you by the administrator.</p>
          </div>
          {(error || profileError) && <ErrorBox message={error || profileError} />}
          <label className="block">
            <span className="label">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
            </div>
          </label>
          <label className="block">
            <span className="label">Password</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input px-9" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
          <div className="flex items-center justify-between">
            <Checkbox label="Remember me" checked={remember} onChange={setRemember} />
            <span className="text-xs text-slate-500">Forgot password? Ask the admin to reset it.</span>
          </div>
          <Button type="submit" className="w-full" loading={busy}>
            Sign in
          </Button>
        </form>
        )}
      </div>
    </div>
  );
}
