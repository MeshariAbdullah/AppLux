// Supabase entry point — single import surface for the rest of the app.
//
// Usage:
//   import { useSupabaseAuth, listMerchants } from '@/lib/supabase';
//
// All exports are tree-shakeable; importing one helper does not pull
// in the others.

export {
  demoMode,
  getSupabase,
  isDemoMode,
  requireSupabase,
  supabaseConfigured,
} from './client';
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
  signUpMerchant,
  resendSignupConfirmation,
  signInWithPassword,
  signOut,
  getCurrentSession,
  sendPasswordResetEmail,
  updatePassword,
} from './auth';

export type {
  SignInInput,
  SignUpInput,
  MerchantSignUpInput,
  MerchantSignUpBranch,
} from './auth';

export {
  cancelAccountDeletion,
  fetchProfile,
  fetchProfileByMobile,
  fetchProfilesByIds,
  listProfiles,
  merchantSetCustomerNationalId,
  requestAccountDeletion,
  updateProfile,
} from './queries/profile';
export {
  fetchEligibility,
  fetchEligibilityByUserIds,
  fetchRenterEligibility,
  upsertEligibility,
} from './queries/eligibility';
export type { UpsertEligibilityInput } from './queries/eligibility';
export {
  listMerchants,
  fetchMerchant,
  fetchMerchantsByIds,
  fetchMyMerchant,
  listMerchantBranches,
} from './queries/merchants';
export type { ListMerchantsFilter } from './queries/merchants';
export {
  submitMerchantApplication,
  listMerchantApplications,
  listMerchantApplicationsPage,
  countMerchantApplicationsByStatus,
  fetchMerchantApplication,
  decideMerchantApplication,
  provisionMerchantFromApplication,
  listApplicationBranches,
  approveMerchantApplication,
} from './queries/merchant-applications';
export type {
  MerchantApplicationPage,
  MerchantApplicationBranchRow,
} from './queries/merchant-applications';

export {
  acceptRentalInvoice,
  activateRentalWithoutPaymentAndNote,
  createInvoiceWithItems,
  fetchInvoiceByContractId,
  fetchInvoiceById,
  fetchInvoiceByToken,
  listCustomerInvoices,
  listInvoiceItems,
  listMerchantInvoices,
  recordNafathSigning,
  recordRentalPayment,
  verifyAndActivateRental,
} from './queries/invoices';
export type { CreateInvoiceInput, CreatedInvoice } from './queries/invoices';

export {
  closeRentalContract,
  fetchContractById,
  getHandoverPhotoUrl,
  HANDOVER_BUCKET,
  HANDOVER_PREFIX,
  listCustomerContracts,
  listMerchantContracts,
  uploadAndRecordHandover,
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
