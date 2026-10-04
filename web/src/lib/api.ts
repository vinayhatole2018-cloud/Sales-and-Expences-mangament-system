import { SESSION_EXPIRED_EVENT, clearToken, getToken } from './session';

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Params): string {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function headers(json = true): Promise<HeadersInit> {
  const token = getToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  let message = `Request failed (${res.status}).`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* non-JSON error */
  }
  if (res.status === 401 && getToken()) {
    // Session expired or revoked (logout elsewhere, password reset, suspension).
    clearToken();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  throw new ApiError(res.status, message);
}

async function request<T>(method: string, path: string, body?: unknown, params?: Params): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs(params)}`, {
      method,
      headers: await headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection.');
  }
  return handle<T>(res);
}

export const api = {
  get: <T = any>(path: string, params?: Params) => request<T>('GET', path, undefined, params),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T = any>(path: string, body?: unknown) => request<T>('DELETE', path, body ?? {}),

  async upload<T = any>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: await headers(false), body: form });
    return handle<T>(res);
  },

  /** Fetches a protected file and returns a blob (for download, preview or print). */
  async blob(path: string, params?: Params, method = 'GET'): Promise<{ blob: Blob; fileName: string }> {
    const res = await fetch(`${BASE}${path}${qs(params)}`, { method, headers: await headers(false) });
    if (!res.ok) await handle(res);
    const cd = res.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(cd);
    return { blob: await res.blob(), fileName: match ? decodeURIComponent(match[1]) : 'download' };
  },

  async download(path: string, params?: Params, method = 'GET') {
    const { blob, fileName } = await api.blob(path, params, method);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
