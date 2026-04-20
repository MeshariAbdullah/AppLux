export type RentalTier = 'standard' | 'premium' | 'elite';

export type RentalEligibility = {
  limit: number;
  used: number;
  remaining: number;
  tier: RentalTier;
  assignedBy: string;
  assignedAt: string;
};

export type InvoiceStatus = 'due' | 'overdue' | 'paid';
export type Invoice = {
  id: string;
  title: string;
  contractRef: string;
  issuedAt: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
};

export type ContractStatus = 'active' | 'pending' | 'ended';
export type Contract = {
  id: string;
  title: string;
  counterparty: string;
  startDate: string;
  endDate: string;
  monthlyAmount: number;
  status: ContractStatus;
};

export type NoteStatus = 'signed' | 'pending' | 'defaulted';
export type PromissoryNote = {
  id: string;
  reference: string;
  counterparty: string;
  amount: number;
  dueDate: string;
  status: NoteStatus;
};

export type HistoryStatus = 'completed' | 'closed' | 'cancelled';
export type HistoryItem = {
  id: string;
  title: string;
  counterparty: string;
  closedAt: string;
  amount: number;
  status: HistoryStatus;
};

export const DEFAULT_ELIGIBILITY: RentalEligibility = {
  limit: 50000,
  used: 18500,
  remaining: 31500,
  tier: 'premium',
  assignedBy: 'AppLux',
  assignedAt: '2026-03-14',
};

export const SEED_INVOICES: Invoice[] = [
  {
    id: 'inv-1042',
    title: 'قسط إيجار — أبريل',
    contractRef: 'CN-2026-018',
    issuedAt: '2026-04-01',
    dueDate: '2026-04-25',
    amount: 2450,
    status: 'due',
  },
  {
    id: 'inv-1041',
    title: 'قسط إيجار — مارس',
    contractRef: 'CN-2026-018',
    issuedAt: '2026-03-01',
    dueDate: '2026-03-25',
    amount: 2450,
    status: 'overdue',
  },
  {
    id: 'inv-1039',
    title: 'قسط صيانة',
    contractRef: 'CN-2026-012',
    issuedAt: '2026-04-08',
    dueDate: '2026-04-30',
    amount: 620,
    status: 'due',
  },
];

export const SEED_CONTRACTS: Contract[] = [
  {
    id: 'CN-2026-018',
    title: 'تويوتا كامري 2024',
    counterparty: 'معرض الرياض للسيارات',
    startDate: '2026-01-15',
    endDate: '2027-01-14',
    monthlyAmount: 2450,
    status: 'active',
  },
  {
    id: 'CN-2026-012',
    title: 'شقة سكنية — حي الياسمين',
    counterparty: 'شركة المساكن العصرية',
    startDate: '2025-12-01',
    endDate: '2026-12-01',
    monthlyAmount: 4500,
    status: 'active',
  },
  {
    id: 'CN-2026-024',
    title: 'مكتب تجاري — طريق الملك فهد',
    counterparty: 'أبراج الأعمال',
    startDate: '2026-04-20',
    endDate: '2027-04-19',
    monthlyAmount: 6800,
    status: 'pending',
  },
];

export const SEED_NOTES: PromissoryNote[] = [
  {
    id: 'PN-0084',
    reference: 'SN-2026-084',
    counterparty: 'معرض الرياض للسيارات',
    amount: 29400,
    dueDate: '2027-01-14',
    status: 'signed',
  },
  {
    id: 'PN-0087',
    reference: 'SN-2026-087',
    counterparty: 'أبراج الأعمال',
    amount: 81600,
    dueDate: '2027-04-19',
    status: 'pending',
  },
];

export const SEED_HISTORY: HistoryItem[] = [
  {
    id: 'HS-2025-011',
    title: 'هيونداي توسان 2023',
    counterparty: 'وكالة الجزيرة',
    closedAt: '2025-12-30',
    amount: 26400,
    status: 'completed',
  },
  {
    id: 'HS-2025-007',
    title: 'شقة سكنية — حي العليا',
    counterparty: 'مؤسسة الأفق العقارية',
    closedAt: '2025-09-10',
    amount: 48000,
    status: 'completed',
  },
  {
    id: 'HS-2024-003',
    title: 'سيارة نيسان التيما 2022',
    counterparty: 'وكالة الشرق',
    closedAt: '2024-11-02',
    amount: 22000,
    status: 'closed',
  },
];
