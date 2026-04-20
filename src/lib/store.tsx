import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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

  const value = useMemo<StoreContextValue>(
    () => ({ session, draft, updateDraft, resetDraft, completeRegistration, signOut }),
    [session, draft, updateDraft, resetDraft, completeRegistration, signOut],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
