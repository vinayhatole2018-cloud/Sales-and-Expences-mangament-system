import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { date, money } from '../lib/format';
import { Button, ErrorBox, Spinner } from '../components/ui';

/** Print-ready invoice. Browser print gives a clean A4 page; the PDF comes from the server. */
export default function InvoiceView() {
  const { id = '' } = useParams();
  const { data: inv, isLoading, error } = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get(`/invoices/${id}`) });
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let url = '';
    if (inv?.business?.logoAttachmentId) api.blob(`/attachments/${inv.business.logoAttachmentId}/download`, { inline: 1 }).then(({ blob }) => setLogo((url = URL.createObjectURL(blob)))).catch(() => undefined);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [inv]);

  if (isLoading) return <Spinner />;
  if (error) return <div className="p-6"><ErrorBox message={(error as Error).message} /></div>;
  const b = inv.business;

  return (
    <div className="min-h-full bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4">
        <Link to={`/orders/${inv.orderId}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" /> Back to order</Link>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => api.download(`/invoices/${id}/pdf`)}>Download PDF</Button>
          <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      <article className="mx-auto max-w-3xl bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand-800 pb-5">
          <div className="flex items-start gap-3">
            {logo && <img src={logo} alt="" className="size-16 object-contain" />}
            <div>
              <h1 className="text-xl font-bold text-brand-800">{b.name}</h1>
              {b.tagline && <p className="text-xs text-slate-500">{b.tagline}</p>}
              <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{b.address}</p>
              <p className="text-xs text-slate-600">{[b.phone, b.email, b.website].filter(Boolean).join(' • ')}</p>
              {b.gstin && <p className="text-xs font-medium text-slate-700">GSTIN: {b.gstin}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-wide text-slate-900">INVOICE</p>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-xs">
              <dt className="text-slate-500">Invoice No.</dt><dd className="font-semibold">{inv.invoiceNo}</dd>
              <dt className="text-slate-500">Invoice Date</dt><dd className="font-semibold">{date(inv.invoiceDate)}</dd>
              <dt className="text-slate-500">Order ID</dt><dd className="font-semibold">{inv.orderNo}</dd>
            </dl>
          </div>
        </header>

        <section className="flex flex-wrap justify-between gap-4 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Bill to</p>
            <p className="text-base font-semibold">{inv.customer.name}</p>
            {inv.customer.college && <p className="text-sm text-slate-600">{inv.customer.college}</p>}
            {inv.customer.address && <p className="text-sm text-slate-600">{inv.customer.address}</p>}
            <p className="text-sm text-slate-600">{[inv.customer.mobile, inv.customer.email].filter(Boolean).join(' • ')}</p>
          </div>
          <div className={`self-start rounded-lg px-4 py-2 text-center text-sm font-bold ${inv.balance > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{inv.balance > 0 ? `BALANCE DUE ${money(inv.balance)}` : 'PAID IN FULL'}</div>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-800 text-left text-xs uppercase text-white print:bg-slate-800">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Discount</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it: any, i: number) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-3 py-2 align-top">{i + 1}</td>
                <td className="px-3 py-2"><p className="font-medium">{it.serviceName}</p>{it.description && <p className="text-xs text-slate-500">{it.description}</p>}</td>
                <td className="px-3 py-2 text-right tabular">{it.quantity}</td>
                <td className="px-3 py-2 text-right tabular">{money(it.unitPrice)}</td>
                <td className="px-3 py-2 text-right tabular">{it.discount ? money(it.discount) : '—'}</td>
                <td className="px-3 py-2 text-right font-semibold tabular">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Payment details</p>
            {!inv.payments.length && <p className="text-sm text-slate-500">No payments received yet.</p>}
            <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
              {inv.payments.map((p: any) => (
                <li key={`${p.paymentNo}-${p.date}-${p.amount}`}>{date(p.date)} • {p.type} • {p.mode}{p.txnNumber ? ` (${p.txnNumber})` : ''} • <span className="font-semibold">{money(p.amount)}</span></li>
              ))}
            </ul>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular">{money(inv.subtotal)}</dd></div>
            {inv.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd className="tabular">− {money(inv.discount)}</dd></div>}
            {inv.tax > 0 && <div className="flex justify-between"><dt>Tax</dt><dd className="tabular">{money(inv.tax)}</dd></div>}
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Total</dt><dd className="tabular">{money(inv.total)}</dd></div>
            <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd className="tabular">{money(inv.paid)}</dd></div>
            <div className="flex justify-between rounded bg-slate-100 px-2 py-1 text-base font-bold"><dt>Balance</dt><dd className="tabular">{money(inv.balance)}</dd></div>
          </dl>
        </section>

        <footer className="mt-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-md">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Terms & conditions</p>
            <p className="whitespace-pre-line text-xs text-slate-600">{inv.terms}</p>
          </div>
          <div className="w-48 text-center">
            <div className="border-t border-slate-800 pt-1 text-sm font-semibold">{inv.signatory}</div>
            <p className="text-xs text-slate-500">For {b.name}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
