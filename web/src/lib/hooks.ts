import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from './api';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totals?: Record<string, number>;
  [k: string]: unknown;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Paginated, filterable list bound to the URL query string (shareable, back-button friendly). */
export function useListState(defaults: Record<string, string> = {}) {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? defaults[k] ?? '';
  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || String(v) === (defaults[k] ?? '')) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };
  const params: Record<string, string> = { ...defaults };
  sp.forEach((v, k) => (params[k] = v));
  return { params, get, set };
}

export function useList<T = any>(key: string, path: string, params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: [key, path, params],
    queryFn: () => api.get<Page<T>>(path, params as any),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export interface Settings {
  businessName: string;
  tagline: string;
  logoAttachmentId: string;
  paymentModes: string[];
  expenseCategories: string[];
  maxEmployeeDiscountPercent: number;
  allowOverpayment: boolean;
  defaultTaxPercent: number;
  gstEnabled: boolean;
  [k: string]: any;
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings'), staleTime: 60_000 });
}

export interface EmployeeOption {
  id: string;
  name: string;
  employeeId: string;
  status: string;
  role: string;
}

export function useEmployeeOptions() {
  return useQuery({ queryKey: ['employee-options'], queryFn: () => api.get<EmployeeOption[]>('/employees/options'), staleTime: 60_000 });
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => api.get<Page<any>>('/services', { pageSize: 500 }), staleTime: 60_000 });
}

export function useColleges() {
  return useQuery({ queryKey: ['colleges-all'], queryFn: () => api.get<Page<any>>('/colleges', { pageSize: 500, sort: 'name', dir: 'asc' }), staleTime: 60_000 });
}

/**
 * Mutation with toast feedback that refreshes all cached data afterwards, so
 * dashboards, balances and lists update immediately after any change.
 */
export function useAction<TVars = void, TRes = any>(fn: (v: TVars) => Promise<TRes>, success?: string | ((r: TRes) => string)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (success) toast.success(typeof success === 'function' ? success(r) : success);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
