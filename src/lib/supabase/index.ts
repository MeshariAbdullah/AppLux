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
  ContractReceiptPhotoRow,
  DamageCaseRow,
  DamageEvidenceInsert,
  DamageEvidenceRow,
  DamageSeverity,
  DamageStage,
  DamageStatus,
  DisputeEventRow,
  DisputeOutcome,
  DisputeParty,
  DisputePhase,
  DisputeProposalResponseRow,
  DisputeProposalRow,
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
  MerchantDocumentRow,
  MerchantActivityRow,
  MerchantBranchRow,
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
  verifyEmailOtp,
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
  requestAccountDeletion,
  updateProfile,
} from './queries/profile';
export {
  fetchEligibility,
  fetchEligibilityByUserIds,
  fetchMyEligibilityBreakdown,
  fetchRenterEligibility,
  upsertEligibility,
} from './queries/eligibility';
export type { UpsertEligibilityInput } from './queries/eligibility';
export {
  listMerchants,
  fetchMerchant,
  fetchMerchantsByIds,
  fetchMyMerchant,
  fetchBranchById,
  listMerchantBranches,
  listMerchantActivities,
  listActivitiesForMerchants,
  checkUnifiedNumberAvailable,
  checkEmailAvailable,
  checkUploadReceiptValid,
  checkUploadReceiptStatus,
} from './queries/merchants';
export type { ReceiptStatus } from './queries/merchants';
export {
  listApplicationDocuments,
  getMerchantDocumentSignedUrl,
} from './queries/merchantDocuments';
export type { BranchInfo, ListMerchantsFilter } from './queries/merchants';
export {
  submitMerchantApplication,
  listMerchantApplications,
  listMerchantApplicationsPage,
  countMerchantApplicationsByStatus,
  fetchMerchantApplication,
  decideMerchantApplication,
  provisionMerchantFromApplication,
  listApplicationBranches,
  listApplicationActivities,
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
  listInvoiceItemsByInvoiceIds,
  listMerchantInvoices,
  recordNafathSigning,
  recordRentalPayment,
  rejectRentalInvoice,
  verifyAndActivateRental,
} from './queries/invoices';
export type { CreateInvoiceInput, CreatedInvoice } from './queries/invoices';

export {
  closeRentalContract,
  fetchContractById,
  fetchContractByInvoiceId,
  fetchContractsByIds,
  getHandoverPhotoUrl,
  HANDOVER_BUCKET,
  HANDOVER_PREFIX,
  listCustomerContracts,
  listMerchantContracts,
  uploadAndRecordHandover,
} from './queries/contracts';

export {
  listMyNotifications,
  markNotificationRead,
} from './queries/notifications';
export type { EligibilityBreakdown, NotificationRow, NotificationType } from './types';

export {
  confirmContractReceiptPhotos,
  getReceiptPhotoUrl,
  listContractReceiptPhotos,
  RECEIPT_MAX_PHOTOS,
  RECEIPT_MIN_PHOTOS,
  removeContractReceiptPhoto,
  uploadContractReceiptPhoto,
} from './queries/receipts';

export {
  fetchNoteById,
  fetchNoteByContractId,
  listCustomerNotes,
} from './queries/notes';

export {
  createDamageCase,
  fetchContractDamageCase,
  listAllDamageCases,
  listMerchantDamageCases,
  listCaseEvidence,
  uploadDamageEvidence,
  DAMAGE_EVIDENCE_BUCKET,
} from './queries/damages';
export type { CreateDamageCaseInput, UploadEvidenceInput } from './queries/damages';

export {
  fetchDisputeCase,
  listDisputeProposals,
  listDisputeEvents,
  listDisputeEvidence,
  customerAcceptClaim,
  customerObjectToClaim,
  submitSettlementProposal,
  respondToSettlementProposal,
  respondToLendProposal,
  lendSubmitMediationProposal,
  adminDismissDisputeCase,
} from './queries/disputes';
export type {
  DisputeEvidenceItem,
  DisputeProposalWithResponses,
} from './queries/disputes';

export {
  SupabaseAuthProvider,
  useSupabaseAuth,
} from './SupabaseAuthProvider';

export {
  adaptContract,
  adaptContractToHistory,
  adaptContractToMerchantRental,
  adaptEligibility,
  adaptInvoice,
  adaptMerchantApplication,
  adaptMerchantToStore,
  adaptNote,
  adaptUserRecord,
  synthesizePackageFromInvoice,
} from './adapters';
