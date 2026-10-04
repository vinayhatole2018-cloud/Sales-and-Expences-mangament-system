/*
 * The sign-in session token issued by the API (POST /api/auth/login).
 * "Remember me" keeps it in localStorage; otherwise sessionStorage, so it is
 * forgotten when the browser closes.
 */
const KEY = 'pbms_session';
export const SESSION_EXPIRED_EVENT = 'pbms:session-expired';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getToken(): string {
  return safe(() => sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '', '');
}

export function setToken(token: string, remember: boolean) {
  clearToken();
  safe(() => (remember ? localStorage : sessionStorage).setItem(KEY, token), undefined);
}

export function clearToken() {
  safe(() => {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  }, undefined);
}
