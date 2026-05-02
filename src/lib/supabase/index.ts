// Supabase entry point — single import surface for the rest of the app.
//
// Usage:
//   import { useSupabaseAuth, listMerchants } from '@/lib/supabase';
//
// All exports are tree-shakeable; importing one helper does not pull
// in the others.

export { getSupabase, requireSupabase, supabaseConfigured } from './client';
export type { Database } from './types';
export type {
  AppRole,
  AccountStatus,
  EligibilityTier,
  LocalizedJson,
  MerchantApplicationInsert,
  MerchantApplicationRow,
  MerchantApplicationStatus,
  MerchantApplicationUpdate,
  MerchantInsert,
  MerchantRow,
  MerchantStatusDB,
  MerchantUpdate,
  ProfileInsert,
  ProfileRow,
  ProfileUpdate,
  RentalCategoryDB,
  RentalEligibilityInsert,
  RentalEligibilityRow,
  RentalEligibilityUpdate,
} from './types';

export {
  signUpWithPassword,
  signInWithPassword,
  signOut,
  getCurrentSession,
} from './auth';

export type { SignInInput, SignUpInput } from './auth';

export { fetchProfile, updateProfile } from './queries/profile';
export { fetchEligibility } from './queries/eligibility';
export {
  listMerchants,
  fetchMerchant,
  fetchMyMerchant,
} from './queries/merchants';
export type { ListMerchantsFilter } from './queries/merchants';
export {
  submitMerchantApplication,
  listMerchantApplications,
  fetchMerchantApplication,
  decideMerchantApplication,
} from './queries/merchant-applications';

export {
  SupabaseAuthProvider,
  useSupabaseAuth,
} from './SupabaseAuthProvider';

export {
  adaptEligibility,
  adaptMerchantToStore,
  adaptMerchantApplication,
} from './adapters';
