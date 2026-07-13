// Rental Journey — the canonical 7-stage timeline that runs through every
// rental. Every place in the app that touches a rental (review, approval,
// tracking pages, merchant details) renders the same stages from the same
// source of truth. Adapters below derive the per-stage status + timestamp
// from whatever data the screen has on hand:
//
//   * from a live invoice alone           → only stages 1–2 are real
//   * from invoice + contract (+ note)    → stages 1–5+ are real
//   * from a merchant rental view-model   → all 7 are derivable
//
// Status semantics:
//   * 'completed' — the stage happened, `at` is the moment it did
//   * 'active'    — the rental is currently here
//   * 'pending'   — the stage hasn't been reached yet

import type {
  ContractStatusDB,
  InvoiceStatus,
  NoteStatus,
} from '@/lib/supabase';
import type {
  ContractStatus as UIContractStatus,
  MerchantRental,
} from '@/lib/data';

export type RentalStage =
  | 'request'      // 1. Merchant issued the invoice
  | 'review'       // 2. Customer is reviewing the package
  | 'agreement'    // 3. Contract + promissory note documented
  | 'started'      // 4. Rental period actually begins
  | 'tracking'     // 5. Active tracking — rental ongoing
  | 'return'       // 6. Return window — item being returned
  | 'closed';      // 7. Rental closed (clean or damage-settled)

/**
 * Simplified-journey stage keys (ENABLE_PAYMENTS_AND_NOTES = false):
 * the approved four-stage reference journey. 'closure' is the merged
 * "الإرجاع وإنهاء العقد" terminal stage; the other three reuse the
 * legacy keys (their labels already match the approved copy). Kept as
 * a separate union so the legacy 7-stage switches stay exhaustive.
 */
export type JourneyStageKey = RentalStage | 'closure';

export type StageStatus = 'pending' | 'active' | 'completed';

/**
 * Documentation seal attached to a stage when the underlying state
 * justifies it. Only completed stages can carry a badge — the badge is
 * the visible promise that the step is recorded and protected.
 */
export type StageBadge = 'documented' | 'signed' | 'verified' | 'attested';

export type JourneyStep = {
  stage: JourneyStageKey;
  status: StageStatus;
  /** ISO timestamp if the stage has a known moment; null otherwise. */
  at: string | null;
  /** Documentation seal — only meaningful when status === 'completed'. */
  badge?: StageBadge;
};

export const RENTAL_STAGES: RentalStage[] = [
  'request',
  'review',
  'agreement',
  'started',
  'tracking',
  'return',
  'closed',
];

// ---------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------

/**
 * Build a journey from just a live invoice (no contract yet).
 *   * Used by the Review screen while the customer is on stages 1–2.
 *   * Stage 1 is completed (the invoice exists).
 *   * Stage 2 is active until the customer accepts.
 *   * Everything else is pending.
 *
 * Pass `viewerIsReviewing` for the Review page to force stage 2 active even
 * before the invoice status flips to 'viewed'.
 */
export function deriveJourneyFromInvoice(
  invoice: { issued_at?: string | null; created_at?: string | null; status: InvoiceStatus },
  opts: { viewerIsReviewing?: boolean } = {},
): JourneyStep[] {
  const requestAt = invoice.issued_at ?? invoice.created_at ?? null;
  const accepted =
    invoice.status === 'accepted' ||
    invoice.status === 'cancelled' ||
    invoice.status === 'superseded' ||
    invoice.status === 'rejected';

  const reviewActive =
    !accepted && (opts.viewerIsReviewing || invoice.status === 'viewed' || invoice.status === 'issued');

  return RENTAL_STAGES.map((stage): JourneyStep => {
    switch (stage) {
      case 'request':
        return { stage, status: 'completed', at: requestAt, badge: 'documented' };
      case 'review':
        return {
          stage,
          status: accepted ? 'completed' : reviewActive ? 'active' : 'pending',
          at: null,
        };
      default:
        return { stage, status: 'pending', at: null };
    }
  });
}

/**
 * Build a journey from a contract (+ its invoice and optional note).
 * This is the canonical case for tracking pages and merchant rental
 * details once a contract exists.
 */
export function deriveJourneyFromContract(
  invoice: { issued_at?: string | null; created_at?: string | null },
  contract: {
    status: ContractStatusDB;
    start_date: string;
    end_date: string;
    signed_at: string | null;
    ended_at: string | null;
  },
  note?: { signed_at?: string | null; settled_at?: string | null; status?: NoteStatus } | null,
): JourneyStep[] {
  const requestAt = invoice.issued_at ?? invoice.created_at ?? null;
  const signedAt = contract.signed_at;
  const today = new Date();
  const startDate = new Date(contract.start_date);
  const endDate = new Date(contract.end_date);

  const closed = contract.status === 'ended' || contract.status === 'cancelled';
  const inReturnWindow =
    !closed &&
    contract.status === 'active' &&
    today.getTime() >= endDate.getTime() - 5 * 86_400_000; // last 5 days of period
  const started = contract.status !== 'pending' && today.getTime() >= startDate.getTime();
  const tracking = started && !inReturnWindow && !closed;

  return RENTAL_STAGES.map((stage): JourneyStep => {
    switch (stage) {
      case 'request':
        return { stage, status: 'completed', at: requestAt, badge: 'documented' };
      case 'review':
        // If a contract exists, review was already done.
        return { stage, status: 'completed', at: signedAt, badge: 'verified' };
      case 'agreement':
        return {
          stage,
          status: signedAt ? 'completed' : 'active',
          at: signedAt ?? note?.signed_at ?? null,
          badge: signedAt ? 'signed' : undefined,
        };
      case 'started':
        return {
          stage,
          status: started ? 'completed' : signedAt ? 'active' : 'pending',
          at: started ? contract.start_date : null,
          badge: started ? 'documented' : undefined,
        };
      case 'tracking':
        return {
          stage,
          status: tracking ? 'active' : started ? 'completed' : 'pending',
          at: null,
        };
      case 'return':
        return {
          stage,
          status: closed ? 'completed' : inReturnWindow ? 'active' : 'pending',
          at: closed ? contract.ended_at ?? contract.end_date : null,
          badge: closed ? 'documented' : undefined,
        };
      case 'closed':
        return {
          stage,
          status: closed ? 'completed' : 'pending',
          at: closed ? contract.ended_at ?? null : null,
          badge: closed
            ? note?.status === 'settled'
              ? 'attested'
              : 'documented'
            : undefined,
        };
    }
  });
}

/**
 * Demo-mode fallback. The customer-side demo store has invoices/contracts/
 * notes in the same UI shape but no DB-level lifecycle; the merchant-side
 * demo store has MerchantRental rows with a `status` enum. Map both onto
 * the same journey shape so the demo experience is consistent with the
 * real one.
 */
export function deriveJourneyFromUIContract(
  contract: {
    startDate: string;
    endDate: string;
    status: UIContractStatus;
  },
  invoice?: { issuedAt?: string | null } | null,
  note?: { status?: 'signed' | 'pending' | 'defaulted' } | null,
): JourneyStep[] {
  const requestAt = invoice?.issuedAt ?? null;
  const today = new Date();
  const start = new Date(contract.startDate);
  const end = new Date(contract.endDate);
  const closed = contract.status === 'ended';
  const started = contract.status !== 'pending' && today.getTime() >= start.getTime();
  const inReturnWindow =
    !closed && contract.status === 'active' && today.getTime() >= end.getTime() - 5 * 86_400_000;
  const documented = contract.status !== 'pending' || note?.status === 'signed';

  return RENTAL_STAGES.map((stage): JourneyStep => {
    switch (stage) {
      case 'request':
        return { stage, status: 'completed', at: requestAt, badge: 'documented' };
      case 'review':
        return {
          stage,
          status: documented ? 'completed' : 'active',
          at: null,
          badge: documented ? 'verified' : undefined,
        };
      case 'agreement':
        return {
          stage,
          status: documented ? 'completed' : 'pending',
          at: documented ? contract.startDate : null,
          badge: documented ? 'signed' : undefined,
        };
      case 'started':
        return {
          stage,
          status: started ? 'completed' : documented ? 'active' : 'pending',
          at: started ? contract.startDate : null,
          badge: started ? 'documented' : undefined,
        };
      case 'tracking':
        return {
          stage,
          status: closed
            ? 'completed'
            : inReturnWindow
              ? 'completed'
              : started
                ? 'active'
                : 'pending',
          at: null,
        };
      case 'return':
        return {
          stage,
          status: closed ? 'completed' : inReturnWindow ? 'active' : 'pending',
          at: closed ? contract.endDate : null,
          badge: closed ? 'documented' : undefined,
        };
      case 'closed':
        return {
          stage,
          status: closed ? 'completed' : 'pending',
          at: closed ? contract.endDate : null,
          badge: closed
            ? note?.status === 'signed'
              ? 'attested'
              : 'documented'
            : undefined,
        };
    }
  });
}

/**
 * Build a journey from a merchant-side rental view (operational shape).
 * Closure flags + status string drive everything.
 */
export function deriveJourneyFromMerchantRental(rental: MerchantRental): JourneyStep[] {
  const closed = rental.status === 'returned' || rental.closureStatus === 'closed';
  const inReturnWindow =
    !closed && (rental.status === 'due-soon' || rental.status === 'overdue');
  const tracking = !closed && rental.status === 'active';
  const documented = rental.customerApproved;

  return RENTAL_STAGES.map((stage): JourneyStep => {
    switch (stage) {
      case 'request':
        return { stage, status: 'completed', at: rental.startDate, badge: 'documented' };
      case 'review':
        return {
          stage,
          status: documented ? 'completed' : 'active',
          at: null,
          badge: documented ? 'verified' : undefined,
        };
      case 'agreement':
        return {
          stage,
          status: documented ? 'completed' : 'pending',
          at: documented ? rental.startDate : null,
          badge: documented ? 'signed' : undefined,
        };
      case 'started':
        return {
          stage,
          status: documented ? 'completed' : 'pending',
          at: documented ? rental.startDate : null,
          badge: documented ? 'documented' : undefined,
        };
      case 'tracking':
        return {
          stage,
          status: tracking ? 'active' : documented && !closed ? 'completed' : 'pending',
          at: null,
        };
      case 'return':
        return {
          stage,
          status: closed ? 'completed' : inReturnWindow ? 'active' : 'pending',
          at: closed ? rental.closedAt ?? rental.endDate : null,
          badge: closed ? 'documented' : undefined,
        };
      case 'closed':
        return {
          stage,
          status: closed ? 'completed' : 'pending',
          at: closed ? rental.closedAt ?? null : null,
          badge: closed ? 'attested' : undefined,
        };
    }
  });
}

/**
 * Build a journey for the Approval screen, given the scanned package +
 * an optional acceptance timestamp (the moment the customer just hit
 * Approve). Stages 1–3 are completed, 4 is active.
 */
export function deriveJourneyOnApproval(
  pkg: { issuedAt: string },
  approvedAt: string | null,
): JourneyStep[] {
  return RENTAL_STAGES.map((stage): JourneyStep => {
    switch (stage) {
      case 'request':
        return { stage, status: 'completed', at: pkg.issuedAt, badge: 'documented' };
      case 'review':
        return { stage, status: 'completed', at: approvedAt, badge: 'verified' };
      case 'agreement':
        return { stage, status: 'completed', at: approvedAt, badge: 'signed' };
      case 'started':
        return { stage, status: 'active', at: approvedAt };
      case 'tracking':
      case 'return':
      case 'closed':
        return { stage, status: 'pending', at: null };
    }
  });
}

// =====================================================================
// Simplified 4-stage journey — the approved reference journey for the
// current phase (ENABLE_PAYMENTS_AND_NOTES = false):
//
//   1. request  — إصدار العرض والعقد   / Offer and contract issued
//   2. review   — مراجعة العميل        / Customer review
//   3. started  — بدء الإيجار          / Rental started
//   4. closure  — الإرجاع وإنهاء العقد / Return and contract closure
//
// Every customer/merchant journey surface renders THESE four stages
// from this single derivation. Operational chips (due soon, overdue,
// damage) stay on cards where needed but never add main stages. The
// legacy 7-stage derivations above are preserved for flag restoration.
// =====================================================================

export const SIMPLE_STAGES: JourneyStageKey[] = [
  'request',
  'review',
  'started',
  'closure',
];

export type SimpleJourneyCurrent = 'review' | 'started' | 'closed';

/**
 * Build the four-step journey from the current macro state:
 *   'review'  — offer issued, awaiting/undergoing customer review
 *               (invoice issued/viewed, or contract still pending)
 *   'started' — contract active
 *   'closed'  — ended / cancelled / returned / damage-closed
 */
export function deriveSimpleJourney(input: {
  current: SimpleJourneyCurrent;
  requestAt?: string | null;
  startedAt?: string | null;
  closedAt?: string | null;
}): JourneyStep[] {
  const idx = input.current === 'review' ? 1 : input.current === 'started' ? 2 : 3;
  const closed = input.current === 'closed';
  return SIMPLE_STAGES.map((stage, i): JourneyStep => {
    if (i < idx) {
      return {
        stage,
        status: 'completed',
        at:
          stage === 'request'
            ? input.requestAt ?? null
            : stage === 'started'
              ? input.startedAt ?? null
              : null,
      };
    }
    if (i === idx) {
      return {
        stage,
        status: closed ? 'completed' : 'active',
        at: closed
          ? input.closedAt ?? null
          : stage === 'started'
            ? input.startedAt ?? null
            : null,
      };
    }
    return { stage, status: 'pending', at: null };
  });
}

/** Map a UI contract status to the simple journey's current state. */
export function simpleCurrentFromUIContract(
  status: UIContractStatus,
): SimpleJourneyCurrent {
  if (status === 'ended') return 'closed';
  if (status === 'active') return 'started';
  return 'review';
}
