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
  AccountStatus,
  AppRole,
  ContractStatusDB,
  DamageCaseInsert,
  DamageCaseRow,
  DamageEvidenceInsert,
  DamageEvidenceRow,
  DamageSeverity,
  DamageStage,
  DamageStatus,
  EligibilityTier,
  EvidenceType,
  InvoiceStatus,
  LocalizedJson,
  MerchantApplicationInsert,
  MerchantApplicationRow,
  MerchantApplicationStatus,
  MerchantApplicationUpdate,
  MerchantInsert,
  MerchantRow,
  MerchantStatusDB,
  MerchantUpdate,
  NoteStatus,
  ProfileInsert,
  ProfileRow,
  ProfileUpdate,
  PromissoryNoteInsert,
  PromissoryNoteRow,
  RentalCategoryDB,
  RentalContractInsert,
  RentalContractRow,
  RentalEligibilityInsert,
  RentalEligibilityRow,
  RentalEligibilityUpdate,
  RentalInvoiceInsert,
  RentalInvoiceItemInsert,
  RentalInvoiceItemRow,
  RentalInvoiceRow,
} from './types';

export {
  signUpWithPassword,
  signInWithPassword,
  signOut,
  getCurrentSession,
} from './auth';

export type { SignInInput, SignUpInput } from './auth';

export {
  fetchProfile,
  fetchProfilesByIds,
  listProfiles,
  updateProfile,
} from './queries/profile';
export {
  fetchEligibility,
  fetchEligibilityByUserIds,
} from './queries/eligibility';
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
  provisionMerchantFromApplication,
} from './queries/merchant-applications';

export {
  acceptRentalInvoice,
  createInvoiceWithItems,
  fetchInvoiceByContractId,
  fetchInvoiceById,
  fetchInvoiceByToken,
  listCustomerInvoices,
  listInvoiceItems,
  listMerchantInvoices,
} from './queries/invoices';
export type { CreateInvoiceInput, CreatedInvoice } from './queries/invoices';

export {
  closeRentalContract,
  fetchContractById,
  listCustomerContracts,
  listMerchantContracts,
} from './queries/contracts';

export {
  fetchNoteById,
  fetchNoteByContractId,
  listCustomerNotes,
} from './queries/notes';

export {
  createDamageCase,
  fetchDamageCase,
  listAllDamageCases,
  listMerchantDamageCases,
  listCaseEvidence,
  uploadDamageEvidence,
  DAMAGE_EVIDENCE_BUCKET,
} from './queries/damages';
export type { CreateDamageCaseInput, UploadEvidenceInput } from './queries/damages';

export {
  SupabaseAuthProvider,
  useSupabaseAuth,
} from './SupabaseAuthProvider';

export {
  adaptContract,
  adaptContractToHistory,
  adaptContractToMerchantRental,
  adaptDamageCase,
  adaptEligibility,
  adaptInvoice,
  adaptMerchantApplication,
  adaptMerchantToStore,
  adaptNote,
  adaptUserRecord,
  synthesizePackageFromInvoice,
} from './adapters';
