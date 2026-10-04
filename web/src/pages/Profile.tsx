import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/auth';
import { api, errorMessage } from '../lib/api';
import { date, initials } from '../lib/format';
import { Button, Card, DefinitionList, Field, Input, PageHeader } from '../components/ui';

export default function Profile() {
  const { profile, changePassword, refreshProfile } = useAuth();
  const [mobile, setMobile] = useState(profile?.mobile ?? '');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState('');
  if (!profile) return null;

  const saveMobile = async () => {
    setBusy('mobile');
    try {
      await api.put('/me', { mobile, photoAttachmentId: profile.photoAttachmentId ?? '' });
      await refreshProfile();
      toast.success('Profile updated.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  const savePw = async () => {
    if (pw.next !== pw.confirm) return toast.error('New passwords do not match.');
    if (pw.next.length < 8 || !/[A-Za-z]/.test(pw.next) || !/\d/.test(pw.next)) return toast.error('Use at least 8 characters with letters and numbers.');
    setBusy('pw');
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Account">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-brand-100 text-lg font-semibold text-brand-800">{initials(profile.name)}</span>
            <div>
              <p className="text-lg font-semibold">{profile.name}</p>
              <p className="text-sm text-slate-500">{profile.roleName} • {profile.employeeId}</p>
            </div>
          </div>
          <DefinitionList items={[['Email', profile.email], ['Department', profile.department], ['Joining date', date(profile.joiningDate)], ['Status', profile.status]]} />
          <div className="mt-4 flex items-end gap-2">
            <Field label="Mobile" className="flex-1"><Input inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
            <Button loading={busy === 'mobile'} onClick={saveMobile}>Save</Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">To change your name, email or role, contact the administrator.</p>
        </Card>
        <Card title="Change password">
          <div className="space-y-3">
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password" hint="At least 8 characters with letters and numbers."><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <Button loading={busy === 'pw'} disabled={!pw.current || !pw.next} onClick={savePw}>Change password</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
