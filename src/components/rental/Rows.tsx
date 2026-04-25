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
import { WalletIcon } from '@/components/icons';
import { RentalThumbnail } from './RentalThumbnail';

type RowShellProps = {
  thumb: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  amount?: ReactNode;
  amountHint?: ReactNode;
  right?: ReactNode;
  className?: string;
};

function RowShell({
  thumb,
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
        'flex items-center gap-3.5 py-3.5 -mx-1 px-1 rounded-2xl transition-colors',
        to && 'hover:bg-canvas-100/60 active:bg-canvas-100',
        className,
      )}
    >
      {thumb}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-ink-900 truncate tracking-tight">{title}</div>
        <div className="mt-0.5 text-[12px] text-ink-400 truncate">{subtitle}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {amount && <div className="text-[14px] font-semibold text-ink-900 num">{amount}</div>}
        {amountHint && <div className="text-[11px] text-ink-400">{amountHint}</div>}
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
      thumb={<RentalThumbnail title={invoice.title} size="sm" tone="canvas" />}
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
      thumb={<RentalThumbnail title={contract.title} size="sm" tone="canvas" />}
      title={contract.title}
      subtitle={contract.counterparty}
      amount={formatCurrency(contract.monthlyAmount)}
      amountHint={t('sections.rentalFee')}
      right={<ContractStatusChip status={contract.status} />}
    />
  );
}

export function NoteRow({ note }: { note: PromissoryNote }) {
  const { formatCurrency } = useI18n();
  return (
    <RowShell
      to={`/track/note/${note.id}`}
      thumb={
        <span className="h-11 w-11 shrink-0 rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-400/20 grid place-items-center">
          <WalletIcon size={18} />
        </span>
      }
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
      thumb={<RentalThumbnail title={item.title} size="sm" tone="canvas" />}
      title={item.title}
      subtitle={`${t('sections.closedOn')} · ${formatDate(item.closedAt)}`}
      amount={formatCurrency(item.amount)}
      right={<HistoryStatusChip status={item.status} />}
    />
  );
}
