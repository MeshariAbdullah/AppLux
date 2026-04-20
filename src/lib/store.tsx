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
  SEED_CONTRACTS,
  SEED_HISTORY,
  SEED_INVOICES,
  SEED_NOTES,
  SEED_STORES,
  type Contract,
  type HistoryItem,
  type Invoice,
  type PartnerStore,
  type PromissoryNote,
  type RentalEligibility,
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
};

const STORAGE_KEY = 'applux.session';

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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(readSession);
  const [draft, setDraft] = useState<RegistrationDraft>(emptyRegistration);

  useEffect(() => {
    try {
      if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [session]);

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
  }, []);

  const eligibility = DEFAULT_ELIGIBILITY;
  const invoices = SEED_INVOICES;
  const contracts = SEED_CONTRACTS;
  const notes = SEED_NOTES;
  const history = SEED_HISTORY;
  const stores = SEED_STORES;

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
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
