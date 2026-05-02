import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, supabaseConfigured } from './client';
import type {
  AppRole,
  ProfileRow,
  RentalEligibilityRow,
} from './types';
import { fetchProfile } from './queries/profile';
import { fetchEligibility } from './queries/eligibility';
import {
  signInWithPassword as authSignIn,
  signOut as authSignOut,
  signUpWithPassword as authSignUp,
  type SignInInput,
  type SignUpInput,
} from './auth';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'disabled';

type SupabaseAuthValue = {
  /** 'disabled' when env is missing — components should fall back to demo data. */
  status: AuthStatus;
  configured: boolean;
  session: Session | null;
  profile: ProfileRow | null;
  eligibility: RentalEligibilityRow | null;
  role: AppRole | null;
  isAdmin: boolean;
  isMerchant: boolean;
  isCustomer: boolean;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch profile + eligibility for the current user. */
  refresh: () => Promise<void>;
};

const noop = async () => {
  throw new Error('Supabase auth is disabled — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
};

const DEFAULT: SupabaseAuthValue = {
  status: 'disabled',
  configured: false,
  session: null,
  profile: null,
  eligibility: null,
  role: null,
  isAdmin: false,
  isMerchant: false,
  isCustomer: false,
  signUp: noop,
  signIn: noop,
  signOut: noop,
  refresh: async () => {},
};

const SupabaseAuthContext = createContext<SupabaseAuthValue>(DEFAULT);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  // When env is missing, render straight through with the disabled default
  // so the demo keeps running unaffected.
  if (!supabaseConfigured) {
    return (
      <SupabaseAuthContext.Provider value={DEFAULT}>
        {children}
      </SupabaseAuthContext.Provider>
    );
  }
  return <ConfiguredProvider>{children}</ConfiguredProvider>;
}

function ConfiguredProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()!;
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [eligibility, setEligibility] = useState<RentalEligibilityRow | null>(null);

  // Track in-flight loads so a stale response from a previous user can't
  // overwrite the current user's data.
  const loadIdRef = useRef(0);

  const loadUserContext = useCallback(
    async (userId: string | null) => {
      const myLoad = ++loadIdRef.current;
      if (!userId) {
        setProfile(null);
        setEligibility(null);
        return;
      }
      try {
        const [p, e] = await Promise.all([
          fetchProfile(userId),
          fetchEligibility(userId),
        ]);
        if (loadIdRef.current !== myLoad) return; // superseded
        setProfile(p);
        setEligibility(e);
      } catch (err) {
        if (loadIdRef.current !== myLoad) return;
        // eslint-disable-next-line no-console
        console.error('[applux] failed to load profile/eligibility', err);
        setProfile(null);
        setEligibility(null);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    // Initial session bootstrap
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (cancelled) return;
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[applux] supabase getSession error', error);
        setStatus('anonymous');
        return;
      }
      const s = data.session;
      setSession(s);
      if (s?.user) {
        await loadUserContext(s.user.id);
        if (!cancelled) setStatus('authenticated');
      } else {
        setStatus('anonymous');
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s?.user) {
        await loadUserContext(s.user.id);
        setStatus('authenticated');
      } else {
        loadIdRef.current += 1;
        setProfile(null);
        setEligibility(null);
        setStatus('anonymous');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadUserContext]);

  const signUp = useCallback(async (input: SignUpInput) => {
    await authSignUp(input);
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    await authSignIn(input);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
  }, []);

  const refresh = useCallback(async () => {
    await loadUserContext(session?.user.id ?? null);
  }, [loadUserContext, session]);

  const value = useMemo<SupabaseAuthValue>(() => {
    const role = profile?.role ?? null;
    return {
      status,
      configured: true,
      session,
      profile,
      eligibility,
      role,
      isAdmin: role === 'admin',
      isMerchant: role === 'merchant',
      isCustomer: role === 'customer',
      signUp,
      signIn,
      signOut,
      refresh,
    };
  }, [status, session, profile, eligibility, signUp, signIn, signOut, refresh]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}

export function useSupabaseAuth(): SupabaseAuthValue {
  return useContext(SupabaseAuthContext);
}
