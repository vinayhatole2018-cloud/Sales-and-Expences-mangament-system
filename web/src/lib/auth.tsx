import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@pbms/shared';
import { api, ApiError } from './api';
import { SESSION_EXPIRED_EVENT, clearToken, getToken, setToken } from './session';

/*
 * Sign-in is handled by the system's own user database through the API
 * (POST /api/auth/login). No Firebase Authentication is used.
 */

export interface Profile {
  id: string;
  name: string;
  employeeId: string;
  email: string;
  mobile: string;
  role: string;
  roleName: string;
  department: string;
  joiningDate: string;
  status: string;
  photoAttachmentId?: string;
  permissions: Permission[];
}

interface AuthState {
  /** Present while a session token is stored. */
  user: { token: string } | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string;
  can: (...perms: Permission[]) => boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setTokenState] = useState(getToken());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [profileError, setProfileError] = useState('');

  const signedOut = useCallback(
    (message = '') => {
      clearToken();
      setTokenState('');
      setProfile(null);
      setProfileError(message);
      qc.clear();
    },
    [qc],
  );

  const loadProfile = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      setProfile(await api.get<Profile>('/me'));
      setProfileError('');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) signedOut(e.message);
      else setProfileError(e instanceof Error ? e.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [signedOut]);

  // Restore a saved session on page load.
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Any API call that finds the session expired/revoked signs the user out.
  useEffect(() => {
    const onExpired = () => signedOut('Your session has ended. Please sign in again.');
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [signedOut]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const res = await api.post<{ token: string }>('/auth/login', { email: email.trim(), password, remember });
      setToken(res.token, remember);
      setTokenState(res.token);
      setLoading(true);
      await loadProfile();
    },
    [loadProfile],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    signedOut();
  }, [signedOut]);

  const changePassword = useCallback(async (current: string, next: string) => {
    await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
  }, []);

  const value = useMemo<AuthState>(() => {
    const perms = new Set(profile?.permissions ?? []);
    return {
      user: token ? { token } : null,
      profile,
      loading,
      profileError,
      can: (...p) => p.some((x) => perms.has(x)),
      login,
      logout,
      changePassword,
      refreshProfile: loadProfile,
    };
  }, [token, profile, loading, profileError, login, logout, changePassword, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
