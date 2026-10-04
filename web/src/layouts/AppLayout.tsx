import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  CalendarDays,
  FileBarChart,
  FileText,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tags,
  TrendingUp,
  User,
  UserCog,
  Users,
  Wallet,
  X,
  AlarmClock,
  CalendarRange,
  FileSpreadsheet,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@pbms/shared';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useDebounced, useSettings } from '../lib/hooks';
import { initials, timeAgo } from '../lib/format';
import { Badge } from '../components/ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perms?: Permission[];
}
interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, perms: ['dashboard.view'] },
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/orders', label: 'Orders', icon: ShoppingCart },
      { to: '/sales', label: 'Sales', icon: TrendingUp },
      { to: '/payments', label: 'Payments', icon: Wallet },
      { to: '/outstanding', label: 'Outstanding', icon: AlarmClock },
      { to: '/expenses', label: 'Expenses', icon: Receipt, perms: ['expenses.create', 'expenses.view_all'] },
    ],
  },
  {
    label: 'Publications',
    items: [
      { to: '/m/research-papers', label: 'Research Papers', icon: FileText },
      { to: '/conferences', label: 'Conferences', icon: Presentation },
      { to: '/m/conferences', label: 'Conference Registrations', icon: Mic },
      { to: '/m/books', label: 'Books', icon: BookOpen },
      { to: '/m/phd', label: 'PhD', icon: GraduationCap },
      { to: '/m/awards', label: 'Awards', icon: Award },
      { to: '/m/certificates', label: 'Certificates', icon: ScrollText },
    ],
  },
  {
    label: 'Organisation',
    items: [
      { to: '/colleges', label: 'Colleges', icon: Landmark, perms: ['colleges.view', 'colleges.manage'] },
      { to: '/employees', label: 'Employees', icon: UserCog, perms: ['employees.view', 'employees.manage'] },
      { to: '/services', label: 'Services & Pricing', icon: Tags, perms: ['services.manage'] },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: '/reports/daily', label: 'Daily Transactions', icon: CalendarDays, perms: ['reports.view'] },
      { to: '/reports/monthly', label: 'Monthly Report', icon: FileBarChart, perms: ['reports.view'] },
      { to: '/reports/range', label: 'Date-wise Report', icon: CalendarRange, perms: ['reports.view'] },
      { to: '/reports', label: 'All Reports', icon: FileSpreadsheet, perms: ['reports.view'] },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, perms: ['analytics.view'] },
      { to: '/performance', label: 'Performance', icon: Briefcase },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/audit-logs', label: 'Audit Logs', icon: ShieldCheck, perms: ['audit.view'] },
      { to: '/settings', label: 'Settings', icon: Settings, perms: ['settings.manage', 'roles.manage', 'backup.manage'] },
    ],
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const { data: settings } = useSettings();
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">{initials(settings?.businessName ?? 'VP')}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{settings?.businessName ?? 'Publication Manager'}</p>
          <p className="truncate text-[11px] text-slate-400">Business Management</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-6">
        {NAV.map((g, i) => {
          const items = g.items.filter((it) => !it.perms || can(...it.perms));
          if (!items.length) return null;
          return (
            <div key={i}>
              {g.label && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>}
              <ul className="space-y-0.5">
                {items.map((it) => (
                  <li key={it.to}>
                    <NavLink
                      to={it.to}
                      end={it.to === '/' || it.to === '/reports'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        clsx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition', isActive ? 'bg-slate-800 font-medium text-white' : 'hover:bg-slate-800/60 hover:text-white')
                      }
                    >
                      <it.icon className="size-4 shrink-0" />
                      {it.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q.trim(), 250);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get('/search', { q: debounced }),
    enabled: debounced.length >= 2,
    staleTime: 10_000,
  });
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        box.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const go = (link: string) => {
    setOpen(false);
    setQ('');
    navigate(link);
  };
  const results: any[] = data?.results ?? [];
  return (
    <div ref={box} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        className="input bg-slate-50 pl-9"
        placeholder="Search customer, mobile, order, ISBN, transaction…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]?.items[0]) go(results[0].items[0].link);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && debounced.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {isFetching && !data && <p className="p-3 text-sm text-slate-500">Searching…</p>}
          {data && !results.length && <p className="p-3 text-sm text-slate-500">No matches for “{debounced}”.</p>}
          {results.map((g) => (
            <div key={g.group} className="py-1">
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.group}</p>
              {g.items.map((it: any) => (
                <button key={it.id} onClick={() => go(it.link)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{it.title}</span>
                    <span className="block truncate text-xs text-slate-500">{it.subtitle}</span>
                  </span>
                  {it.badge && <Badge>{it.badge}</Badge>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, refetch } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => api.get<{ count: number; latest: any[] }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const openItem = async (n: any) => {
    setOpen(false);
    await api.post('/notifications/read', { ids: [n.id] });
    refetch();
    if (n.link) navigate(n.link);
  };
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Notifications">
        <Bell className="size-5" />
        {Boolean(data?.count) && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{data!.count > 99 ? '99+' : data!.count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {Boolean(data?.count) && (
              <button
                className="text-xs font-medium text-brand-700 hover:underline"
                onClick={async () => {
                  await api.post('/notifications/read', { all: true });
                  refetch();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.latest.length && <li className="p-4 text-center text-sm text-slate-500">You're all caught up.</li>}
            {data?.latest.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className="block w-full border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-800">{n.title}</p>
                  <p className="text-xs text-slate-600">{n.message}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block rounded-b-xl px-4 py-2 text-center text-xs font-medium text-brand-700 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { profile, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100">
        <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(profile?.name)}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-slate-800">{profile?.name}</span>
          <span className="block text-[11px] text-slate-500">{profile?.roleName}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
            <User className="size-4" /> My profile
          </Link>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="flex min-h-full">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <button onClick={() => setDrawer(false)} className="absolute right-2 top-3 z-10 rounded p-1 text-slate-400 hover:text-white" aria-label="Close menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:px-5">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 sm:px-5 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
