# AppLux MVP — Phase 2 Frontend Foundation

Phase 2 lands the **Supabase frontend foundation** without touching any screen yet. The
existing demo (`useStore` + localStorage seeds) keeps running unchanged. When the env
variables are set, the new auth provider wakes up and starts feeding real data through a
parallel surface that screens can opt into one slice at a time in Phase 3.

## What landed in Phase 2

- `@supabase/supabase-js` added as a runtime dependency.
- Single Supabase client (`src/lib/supabase/client.ts`) gated on env presence.
- Hand-typed `Database` covering the five Phase-2 entities: `profiles`, `rental_eligibility`, `merchants`, `merchant_applications` (`merchant_branches` accessed via merchants for now).
- Auth helpers (`signUp`, `signIn`, `signOut`, `getCurrentSession`).
- Query helpers under `src/lib/supabase/queries/` for profile, eligibility, partner stores (merchants), merchant applications.
- `SupabaseAuthProvider` mounted at the app root — listens to `onAuthStateChange`, fetches profile + eligibility on sign-in, exposes role flags.
- `useSupabaseAuth()` hook with role-aware fields (`isCustomer`, `isMerchant`, `isAdmin`).

## Env setup

Frontend env vars are Vite-prefixed (`VITE_*`).

```bash
cp .env.example .env.local
# then edit:
#   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
#   VITE_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
```

`.env.local` is git-ignored.

**Without these set:** `supabaseConfigured` is `false`, `getSupabase()` returns `null`, the auth provider stays in `disabled` status, the demo runs as before. This is intentional — Phase 2 should not break local development for anyone working without backend credentials.

## Public API

Single import surface — `@/lib/supabase`:

```ts
import {
  // Provider + hook
  SupabaseAuthProvider,
  useSupabaseAuth,

  // Client
  getSupabase,           // SupabaseClient | null
  requireSupabase,       // SupabaseClient (throws if not configured)
  supabaseConfigured,    // boolean

  // Auth
  signUpWithPassword,
  signInWithPassword,
  signOut,
  getCurrentSession,

  // Queries
  fetchProfile, updateProfile,
  fetchEligibility,
  listMerchants, fetchMerchant, fetchMyMerchant,
  submitMerchantApplication, listMerchantApplications,
  fetchMerchantApplication, decideMerchantApplication,
} from '@/lib/supabase';
```

### `useSupabaseAuth()`

```ts
const {
  status,        // 'loading' | 'authenticated' | 'anonymous' | 'disabled'
  configured,    // false when env missing → fall back to demo store
  session,       // Supabase Session | null
  profile,       // ProfileRow | null
  eligibility,   // RentalEligibilityRow | null
  role,          // 'customer' | 'merchant' | 'admin' | null
  isAdmin, isMerchant, isCustomer,
  signUp, signIn, signOut, refresh,
} = useSupabaseAuth();
```

Important: when `configured === false`, all methods throw and all data fields are `null`. Screens should branch on `configured` and keep using `useStore()` until they're ported.

## Initial data wiring plan (next slices)

Phase 2 only stands the foundation up. Phase 3 plugs real data into screens incrementally. Recommended slice order, smallest blast radius first:

| Slice | Screen | Surface |
|------|--------|---------|
| 1 | Auth Login + Welcome | `signInWithPassword`, `useSupabaseAuth().status === 'authenticated'` to gate routes |
| 2 | Profile screen | `useSupabaseAuth().profile` for name/email; `signOut` for the sign-out button |
| 3 | Home eligibility card | `useSupabaseAuth().eligibility` instead of the demo seed |
| 4 | Stores list (Partner Boutiques) | `listMerchants()` replacing the seeded `stores` array; map `MerchantRow → PartnerStore` shape adapter |
| 5 | MerchantRegister flow | `submitMerchantApplication()` on submit |
| 6 | AdminMerchants list + detail | `listMerchantApplications({ status: 'pending' })`, `decideMerchantApplication(id, 'approved' \| 'rejected')` |

Each slice should:
- Branch on `useSupabaseAuth().configured` so demo mode still works.
- Keep the existing `useStore()` data path as a fallback (`configured ? supabaseData : storeData`).
- Be commit-sized — one slice per PR.

For each slice, the order of operations is:
1. Adapter function: real DB row → existing UI type (e.g., `MerchantRow → PartnerStore`).
2. Custom hook calling the query + caching with `useState`/`useEffect` (or a `useSupabaseQuery` helper if patterns repeat).
3. Screen change: branch on `configured` + replace the data source.
4. Manual smoke in dev with a real Supabase project.

## Role-aware session model

The provider classifies the session by the `profiles.role` column, not by Supabase auth metadata. That's deliberate — role lifts (e.g., customer → merchant on application approval) happen in the database during admin review, and the next refresh of `profile` picks them up.

Route gating pattern for Phase 3:

```tsx
function RequireRole({ role, children }: { role: AppRole; children: ReactNode }) {
  const { status, role: actual } = useSupabaseAuth();
  if (status === 'loading') return null; // or a splash
  if (status !== 'authenticated' || actual !== role) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}
```

(Customer / merchant / admin route trees can each be wrapped — left for Phase 3.)

## What Phase 3 should be

Phase 3 lights up real data behind the front-end, slice by slice, in this order:

1. **Auth screens (Welcome / Login / Register)** wired to `signInWithPassword` / `signUpWithPassword`. Route guard component using `useSupabaseAuth().status`.
2. **Customer Home** reading `eligibility` from the auth provider + `listMerchants` for the boutique strip.
3. **Stores list + Stores detail** swapped to `listMerchants` / `fetchMerchant` with a `MerchantRow → PartnerStore` adapter so existing `StoreCard` keeps working unchanged.
4. **Merchant onboarding loop**: MerchantRegister → `submitMerchantApplication`; AdminMerchants list → `listMerchantApplications` / `decideMerchantApplication`. The actual provisioning of `merchants` rows + role lift becomes a Postgres function or Supabase Edge Function callable only by admins.
5. **Profile screen** reading from `profile`, sign-out via the provider.
6. **`useSupabaseQuery` helper** if the load+cache pattern repeats more than three times.

Phase 4+ (mapped, not planned): invoice + scan flow → contracts + notes; damage cases + Storage uploads; computed views for merchant + admin dashboards; Nafath/Nafith integrations; payments.
