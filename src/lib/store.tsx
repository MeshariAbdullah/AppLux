import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { demoMode } from './supabase/client';
import {
  DEFAULT_ELIGIBILITY,
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
  rejectedAt: string | null;
  rejectionReason: string | null;
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
  rejectMerchant: (reason?: string) => void;
  resubmitMerchantRequest: () => void;
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
  merchantDecisions: Record<string, AdminMerchantDecision>;
  approveMerchantRequest: (id: string, notes?: string) => AdminMerchantDecision | null;
  rejectMerchantRequest: (id: string, notes?: string) => AdminMerchantDecision | null;
  resetMerchantRequest: (id: string) => void;
  adminUsers: AdminUserRecord[];
  setAdminUserStatus: (id: string, status: AdminUserStatus) => AdminUserRecord | null;
  setAdminUserLimit: (id: string, limit: number) => AdminUserRecord | null;
  resetAdminUser: (id: string) => void;
};

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

// =====================================================================
// Stable empty references used when demoMode is OFF. Every page that
// previously read seed data through useStore() now sees an empty array
// (or zeroed eligibility) in live mode — which forces the `live ?? store`
// fallback pattern to collapse to `live ?? []`, never showing demo
// records before the real Supabase query resolves.
//
// IMPORTANT: these are module-level constants on purpose. Returning a
// fresh [] every render would re-trigger downstream memos and effects.
// =====================================================================
const EMPTY_INVOICES: Invoice[] = [];
const EMPTY_CONTRACTS: Contract[] = [];
const EMPTY_NOTES: PromissoryNote[] = [];
const EMPTY_HISTORY: HistoryItem[] = [];
const EMPTY_STORES: PartnerStore[] = [];
const EMPTY_SCANS: ScannedPackage[] = [];
const EMPTY_MERCHANT_RENTALS: MerchantRental[] = [];
const EMPTY_MERCHANT_APPROVALS: MerchantApproval[] = [];
const EMPTY_MERCHANT_DAMAGES: MerchantDamageCase[] = [];
const EMPTY_MERCHANT_HISTORY: MerchantHistoryRecord[] = [];
const EMPTY_MERCHANT_CUSTOMERS: MerchantCustomer[] = [];
const EMPTY_ADMIN_MERCHANT_REQUESTS: AdminMerchantRequest[] = [];
const EMPTY_ADMIN_USERS: AdminUserRecord[] = [];
const EMPTY_ELIGIBILITY: RentalEligibility = {
  limit: 0,
  used: 0,
  remaining: 0,
  tier: 'standard',
  assignedBy: '',
  assignedAt: '',
};

const STORAGE_KEY = 'applux.session';
const MERCHANT_KEY = 'applux.merchant';
const APPROVALS_KEY = 'applux.approvals';
const RENTAL_OVERRIDES_KEY = 'applux.rentalOverrides';
const EXTRA_DAMAGES_KEY = 'applux.extraDamages';
const MERCHANT_DECISIONS_KEY = 'applux.merchantDecisions';
const EXTRA_MERCHANT_REQUESTS_KEY = 'applux.extraMerchantRequests';
const USER_OVERRIDES_KEY = 'applux.userOverrides';

function buildAdminRecord(p: MerchantProfile): AdminPendingMerchant {
  const initials = (p.companyName || 'M').trim().slice(0, 2).toUpperCase();
  return {
    id: p.id,
    companyName: p.companyName || '—',
    authorizedName: p.authorizedName || '—',
    authorizedId: p.authorizedId || '—',
    commercialReg: p.commercialReg || '—',
    vatNumber: '—',
    iban: p.iban || '—',
    contactEmail: p.contactEmail || '—',
    contactPhone: p.contactPhone || '—',
    city: p.city || '—',
    address: p.address || '—',
    // Registration form doesn't capture category/expectedVolume; default safely.
    category: 'dresses',
    expectedVolume: 0,
    submittedAt: p.submittedAt,
    initials,
    branches: p.branches.map((b) => ({
      id: b.id,
      name: b.name,
      city: b.city,
      address: b.address,
      phone: b.phone,
    })),
    docs: {
      commercialReg: 'pending',
      vat: 'pending',
      bankLetter: 'pending',
      authorizedId: 'pending',
    },
  };
}

const StoreContext = createContext<StoreContextValue | null>(null);

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or quota exceeded */
  }
}

function readSession(): Session {
  return readJSON<Session>(STORAGE_KEY, null);
}

function readMerchant(): MerchantProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MERCHANT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MerchantProfile>;
    return {
      rejectedAt: null,
      rejectionReason: null,
      ...parsed,
    } as MerchantProfile;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(readSession);
  const [draft, setDraft] = useState<RegistrationDraft>(emptyRegistration);
  const [approvals, setApprovals] = useState<Record<string, ApprovalRecord>>(
    () => readJSON<Record<string, ApprovalRecord>>(APPROVALS_KEY, {}),
  );
  const [merchant, setMerchant] = useState<MerchantProfile | null>(readMerchant);
  const [merchantDraft, setMerchantDraft] = useState<MerchantDraft>(emptyMerchantDraft);
  const [rentalOverrides, setRentalOverrides] = useState<
    Record<string, Partial<MerchantRental>>
  >(() =>
    readJSON<Record<string, Partial<MerchantRental>>>(RENTAL_OVERRIDES_KEY, {}),
  );
  const [extraDamages, setExtraDamages] = useState<MerchantDamageCase[]>(() =>
    readJSON<MerchantDamageCase[]>(EXTRA_DAMAGES_KEY, []),
  );
  const [merchantDecisions, setMerchantDecisions] = useState<
    Record<string, AdminMerchantDecision>
  >(() =>
    readJSON<Record<string, AdminMerchantDecision>>(MERCHANT_DECISIONS_KEY, {}),
  );
  const [extraMerchantRequests, setExtraMerchantRequests] = useState<
    Record<string, AdminPendingMerchant>
  >(() =>
    readJSON<Record<string, AdminPendingMerchant>>(
      EXTRA_MERCHANT_REQUESTS_KEY,
      {},
    ),
  );
  const [userOverrides, setUserOverrides] = useState<
    Record<string, Partial<AdminUserRecord>>
  >(() =>
    readJSON<Record<string, Partial<AdminUserRecord>>>(USER_OVERRIDES_KEY, {}),
  );

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

  // Persist operational state so admin/merchant changes survive page refresh.
  useEffect(() => writeJSON(APPROVALS_KEY, approvals), [approvals]);
  useEffect(() => writeJSON(RENTAL_OVERRIDES_KEY, rentalOverrides), [rentalOverrides]);
  useEffect(() => {
    // Strip evidence (potentially large base64) before persisting; keep the
    // case record itself so the damage stays visible after refresh.
    const lite = extraDamages.map((d) =>
      d.evidence && d.evidence.length ? { ...d, evidence: undefined } : d,
    );
    writeJSON(EXTRA_DAMAGES_KEY, lite);
  }, [extraDamages]);
  useEffect(
    () => writeJSON(MERCHANT_DECISIONS_KEY, merchantDecisions),
    [merchantDecisions],
  );
  useEffect(
    () => writeJSON(EXTRA_MERCHANT_REQUESTS_KEY, extraMerchantRequests),
    [extraMerchantRequests],
  );
  useEffect(() => writeJSON(USER_OVERRIDES_KEY, userOverrides), [userOverrides]);

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
    const id = `MRC-${Date.now().toString().slice(-6)}`;
    const submittedAt = new Date().toISOString();
    const profile: MerchantProfile = {
      ...merchantDraft,
      id,
      status: 'pending',
      submittedAt,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
    };
    setMerchant(profile);
    // Surface this request in the admin queue and seed a pending decision so
    // both the merchant pending page and the admin list read the same source.
    setExtraMerchantRequests((prev) => ({
      ...prev,
      [id]: buildAdminRecord(profile),
    }));
    setMerchantDecisions((prev) => ({
      ...prev,
      [id]: { status: 'pending', decidedAt: submittedAt },
    }));
    return profile;
  }, [merchantDraft]);

  const approveMerchant = useCallback(() => {
    setMerchant((m) => {
      if (!m) return m;
      const at = new Date().toISOString();
      setMerchantDecisions((prev) => ({
        ...prev,
        [m.id]: {
          status: 'approved',
          decidedAt: at,
          notes: prev[m.id]?.notes,
          reviewer: prev[m.id]?.reviewer ?? 'Lend Operator',
        },
      }));
      return {
        ...m,
        status: 'approved',
        approvedAt: at,
        rejectedAt: null,
        rejectionReason: null,
      };
    });
  }, []);

  const rejectMerchant = useCallback((reason?: string) => {
    setMerchant((m) => {
      if (!m) return m;
      const at = new Date().toISOString();
      const trimmed = reason?.trim() || null;
      setMerchantDecisions((prev) => ({
        ...prev,
        [m.id]: {
          status: 'rejected',
          decidedAt: at,
          notes: trimmed ?? undefined,
          reviewer: prev[m.id]?.reviewer ?? 'Lend Operator',
        },
      }));
      return {
        ...m,
        status: 'rejected',
        rejectedAt: at,
        rejectionReason: trimmed,
        approvedAt: null,
      };
    });
  }, []);

  const resubmitMerchantRequest = useCallback(() => {
    setMerchant((m) => {
      if (!m) return m;
      const at = new Date().toISOString();
      setMerchantDecisions((prev) => ({
        ...prev,
        [m.id]: { status: 'pending', decidedAt: at },
      }));
      return {
        ...m,
        status: 'pending',
        submittedAt: at,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,
      };
    });
  }, []);

  const signOutMerchant = useCallback(() => {
    setMerchant((m) => {
      if (m) {
        // Drop the locally-registered merchant from the admin queue and any
        // pending decision tied to it so the demo doesn't accumulate ghosts.
        setExtraMerchantRequests((prev) => {
          if (!(m.id in prev)) return prev;
          const next = { ...prev };
          delete next[m.id];
          return next;
        });
        setMerchantDecisions((prev) => {
          if (!(m.id in prev)) return prev;
          const next = { ...prev };
          delete next[m.id];
          return next;
        });
      }
      return null;
    });
    setMerchantDraft(emptyMerchantDraft);
  }, []);

  const approvePackage = useCallback((token: string) => {
    const pkg = SEED_SCANS.find((s) => s.token === token);
    const record: ApprovalRecord = {
      token,
      approvedAt: new Date().toISOString(),
      contractRef: pkg?.contract.reference ?? 'LND-—',
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
        invoiceRef: `INV-${rental.contractRef.replace(/^(?:CN|LND)-/, '')}-LATEST`,
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
        reviewer: 'Lend Operator',
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
        reviewer: 'Lend Operator',
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

  const adminMerchantRequests = useMemo<AdminMerchantRequest[]>(() => {
    if (!demoMode) return EMPTY_ADMIN_MERCHANT_REQUESTS;
    const seeded = SEED_ADMIN_PENDING_MERCHANTS.map((m) => ({
      ...m,
      decision: merchantDecisions[m.id] ?? {
        status: 'pending' as const,
        decidedAt: m.submittedAt,
      },
    }));
    const extras = Object.values(extraMerchantRequests).map((m) => ({
      ...m,
      decision: merchantDecisions[m.id] ?? {
        status: 'pending' as const,
        decidedAt: m.submittedAt,
      },
    }));
    // Locally-registered merchants are most relevant — surface them first.
    return [...extras, ...seeded];
  }, [merchantDecisions, extraMerchantRequests]);

  const adminUsers = useMemo<AdminUserRecord[]>(
    () =>
      demoMode
        ? SEED_ADMIN_USERS_LIST.map((u) => {
            const o = userOverrides[u.id];
            return o ? { ...u, ...o } : u;
          })
        : EMPTY_ADMIN_USERS,
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


  // PRODUCTION SAFETY (Phase 9): seed data is exposed by this provider
  // ONLY when demoMode is true. In live (Supabase) mode every list
  // collapses to []; the rental flow (`live ?? store.invoices` etc.)
  // therefore renders the page's empty/loading state instead of demo
  // records flashing before real data arrives. `demoMode` is a stable
  // module-level snapshot — see src/lib/supabase/client.ts.
  const eligibility = demoMode ? DEFAULT_ELIGIBILITY : EMPTY_ELIGIBILITY;
  const invoices = demoMode ? SEED_INVOICES : EMPTY_INVOICES;
  const contracts = demoMode ? SEED_CONTRACTS : EMPTY_CONTRACTS;
  const notes = demoMode ? SEED_NOTES : EMPTY_NOTES;
  const history = demoMode ? SEED_HISTORY : EMPTY_HISTORY;
  const stores = demoMode ? SEED_STORES : EMPTY_STORES;
  const scans = demoMode ? SEED_SCANS : EMPTY_SCANS;
  const merchantRentals = useMemo<MerchantRental[]>(
    () =>
      demoMode
        ? SEED_MERCHANT_RENTALS.map((r) => {
            const o = rentalOverrides[r.id];
            if (!o) return r;
            return { ...r, ...o };
          })
        : EMPTY_MERCHANT_RENTALS,
    [rentalOverrides],
  );
  const merchantApprovals = demoMode
    ? SEED_MERCHANT_APPROVALS
    : EMPTY_MERCHANT_APPROVALS;
  const merchantDamages = useMemo<MerchantDamageCase[]>(
    () =>
      demoMode
        ? [...extraDamages, ...SEED_MERCHANT_DAMAGES]
        : EMPTY_MERCHANT_DAMAGES,
    [extraDamages],
  );
  const merchantHistory = demoMode ? SEED_MERCHANT_HISTORY : EMPTY_MERCHANT_HISTORY;
  const merchantCustomers = demoMode
    ? SEED_MERCHANT_CUSTOMERS
    : EMPTY_MERCHANT_CUSTOMERS;

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
      rejectMerchant,
      resubmitMerchantRequest,
      signOutMerchant,
      merchantRentals,
      merchantApprovals,
      merchantDamages,
      merchantHistory,
      merchantCustomers,
      closeRental,
      reportDamage,
      adminMerchantRequests,
      merchantDecisions,
      approveMerchantRequest,
      rejectMerchantRequest,
      resetMerchantRequest,
      adminUsers,
      setAdminUserStatus,
      setAdminUserLimit,
      resetAdminUser,
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
      rejectMerchant,
      resubmitMerchantRequest,
      signOutMerchant,
      merchantRentals,
      merchantApprovals,
      merchantDamages,
      merchantHistory,
      merchantCustomers,
      closeRental,
      reportDamage,
      adminMerchantRequests,
      merchantDecisions,
      approveMerchantRequest,
      rejectMerchantRequest,
      resetMerchantRequest,
      adminUsers,
      setAdminUserStatus,
      setAdminUserLimit,
      resetAdminUser,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
