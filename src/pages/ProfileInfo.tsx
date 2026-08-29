import { Header, Screen } from '@/components/layout';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';

// =====================================================================
// Personal information — customer-only READ-ONLY screen behind the
// بياناتي الشخصية row on /profile (approved product decision).
//
// Rules:
//   * display only — no editing, no save/update actions, no writes;
//   * real authenticated profile data (demo store session in demo
//     mode) — never internal UUIDs;
//   * NO National ID — it is contract data (per rental agreement),
//     not account identity, and is never part of the profile;
//   * mobile shown as the canonical +966 5XXXXXXXX in an LTR span;
//   * any missing field renders the neutral "غير متوفر" state.
// =====================================================================

export default function ProfileInfo() {
  const t = useT();
  const { dir } = useI18n();
  const { session: demoSession } = useStore();
  const { configured, profile } = useSupabaseAuth();

  const fullName = configured ? profile?.full_name : demoSession?.fullName;
  const mobile = configured ? profile?.mobile : demoSession?.mobile;
  const email = configured ? profile?.email : demoSession?.email;

  const missing = t('profile.info.missing');

  // National ID is deliberately NOT shown here: it is contract data
  // (recorded per rental agreement), not account/profile identity.
  // Each contract's record shows the ID that contract was accepted
  // with.

  // Canonical storage is 5XXXXXXXX — display the full international
  // form. Anything non-canonical (legacy data) is shown as stored.
  const displayMobile = mobile?.trim()
    ? /^5\d{8}$/.test(mobile.trim())
      ? `+966 ${mobile.trim()}`
      : mobile.trim()
    : null;

  const rows: { label: string; value: string | null; ltr?: boolean }[] = [
    { label: t('profile.info.fullName'), value: fullName?.trim() || null },
    { label: t('profile.info.mobile'), value: displayMobile, ltr: true },
    { label: t('profile.info.email'), value: email?.trim() || null, ltr: true },
  ];

  return (
    <>
      <Header title={t('profile.info.title')} showBack />
      <Screen className="bg-canvas">
        <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px]">
          {rows.map((row, i) => (
            <div key={row.label}>
              {i > 0 && <div className="h-px bg-beige-100" />}
              <div className="py-3.5 flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-ink-500 shrink-0">
                  {row.label}
                </span>
                <span
                  className="min-w-0 truncate text-[13.5px] font-semibold text-ink-900 num"
                  dir={row.value && row.ltr ? 'ltr' : dir}
                >
                  {row.value ?? (
                    <span className="font-normal text-ink-400">{missing}</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Screen>
    </>
  );
}
