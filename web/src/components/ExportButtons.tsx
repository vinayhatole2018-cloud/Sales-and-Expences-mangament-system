import { useState } from 'react';
import toast from 'react-hot-toast';
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button } from './ui';

export function ExportButtons({ report, params }: { report: string; params: Record<string, string | undefined> }) {
  const { can } = useAuth();
  const [busy, setBusy] = useState('');
  if (!can('reports.export')) return null;
  const run = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setBusy(format);
    try {
      await api.download(`/reports/${report}/export`, { ...params, format });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" loading={busy === 'pdf'} icon={<FileText className="size-3.5" />} onClick={() => run('pdf')}>PDF</Button>
      <Button variant="secondary" size="sm" loading={busy === 'xlsx'} icon={<FileSpreadsheet className="size-3.5" />} onClick={() => run('xlsx')}>Excel</Button>
      <Button variant="secondary" size="sm" loading={busy === 'csv'} icon={<FileDown className="size-3.5" />} onClick={() => run('csv')}>CSV</Button>
    </div>
  );
}
