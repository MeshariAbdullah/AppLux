import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_ELIGIBILITY,
  SEED_ADMIN_CASE_DETAILS,
  SEED_ADMIN_PENDING_MERCHANTS,
  SEED_ADMIN_USERS_LIST,
  SEED_CONTRACTS,
  SEED_HISTORY,
  SEED_INVOICES,
  SEED_MERCHANT_APPROVALS,
  SEED_MERCHANT_CUSTOMERS,
  SEED_MERCHANT_DAMAGES,
  SEED_MERCHANT_HISTORY,
  SEED_MERCHANT_RENTALS,
  SEED_NOTES,
  SEED_SCANS,
  SEED_STORES,
  type AdminCaseAuditAction,
  type AdminCaseAuditEntry,
  type AdminCaseDetail,
  type AdminCaseNote,
  type AdminCaseStage,
  type AdminMerchantDecision,
  type AdminPendingMerchant,
  type AdminUserRecord,
  type AdminUserStatus,
  type Contract,
  type HistoryItem,
  type Invoice,
  type MerchantApproval,
  type MerchantCustomer,
  type MerchantDamageCase,
  type MerchantDamageSeverity,
  type MerchantHistoryRecord,
  type MerchantRental,
  type PartnerStore,
  type PromissoryNote,
  type RentalEligibility,
  type ScannedPackage,
} from './data';

export type RegistrationDraft = {
  fullName: string;
  nationalId: string;
  dob: string;
  mobile: string;
  email: string;
  city: string;
  address: string;
  profession: string;
  employer: string;
  income: string;
};

export type MerchantBranchDraft = {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
};

export type MerchantDraft = {
  companyName: string;
  commercialReg: string;
  authorizedName: string;
  authorizedId: string;
  iban: string;
  city: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  branches: MerchantBranchDraft[];
};

export type MerchantStatus = 'pending' | 'approved' | 'rejected';

export type MerchantProfile = MerchantDraft & {
  id: string;
  status: MerchantStatus;
  submittedAt: string;
  approvedAt: string | null;
};

export const emptyMerchantDraft: MerchantDraft = {
  companyName: '',
  commercialReg: '',
  authorizedName: '',
  authorizedId: '',
  iban: '',
  city: '',
  address: '',
  contactEmail: '',
  contactPhone: '',
  branches: [],
};

export type UserProfile = RegistrationDraft & {
  nafathVerified: boolean;
  createdAt: string;
};

export const emptyRegistration: RegistrationDraft = {
  fullName: '',
  nationalId: '',
  dob: '',
  mobile: '',
  email: '',
  city: '',
  address: '',
  profession: '',
  employer: '',
  income: '',
};

type Session = UserProfile | null;

type StoreContextValue = {
  session: Session;
  draft: RegistrationDraft;
  updateDraft: (patch: Partial<RegistrationDraft>) => void;
  resetDraft: () => void;
  completeRegistration: (nafathVerified: boolean) => UserProfile;
  signOut: () => void;
  eligibility: RentalEligibility;
  invoices: Invoice[];
  contracts: Contract[];
  notes: PromissoryNote[];
  history: HistoryItem[];
  stores: PartnerStore[];
  scans: ScannedPackage[];
  approvals: Record<string, ApprovalRecord>;
  approvePackage: (token: string) => ApprovalRecord;
  merchant: MerchantProfile | null;
  merchantDraft: MerchantDraft;
  updateMerchantDraft: (patch: Partial<MerchantDraft>) => void;
  resetMerchantDraft: () => void;
  submitMerchantApproval: () => MerchantProfile;
  approveMerchant: () => void;
  signOutMerchant: () => void;
  merchantRentals: MerchantRental[];
  merchantApprovals: MerchantApproval[];
  merchantDamages: MerchantDamageCase[];
  merchantHistory: MerchantHistoryRecord[];
  merchantCustomers: MerchantCustomer[];
  closeRental: (rentalId: string, input?: { notes?: string }) => void;
  reportDamage: (
    rentalId: string,
    input: ReportDamageInput,
  ) => MerchantDamageCase | null;
  adminMerchantRequests: AdminMerchantRequest[];
  approveMerchantRequest: (id: string, notes?: string) => AdminMerchantDecision | null;
  rejectMerchantRequest: (id: string, notes?: string) => AdminMerchantDecision | null;
  resetMerchantRequest: (id: string) => void;
  adminUsers: AdminUserRecord[];
  setAdminUserStatus: (id: string, status: AdminUserStatus) => AdminUserRecord | null;
  setAdminUserLimit: (id: string, limit: number) => AdminUserRecord | null;
  resetAdminUser: (id: string) => void;
  adminCases: AdminCaseDetail[];
  addCaseNote: (caseId: string, text: string) => AdminCaseDetail | null;
  escalateCase: (caseId: string) => AdminCaseDetail | null;
  resetCase: (caseId: string) => void;
};

type AdminCaseOverride = {
  notes?: AdminCaseNote[];
  audit?: AdminCaseAuditEntry[];
  stage?: AdminCaseStage;
};

const STAGE_ORDER: AdminCaseStage[] = ['review', 'settlement', 'nafith', 'execution'];

function stageAfter(s: AdminCaseStage): AdminCaseStage | null {
  const idx = STAGE_ORDER.indexOf(s);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

function nextActionKeyFor(s: AdminCaseStage | null): string {
  if (s === 'settlement') return 'escalateSettlement';
  if (s === 'nafith') return 'escalateNafith';
  if (s === 'execution') return 'escalateExecution';
  return 'awaitOutcome';
}

function auditActionForStage(s: AdminCaseStage): AdminCaseAuditAction {
  if (s === 'settlement') return 'escalated-settlement';
  if (s === 'nafith') return 'escalated-nafith';
  if (s === 'execution') return 'escalated-execution';
  return 'reviewed';
}

export type AdminMerchantRequest = AdminPendingMerchant & {
  decision: AdminMerchantDecision;
};

export type ReportDamageInput = {
  severity: MerchantDamageSeverity;
  claimAmount: number;
  notes?: string;
  evidence?: string[];
};

export type ApprovalRecord = {
  token: string;
  approvedAt: string;
  contractRef: string;
  noteRef: string;
};

const STORAGE_KEY = 'applux.session';
const MERCHANT_KEY = 'applux.merchant';

const StoreContext = createContext<StoreContextValue | null>(null);

function readSession(): Session {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function readMerchant(): MerchantProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MERCHANT_KEY);
    return raw ? (JSON.parse(raw) as MerchantProfile) : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(readSession);
  const [draft, setDraft] = useState<RegistrationDraft>(emptyRegistration);
  const [approvals, setApprovals] = useState<Record<string, ApprovalRecord>>({});
  const [merchant, setMerchant] = useState<MerchantProfile | null>(readMerchant);
  const [merchantDraft, setMerchantDraft] = useState<MerchantDraft>(emptyMerchantDraft);
  const [rentalOverrides, setRentalOverrides] = useState<
    Record<string, Partial<MerchantRental>>
  >({});
  const [extraDamages, setExtraDamages] = useState<MerchantDamageCase[]>([]);
  const [merchantDecisions, setMerchantDecisions] = useState<
    Record<string, AdminMerchantDecision>
  >({});
  const [userOverrides, setUserOverrides] = useState<
    Record<string, Partial<AdminUserRecord>>
  >({});
  const [caseOverrides, setCaseOverrides] = useState<
    Record<string, AdminCaseOverride>
  >({});

  useEffect(() => {
    try {
      if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [session]);

  useEffect(() => {
    try {
      if (merchant) window.localStorage.setItem(MERCHANT_KEY, JSON.stringify(merchant));
      else window.localStorage.removeItem(MERCHANT_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [merchant]);

  const updateDraft = useCallback(
    (patch: Partial<RegistrationDraft>) => setDraft((d) => ({ ...d, ...patch })),
    [],
  );

  const resetDraft = useCallback(() => setDraft(emptyRegistration), []);

  const completeRegistration = useCallback(
    (nafathVerified: boolean) => {
      const profile: UserProfile = {
        ...draft,
        nafathVerified,
        createdAt: new Date().toISOString(),
      };
      setSession(profile);
      return profile;
    },
    [draft],
  );

  const signOut = useCallback(() => {
    setSession(null);
    setDraft(emptyRegistration);
    setApprovals({});
  }, []);

  const updateMerchantDraft = useCallback(
    (patch: Partial<MerchantDraft>) => setMerchantDraft((d) => ({ ...d, ...patch })),
    [],
  );

  const resetMerchantDraft = useCallback(() => setMerchantDraft(emptyMerchantDraft), []);

  const submitMerchantApproval = useCallback((): MerchantProfile => {
    const profile: MerchantProfile = {
      ...merchantDraft,
      id: `MRC-${Date.now().toString().slice(-6)}`,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      approvedAt: null,
    };
    setMerchant(profile);
    return profile;
  }, [merchantDraft]);

  const approveMerchant = useCallback(() => {
    setMerchant((m) =>
      m ? { ...m, status: 'approved', approvedAt: new Date().toISOString() } : m,
    );
  }, []);

  const signOutMerchant = useCallback(() => {
    setMerchant(null);
    setMerchantDraft(emptyMerchantDraft);
  }, []);

  const approvePackage = useCallback((token: string) => {
    const pkg = SEED_SCANS.find((s) => s.token === token);
    const record: ApprovalRecord = {
      token,
      approvedAt: new Date().toISOString(),
      contractRef: pkg?.contract.reference ?? 'CN-APX-—',
      noteRef: pkg?.note.reference ?? 'PN-APX-—',
    };
    setApprovals((prev) => ({ ...prev, [token]: record }));
    return record;
  }, []);

  const closeRental = useCallback(
    (rentalId: string, input?: { notes?: string }) => {
      setRentalOverrides((prev) => ({
        ...prev,
        [rentalId]: {
          ...(prev[rentalId] ?? {}),
          closureStatus: 'closed',
          closedAt: new Date().toISOString(),
          closureNotes: input?.notes?.trim() || undefined,
          status: 'returned',
          timeline: undefined,
        },
      }));
    },
    [],
  );

  const reportDamage = useCallback(
    (rentalId: string, input: ReportDamageInput) => {
      const rental = SEED_MERCHANT_RENTALS.find((r) => r.id === rentalId);
      if (!rental) return null;
      const year = new Date().getFullYear();
      const id = `DM-${year}-${Math.floor(100 + Math.random() * 899)}`;
      const created: MerchantDamageCase = {
        id,
        rentalId,
        customerName: rental.customerName,
        customerInitials: rental.customerInitials,
        item: rental.item,
        severity: input.severity,
        claimAmount: input.claimAmount,
        reportedAt: new Date().toISOString(),
        status: 'reported',
        notes: input.notes?.trim() || undefined,
        evidence: input.evidence && input.evidence.length ? input.evidence : undefined,
        contractRef: rental.contractRef,
        noteRef: rental.noteRef,
        invoiceRef: `INV-${rental.contractRef.replace('CN-', '')}-LATEST`,
      };
      setExtraDamages((prev) => [created, ...prev]);
      setRentalOverrides((prev) => ({
        ...prev,
        [rentalId]: {
          ...(prev[rentalId] ?? {}),
          closureStatus: 'damaged',
          damageCaseId: id,
        },
      }));
      return created;
    },
    [],
  );

  const approveMerchantRequest = useCallback(
    (id: string, notes?: string) => {
      const exists = SEED_ADMIN_PENDING_MERCHANTS.some((m) => m.id === id);
      if (!exists) return null;
      const decision: AdminMerchantDecision = {
        status: 'approved',
        decidedAt: new Date().toISOString(),
        notes: notes?.trim() || undefined,
        reviewer: 'AppLux Operator',
      };
      setMerchantDecisions((prev) => ({ ...prev, [id]: decision }));
      return decision;
    },
    [],
  );

  const rejectMerchantRequest = useCallback(
    (id: string, notes?: string) => {
      const exists = SEED_ADMIN_PENDING_MERCHANTS.some((m) => m.id === id);
      if (!exists) return null;
      const decision: AdminMerchantDecision = {
        status: 'rejected',
        decidedAt: new Date().toISOString(),
        notes: notes?.trim() || undefined,
        reviewer: 'AppLux Operator',
      };
      setMerchantDecisions((prev) => ({ ...prev, [id]: decision }));
      return decision;
    },
    [],
  );

  const resetMerchantRequest = useCallback((id: string) => {
    setMerchantDecisions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const adminMerchantRequests = useMemo<AdminMerchantRequest[]>(
    () =>
      SEED_ADMIN_PENDING_MERCHANTS.map((m) => ({
        ...m,
        decision: merchantDecisions[m.id] ?? {
          status: 'pending',
          decidedAt: m.submittedAt,
        },
      })),
    [merchantDecisions],
  );

  const adminUsers = useMemo<AdminUserRecord[]>(
    () =>
      SEED_ADMIN_USERS_LIST.map((u) => {
        const o = userOverrides[u.id];
        return o ? { ...u, ...o } : u;
      }),
    [userOverrides],
  );

  const setAdminUserStatus = useCallback(
    (id: string, status: AdminUserStatus) => {
      const base = SEED_ADMIN_USERS_LIST.find((u) => u.id === id);
      if (!base) return null;
      setUserOverrides((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? {}), status },
      }));
      return { ...base, ...(userOverrides[id] ?? {}), status };
    },
    [userOverrides],
  );

  const setAdminUserLimit = useCallback(
    (id: string, limit: number) => {
      const base = SEED_ADMIN_USERS_LIST.find((u) => u.id === id);
      if (!base) return null;
      const safe = Number.isFinite(limit) && limit >= 0 ? Math.round(limit) : 0;
      setUserOverrides((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? {}), eligibilityLimit: safe },
      }));
      return { ...base, ...(userOverrides[id] ?? {}), eligibilityLimit: safe };
    },
    [userOverrides],
  );

  const resetAdminUser = useCallback((id: string) => {
    setUserOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const adminCases = useMemo<AdminCaseDetail[]>(() => {
    return Object.values(SEED_ADMIN_CASE_DETAILS).map((c) => {
      const o = caseOverrides[c.id];
      if (!o) return c;
      const stage = o.stage ?? c.escalation.currentStage;
      const nextStage = stageAfter(stage);
      return {
        ...c,
        notes: o.notes ? [...c.notes, ...o.notes] : c.notes,
        audit: o.audit ? [...c.audit, ...o.audit] : c.audit,
        escalation: {
          currentStage: stage,
          nextStage,
          nextActionKey: nextActionKeyFor(nextStage),
        },
      };
    });
  }, [caseOverrides]);

  const addCaseNote = useCallback(
    (caseId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const base = SEED_ADMIN_CASE_DETAILS[caseId];
      if (!base) return null;
      const at = new Date().toISOString();
      const noteId = `NT-${caseId}-EX-${Date.now().toString().slice(-6)}`;
      const auditId = `AD-${caseId}-EX-${Date.now().toString().slice(-6)}`;
      const note: AdminCaseNote = {
        id: noteId,
        author: 'AppLux Operator',
        role: 'operator',
        text: trimmed,
        at,
      };
      const audit: AdminCaseAuditEntry = {
        id: auditId,
        action: 'note-added',
        actor: 'AppLux Operator',
        at,
      };
      setCaseOverrides((prev) => {
        const cur = prev[caseId] ?? {};
        return {
          ...prev,
          [caseId]: {
            ...cur,
            notes: [...(cur.notes ?? []), note],
            audit: [...(cur.audit ?? []), audit],
          },
        };
      });
      const stage = (caseOverrides[caseId]?.stage ?? base.escalation.currentStage);
      const nextStage = stageAfter(stage);
      return {
        ...base,
        notes: [
          ...base.notes,
          ...(caseOverrides[caseId]?.notes ?? []),
          note,
        ],
        audit: [
          ...base.audit,
          ...(caseOverrides[caseId]?.audit ?? []),
          audit,
        ],
        escalation: {
          currentStage: stage,
          nextStage,
          nextActionKey: nextActionKeyFor(nextStage),
        },
      };
    },
    [caseOverrides],
  );

  const escalateCase = useCallback(
    (caseId: string) => {
      const base = SEED_ADMIN_CASE_DETAILS[caseId];
      if (!base) return null;
      const curStage = caseOverrides[caseId]?.stage ?? base.escalation.currentStage;
      const next = stageAfter(curStage);
      if (!next) return null;
      const at = new Date().toISOString();
      const auditId = `AD-${caseId}-ESC-${Date.now().toString().slice(-6)}`;
      const audit: AdminCaseAuditEntry = {
        id: auditId,
        action: auditActionForStage(next),
        actor: 'AppLux Operator',
        at,
      };
      setCaseOverrides((prev) => {
        const cur = prev[caseId] ?? {};
        return {
          ...prev,
          [caseId]: {
            ...cur,
            stage: next,
            audit: [...(cur.audit ?? []), audit],
          },
        };
      });
      const afterNext = stageAfter(next);
      return {
        ...base,
        notes: [...base.notes, ...(caseOverrides[caseId]?.notes ?? [])],
        audit: [
          ...base.audit,
          ...(caseOverrides[caseId]?.audit ?? []),
          audit,
        ],
        escalation: {
          currentStage: next,
          nextStage: afterNext,
          nextActionKey: nextActionKeyFor(afterNext),
        },
      };
    },
    [caseOverrides],
  );

  const resetCase = useCallback((caseId: string) => {
    setCaseOverrides((prev) => {
      if (!(caseId in prev)) return prev;
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
  }, []);

  const eligibility = DEFAULT_ELIGIBILITY;
  const invoices = SEED_INVOICES;
  const contracts = SEED_CONTRACTS;
  const notes = SEED_NOTES;
  const history = SEED_HISTORY;
  const stores = SEED_STORES;
  const scans = SEED_SCANS;
  const merchantRentals = useMemo<MerchantRental[]>(
    () =>
      SEED_MERCHANT_RENTALS.map((r) => {
        const o = rentalOverrides[r.id];
        if (!o) return r;
        return { ...r, ...o };
      }),
    [rentalOverrides],
  );
  const merchantApprovals = SEED_MERCHANT_APPROVALS;
  const merchantDamages = useMemo<MerchantDamageCase[]>(
    () => [...extraDamages, ...SEED_MERCHANT_DAMAGES],
    [extraDamages],
  );
  const merchantHistory = SEED_MERCHANT_HISTORY;
  const merchantCustomers = SEED_MERCHANT_CUSTOMERS;

  const value = useMemo<StoreContextValue>(
    () => ({
      session,
      draft,
      updateDraft,
      resetDraft,
      completeRegistration,
      signOut,
      eligibility,
      invoices,
      contracts,
      notes,
      history,
      stores,
      scans,
      approvals,
      approvePackage,
      merchant,
      merchantDraft,
      updateMerchantDraft,
      resetMerchantDraft,
      submitMerchantApproval,
      approveMerchant,
      signOutMerchant,
      merchantRentals,
      merchantApprovals,
      merchantDamages,
      merchantHistory,
      merchantCustomers,
      closeRental,
      reportDamage,
      adminMerchantRequests,
      approveMerchantRequest,
      rejectMerchantRequest,
      resetMerchantRequest,
      adminUsers,
      setAdminUserStatus,
      setAdminUserLimit,
      resetAdminUser,
      adminCases,
      addCaseNote,
      escalateCase,
      resetCase,
    }),
    [
      session,
      draft,
      updateDraft,
      resetDraft,
      completeRegistration,
      signOut,
      eligibility,
      invoices,
      contracts,
      notes,
      history,
      stores,
      scans,
      approvals,
      approvePackage,
      merchant,
      merchantDraft,
      updateMerchantDraft,
      resetMerchantDraft,
      submitMerchantApproval,
      approveMerchant,
      signOutMerchant,
      merchantRentals,
      merchantApprovals,
      merchantDamages,
      merchantHistory,
      merchantCustomers,
      closeRental,
      reportDamage,
      adminMerchantRequests,
      approveMerchantRequest,
      rejectMerchantRequest,
      resetMerchantRequest,
      adminUsers,
      setAdminUserStatus,
      setAdminUserLimit,
      resetAdminUser,
      adminCases,
      addCaseNote,
      escalateCase,
      resetCase,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
