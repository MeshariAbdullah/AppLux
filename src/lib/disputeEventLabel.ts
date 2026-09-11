// =====================================================================
// Dispute timeline / description localization guards.
//
// t() returns the KEY ITSELF when a translation is missing in both
// languages — which put raw strings like
// "merchant.disputes.events.customer_response_deadline_set" on real
// devices. Every timeline render goes through disputeEventLabel so an
// unmapped event type degrades to friendly neutral copy, never a key.
// =====================================================================

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/** Localized label for a dispute_events row; unknown/unmapped types
 *  render the neutral fallback («تحديث على الحالة» / "Case update"). */
export function disputeEventLabel(t: TranslateFn, eventType: string): string {
  const key = `merchant.disputes.events.${eventType}`;
  const label = t(key);
  return label === key ? t('merchant.disputes.events.unknown') : label;
}

// Historical damage cases stored the untranslated default description
// verbatim ("Damage report for CN-2026-100043"). The data stays as-is
// (never rewritten); display maps that exact legacy pattern to the
// localized copy, keeping the contract reference untouched.
const LEGACY_DEFAULT_DESCRIPTION = /^Damage report for (\S+)$/;

/** Case description for display: legacy English default → localized,
 *  anything else verbatim. */
export function caseDescriptionDisplay(t: TranslateFn, description: string): string {
  const m = LEGACY_DEFAULT_DESCRIPTION.exec(description.trim());
  return m ? t('merchant.damage.new.defaultDescription', { contract: m[1] }) : description;
}
