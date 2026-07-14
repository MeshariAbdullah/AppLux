# Merchant separation — legacy compatibility branches

The separate merchant registration architecture (M1 `2a9018a`, M2
`db05fe0`, M3) keeps the pre-separation "signed-in customer applies"
generation working **until the pending queue drains**. This file lists
every compatibility branch so they can be removed deliberately later.

## What counts as a legacy application
`merchant_applications` rows whose `applicant_user_id` profile still
has `role='customer'` — created by the old flow before M2. New-flow
rows always belong to `role='merchant'` accounts. Drain check:

```sql
select count(*) as legacy_pending
from public.merchant_applications a
join public.profiles p on p.id = a.applicant_user_id
where a.status = 'pending' and p.role = 'customer';
```

## Compatibility branches (remove after the count above reaches 0)

| Where | Branch | Removal note |
| --- | --- | --- |
| `approve_merchant_application` (migration `122700`) | `update profiles set role='merchant' … where role <> 'admin'` lifts **customer** applicants | Keep the account_status activation; the role lift becomes a no-op for new-gen applicants and can stay harmlessly, or be tightened to `role='merchant'`-only in a later migration. |
| `MerchantLogin` post-auth effect | `role==='customer'` + existing application → `/merchant/pending` (instead of the wrong-account-type sign-out) | Replace the whole customer branch with the sign-out + message once no legacy applicants remain. |
| `/merchant/pending` route guard (`routes.tsx`) | allows `['customer','merchant']` | Tighten to `'merchant'` only. |
| `MerchantPending` | renders for customer-role visitors with an application (legacy view) | The customer path collapses once the guard is tightened. |
| `provision_merchant_from_application` (migration `120300`) | superseded by `approve_merchant_application`; retained for rollback | Revoke EXECUTE or drop in a cleanup migration. |
| Demo store `MerchantStatus` enum (`pending/approved/rejected`) | demo-only vocabulary distinct from DB `merchant_status` | Cosmetic; unify whenever the demo store is next reworked. |

## Not legacy (do not remove)
- `merchant_applications` self-insert RLS policy: no longer used by the
  UI (the trigger writes applications), but harmless and still guarded
  by `applicant_user_id = auth.uid()` + the one-pending-per-user index.
  Optional tightening later.
- `Login`'s `state.from` return-path support: generic, kept.
