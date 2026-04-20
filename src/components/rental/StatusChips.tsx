import { StatusChip, type StatusTone } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type {
  ContractStatus,
  HistoryStatus,
  InvoiceStatus,
  NoteStatus,
} from '@/lib/data';

const invoiceTone: Record<InvoiceStatus, StatusTone> = {
  due: 'brand',
  overdue: 'danger',
  paid: 'success',
};
export function InvoiceStatusChip({ status }: { status: InvoiceStatus }) {
  const t = useT();
  return <StatusChip tone={invoiceTone[status]} label={t(`status.invoice.${status}`)} />;
}

const contractTone: Record<ContractStatus, StatusTone> = {
  active: 'success',
  pending: 'warn',
  ended: 'neutral',
};
export function ContractStatusChip({ status }: { status: ContractStatus }) {
  const t = useT();
  return <StatusChip tone={contractTone[status]} label={t(`status.contract.${status}`)} />;
}

const noteTone: Record<NoteStatus, StatusTone> = {
  signed: 'gold',
  pending: 'warn',
  defaulted: 'danger',
};
export function NoteStatusChip({ status }: { status: NoteStatus }) {
  const t = useT();
  return <StatusChip tone={noteTone[status]} label={t(`status.note.${status}`)} />;
}

const historyTone: Record<HistoryStatus, StatusTone> = {
  completed: 'success',
  closed: 'neutral',
  cancelled: 'danger',
};
export function HistoryStatusChip({ status }: { status: HistoryStatus }) {
  const t = useT();
  return <StatusChip tone={historyTone[status]} label={t(`status.history.${status}`)} />;
}
