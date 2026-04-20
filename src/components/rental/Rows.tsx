import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import type { Contract, HistoryItem, Invoice, PromissoryNote } from '@/lib/data';
import {
  ContractStatusChip,
  HistoryStatusChip,
  InvoiceStatusChip,
  NoteStatusChip,
} from './StatusChips';
import { DocIcon, HistoryIcon, ReceiptIcon, WalletIcon } from '@/components/icons';

type RowShellProps = {
  icon: ReactNode;
  iconTone: string;
  title: ReactNode;
  subtitle: ReactNode;
  amount?: ReactNode;
  amountHint?: ReactNode;
  right?: ReactNode;
  className?: string;
};

function RowShell({
  icon,
  iconTone,
  title,
  subtitle,
  amount,
  amountHint,
  right,
  className,
  to,
}: RowShellProps & { to?: string }) {
  const content = (
    <div
      className={cn(
        'flex items-center gap-3 py-3 -mx-1 px-1 rounded-lg transition-colors',
        to && 'hover:bg-ink-50/60 active:bg-ink-50',
        className,
      )}
    >
      <span
        className={cn(
          'h-10 w-10 shrink-0 rounded-xl grid place-items-center',
          iconTone,
        )}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">{title}</div>
        <div className="mt-0.5 text-[12px] text-ink-400 truncate">{subtitle}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {amount && <div className="text-[13.5px] font-semibold text-ink-900 num">{amount}</div>}
        {amountHint && <div className="text-[11.5px] text-ink-400">{amountHint}</div>}
        {right}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

export function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  return (
    <RowShell
      to={`/track/invoice/${invoice.id}`}
      icon={<ReceiptIcon size={18} />}
      iconTone="bg-brand-50 text-brand-600"
      title={invoice.title}
      subtitle={`${t('sections.due')} · ${formatDate(invoice.dueDate)}`}
      amount={formatCurrency(invoice.amount)}
      right={<InvoiceStatusChip status={invoice.status} />}
    />
  );
}

export function ContractRow({ contract }: { contract: Contract }) {
  const t = useT();
  const { formatCurrency } = useI18n();
  return (
    <RowShell
      to={`/track/contract/${contract.id}`}
      icon={<DocIcon size={18} />}
      iconTone="bg-ink-100 text-ink-700"
      title={contract.title}
      subtitle={contract.counterparty}
      amount={formatCurrency(contract.monthlyAmount)}
      amountHint={t('sections.monthly')}
      right={<ContractStatusChip status={contract.status} />}
    />
  );
}

export function NoteRow({ note }: { note: PromissoryNote }) {
  const { formatCurrency } = useI18n();
  return (
    <RowShell
      to={`/track/note/${note.id}`}
      icon={<WalletIcon size={18} />}
      iconTone="bg-[#FBF2DD] text-gold-600"
      title={note.reference}
      subtitle={note.counterparty}
      amount={formatCurrency(note.amount)}
      right={<NoteStatusChip status={note.status} />}
    />
  );
}

export function HistoryRow({ item }: { item: HistoryItem }) {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  return (
    <RowShell
      icon={<HistoryIcon size={18} />}
      iconTone="bg-ink-50 text-ink-500"
      title={item.title}
      subtitle={`${t('sections.closedOn')} · ${formatDate(item.closedAt)}`}
      amount={formatCurrency(item.amount)}
      right={<HistoryStatusChip status={item.status} />}
    />
  );
}
