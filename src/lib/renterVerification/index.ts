// =====================================================================
// Interim renter-presence verification.
//
// Until the Twilio Verify edge functions (otp-send / otp-verify) are
// deployed, the merchant rental session uses this lighter check:
//
//   1. lookup_renter_by_mobile RPC confirms a renter exists with the
//      typed canonical mobile (existence-only — see src/lib/otp).
//   2. The merchant asks the renter for the last 4 digits of their
//      National ID (the merchant has the physical ID in hand for KYC
//      anyway).
//   3. confirm_renter_presence RPC matches both server-side and only
//      then returns the renter's safe profile fields.
//
// Once the edge functions are deployed, swap the call site in
// MerchantRentalSession from confirmRenterPresence back to
// sendOtp / verifyOtp from `@/lib/otp`. The OTP module is preserved
// as-is for that future switch.
// =====================================================================

import { requireSupabase } from '@/lib/supabase';
import { classifyMobile } from '@/lib/mobile';

export type VerifiedRenter = {
  id: string;
  full_name: string;
  mobile: string | null;
  city: string | null;
  has_nafath: boolean;
};

export type PresenceCheckResult =
  | { verified: true; renter: VerifiedRenter }
  | { verified: false };

export class RenterPresenceError extends Error {
  constructor(
    public code:
      | 'invalid_mobile'
      | 'invalid_id_last4'
      | 'forbidden'
      | 'unauthorized'
      | 'unknown',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RenterPresenceError';
  }
}

/**
 * Confirms the renter's presence by combined mobile + ID-last-4 match.
 * Returns `{verified: true, renter}` when the RPC finds a match; the
 * renter fields here are authoritative — set the verify state from this
 * payload, not the lookup snapshot.
 */
export async function confirmRenterPresence(
  mobileInput: string,
  idLast4Input: string,
): Promise<PresenceCheckResult> {
  const classification = classifyMobile(mobileInput);
  if (classification.kind !== 'valid') {
    throw new RenterPresenceError('invalid_mobile');
  }
  const last4 = idLast4Input.replace(/\D/g, '');
  if (!/^[0-9]{4}$/.test(last4)) {
    throw new RenterPresenceError('invalid_id_last4');
  }

  const sb = requireSupabase();
  const { data, error } = await sb.rpc('confirm_renter_presence', {
    p_mobile: classification.canonical,
    p_id_last4: last4,
  });
  if (error) {
    // Surface authorization failures distinctly so the UI can show a
    // tailored message — everything else collapses to 'unknown'.
    const code = error.code;
    if (code === 'P0030') throw new RenterPresenceError('forbidden', error.message);
    if (code === '42501') throw new RenterPresenceError('unauthorized', error.message);
    throw new RenterPresenceError('unknown', error.message);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { verified: false };
  return {
    verified: true,
    renter: {
      id: row.id,
      full_name: row.full_name,
      mobile: row.mobile,
      city: row.city,
      has_nafath: row.has_nafath,
    },
  };
}
