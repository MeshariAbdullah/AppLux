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

// =====================================================================
// AppLux auth provider — single source of truth for: auth session,
// profile / role, and the boolean RootRedirect uses to route post-login.
//
// Routing contract: RootRedirect (src/routes.tsx) is the ONLY place
// that maps role → home. Login pages observe `status === 'authenticated'`,
// navigate to '/', and let RootRedirect decide. Nothing else should
// duplicate the role → path map.
//
// Status transitions:
//   loading   → initial bootstrap (getSession in-flight)
//   anonymous → no Supabase session
//   authenticated → session present. Profile may still be loading;
//                   `profileLoading` indicates the brief window after
//                   sign-in where the session is known but the profile
//                   row hasn't been fetched yet. `RootRedirect` /
//                   `RequireRole` wait on `profileLoading === false`
//                   before doing role-based routing.
//   disabled  → env vars not inlined; the provider returns DEFAULT
//
// Why the split: previously `setStatus('authenticated')` was gated on
// `await fetchProfile`. A slow or hung profile request held the Login
// button on its "Verifying…" spinner indefinitely with no error path.
// Decoupling moves the spinner from the login page to `/`, where a
// 10s timeout converts a hung profile load into a visible error.
//
// Eligibility is intentionally NOT on the critical path. Merchants and
// admins have no eligibility row at all, and customers don't need it
// for routing — we load it in the background after status flips and
// expose it as `eligibility` / `eligibilityLoading`.
// =====================================================================

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'disabled';

type SupabaseAuthValue = {
  /** 'disabled' when env is missing — components should fall back to demo data. */
  status: AuthStatus;
  configured: boolean;
  session: Session | null;
  profile: ProfileRow | null;
  /**
   * Set when the post-auth profile fetch failed (network, RLS, missing
   * row, timeout). Lets RootRedirect distinguish a real role=null from
   * a profile-load failure. When set, the user sees a clear recoverable
   * error UI with Retry / Sign out — never a silent /welcome bounce.
   */
  profileError: Error | null;
  /**
   * True between "we know a session exists" and "the profile row has
   * been fetched". RootRedirect and RequireRole wait on this so role
   * routing only fires once `role` is meaningful.
   */
  profileLoading: boolean;
  eligibility: RentalEligibilityRow | null;
  eligibilityLoading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  isMerchant: boolean;
  isCustomer: boolean;
  /**
   * Sign up a new user. Returns the auth payload so the caller can
   * detect email-confirmation flows (Supabase returns `session: null`
   * when the project requires email confirmation — the user is created
   * but NOT logged in, so the caller must render a "check your email"
   * state instead of redirecting).
   */
  signUp: (input: SignUpInput) => Promise<{ session: Session | null }>;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch profile + eligibility for the current user. */
  refresh: () => Promise<void>;
};

const noop = async (): Promise<never> => {
  throw new Error('Supabase auth is disabled — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
};

const DEFAULT: SupabaseAuthValue = {
  status: 'disabled',
  configured: false,
  session: null,
  profile: null,
  profileError: null,
  profileLoading: false,
  eligibility: null,
  eligibilityLoading: false,
  role: null,
  isAdmin: false,
  isMerchant: false,
  isCustomer: false,
  signUp: noop,
  signIn: noop,
  signOut: noop,
  refresh: async () => {},
};

/**
 * Wrap a promise with a hard timeout. Used on profile fetches so a
 * hung Supabase request can't permanently park the UI on a spinner.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

const PROFILE_LOAD_TIMEOUT_MS = 10_000;

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
  const [profileError, setProfileError] = useState<Error | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [eligibility, setEligibility] = useState<RentalEligibilityRow | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  // Track in-flight loads so a stale response from a previous user
  // (rapid logout/login, token refresh, multi-tab) can't overwrite the
  // current user's data.
  const loadIdRef = useRef(0);

  /**
   * Fetch the profile — required for role-based routing. NOT awaited
   * inline by the auth listener; runs in the background so the session
   * transition is visible to the rest of the app immediately. The
   * 10s timeout converts a hung Supabase request into a visible error
   * (caught here, surfaced by RootRedirect via `profileError`).
   */
  const loadProfile = useCallback(async (userId: string, loadId: number) => {
    setProfileLoading(true);
    try {
      const p = await withTimeout(
        fetchProfile(userId),
        PROFILE_LOAD_TIMEOUT_MS,
        'profile fetch',
      );
      if (loadIdRef.current !== loadId) return null; // superseded
      setProfile(p);
      setProfileError(null);
      return p;
    } catch (err) {
      if (loadIdRef.current !== loadId) return null;
      // eslint-disable-next-line no-console
      console.error('[applux] failed to load profile', err);
      setProfile(null);
      setProfileError(err instanceof Error ? err : new Error('Profile load failed'));
      return null;
    } finally {
      if (loadIdRef.current === loadId) setProfileLoading(false);
    }
  }, []);

  /**
   * Fetch eligibility — OPTIONAL. Customers may or may not have a row,
   * merchants and admins never do. We do not block status='authenticated'
   * on this. Errors here are logged but do NOT pollute profileError.
   */
  const loadEligibility = useCallback(async (userId: string, loadId: number) => {
    setEligibilityLoading(true);
    try {
      const e = await fetchEligibility(userId);
      if (loadIdRef.current !== loadId) return;
      setEligibility(e);
    } catch (err) {
      if (loadIdRef.current !== loadId) return;
      // eslint-disable-next-line no-console
      console.error('[applux] failed to load eligibility (non-fatal)', err);
      setEligibility(null);
    } finally {
      if (loadIdRef.current === loadId) setEligibilityLoading(false);
    }
  }, []);

  /**
   * Dispatch the user-context fetches in the background. Returns
   * immediately so the caller can flip status='authenticated' without
   * waiting on the network. The internal staleness check
   * (loadIdRef.current === loadId) ensures late writes from a
   * superseded session are discarded.
   */
  const startUserContextLoad = useCallback(
    (userId: string | null) => {
      const myLoad = ++loadIdRef.current;
      if (!userId) {
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
        setEligibility(null);
        setEligibilityLoading(false);
        return;
      }
      void loadProfile(userId, myLoad);
      void loadEligibility(userId, myLoad);
    },
    [loadProfile, loadEligibility],
  );

  useEffect(() => {
    let cancelled = false;

    // Initial session bootstrap. Flip status as soon as we know whether
    // a session exists; profile + eligibility load in the background.
    supabase.auth.getSession().then(({ data, error }) => {
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
        startUserContextLoad(s.user.id);
        setStatus('authenticated');
      } else {
        setStatus('anonymous');
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        startUserContextLoad(s.user.id);
        setStatus('authenticated');
      } else {
        loadIdRef.current += 1;
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
        setEligibility(null);
        setEligibilityLoading(false);
        setStatus('anonymous');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, startUserContextLoad]);

  const signUp = useCallback(async (input: SignUpInput) => {
    const { session: s } = await authSignUp(input);
    return { session: s };
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    await authSignIn(input);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
  }, []);

  const refresh = useCallback(async () => {
    // Re-runs the same background dispatcher used at boot — clears
    // profileError, sets profileLoading, then re-fetches profile and
    // eligibility under a fresh loadId so stale responses are discarded.
    const userId = session?.user.id ?? null;
    const myLoad = ++loadIdRef.current;
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      setEligibility(null);
      setEligibilityLoading(false);
      return;
    }
    await loadProfile(userId, myLoad);
    void loadEligibility(userId, myLoad);
  }, [loadProfile, loadEligibility, session]);

  const value = useMemo<SupabaseAuthValue>(() => {
    const role = profile?.role ?? null;
    return {
      status,
      configured: true,
      session,
      profile,
      profileError,
      profileLoading,
      eligibility,
      eligibilityLoading,
      role,
      isAdmin: role === 'admin',
      isMerchant: role === 'merchant',
      isCustomer: role === 'customer',
      signUp,
      signIn,
      signOut,
      refresh,
    };
  }, [
    status,
    session,
    profile,
    profileError,
    profileLoading,
    eligibility,
    eligibilityLoading,
    signUp,
    signIn,
    signOut,
    refresh,
  ]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}

export function useSupabaseAuth(): SupabaseAuthValue {
  return useContext(SupabaseAuthContext);
}
