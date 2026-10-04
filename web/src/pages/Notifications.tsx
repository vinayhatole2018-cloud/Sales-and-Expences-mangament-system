import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCheck } from 'lucide-react';
import { NOTIFICATION_LABELS } from '@pbms/shared';
import { api } from '../lib/api';
import { useAction, useList, useListState } from '../lib/hooks';
import { dateTime } from '../lib/format';
import { Badge, Button, Card, Empty, PageHeader, Tabs } from '../components/ui';
import { Pagination } from '../components/DataTable';

export default function Notifications() {
  const navigate = useNavigate();
  const { params, set } = useListState({ page: '1', pageSize: '30', sort: 'createdAt', dir: 'desc', unread: '' });
  const { data } = useList('notifications', '/notifications', params);
  const markAll = useAction(() => api.post('/notifications/read', { all: true }), 'All notifications marked as read.');
  const open = async (n: any) => {
    if (!n.read) await api.post('/notifications/read', { ids: [n.id] });
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <PageHeader title="Notifications" actions={<Button variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => markAll.mutate()}>Mark all read</Button>} />
      <Card bodyClass="p-3 sm:p-4">
        <Tabs value={params.unread === 'true' ? 'unread' : 'all'} onChange={(t) => set({ unread: t === 'unread' ? 'true' : '' })} tabs={[{ key: 'all', label: 'All' }, { key: 'unread', label: `Unread (${(data?.unreadCount as number) ?? 0})` }]} />
        {!data?.items.length ? (
          <Empty title="No notifications" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((n: any) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className={clsx('flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-slate-50', !n.read && 'bg-brand-50/40')}>
                  <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{n.title}</span>
                      <Badge tone="gray">{NOTIFICATION_LABELS[n.type as keyof typeof NOTIFICATION_LABELS] ?? n.type}</Badge>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{n.message}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{dateTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}
