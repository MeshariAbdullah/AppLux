#!/usr/bin/env bash
# =====================================================================
# Supabase environment guard — refuse to touch the wrong project.
# =====================================================================
# The production Supabase project is named "lend-staging" and the
# staging project "lend-test", so names actively mislead. This guard
# trusts only project REFS, pinned in supabase/environments.json.
#
# Usage:
#   scripts/supabase-guard.sh staging                 # assert link only
#   scripts/supabase-guard.sh staging db-push         # guarded migrate
#   scripts/supabase-guard.sh staging functions-deploy [name ...]
#
# `production` is accepted for the assert-only form (useful in future
# runbooks) but this script REFUSES to run db-push/functions-deploy
# against production — production changes stay manual and deliberate.
#
# How the linked ref is read: `supabase link --project-ref <ref>`
# records the ref in supabase/.temp/project-ref. No link → guard fails.
# =====================================================================
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$here/supabase/environments.json"
ref_file="$here/supabase/.temp/project-ref"

target="${1:-}"
action="${2:-check}"
shift 2 2>/dev/null || shift $# || true

die() { echo "GUARD: $*" >&2; exit 1; }

[[ "$target" == "staging" || "$target" == "production" ]] \
  || die "usage: supabase-guard.sh <staging|production> [check|db-push|functions-deploy]"

command -v node >/dev/null || die "node is required (used to parse environments.json)"
[[ -f "$env_file" ]] || die "missing $env_file"

expected="$(node -e "
  const e = require('$env_file');
  process.stdout.write((e['$target'] && e['$target'].project_ref) || '');
")"
other="$(node -e "
  const e = require('$env_file');
  const o = '$target' === 'staging' ? 'production' : 'staging';
  process.stdout.write((e[o] && e[o].project_ref) || '');
")"

[[ -n "$expected" && "$expected" != FILL_ME_* ]] \
  || die "supabase/environments.json has no real project_ref for '$target' — fill it in first"

[[ -f "$ref_file" ]] \
  || die "no linked project (supabase/.temp/project-ref missing). Run: supabase link --project-ref $expected"

linked="$(tr -d '[:space:]' < "$ref_file")"

[[ "$linked" == "$expected" ]] \
  || die "linked project '$linked' is NOT the $target ref '$expected'. Re-link before doing anything: supabase link --project-ref $expected"

if [[ -n "$other" && "$other" != FILL_ME_* && "$linked" == "$other" ]]; then
  die "linked project is the OTHER environment's ref — refusing."
fi

echo "GUARD OK: linked project $linked == $target ($(node -e "
  const e = require('$env_file'); process.stdout.write(e['$target'].project_name);
"))"

case "$action" in
  check)
    ;;
  db-push)
    [[ "$target" == "staging" ]] \
      || die "db-push through this script is STAGING-ONLY. Production migrations stay manual (SQL Editor, reviewed)."
    echo "Running: supabase db push --linked  (applies pending files from supabase/migrations/)"
    supabase db push --linked
    ;;
  functions-deploy)
    [[ "$target" == "staging" ]] \
      || die "functions-deploy through this script is STAGING-ONLY."
    fns=("$@")
    if [[ ${#fns[@]} -eq 0 ]]; then
      fns=(otp-send registration-otp-send registration-otp-verify push-dispatch merchant-doc-upload merchant-doc-cleanup)
    fi
    for fn in "${fns[@]}"; do
      echo "Deploying Edge Function: $fn"
      # config.toml carries the per-function verify_jwt settings.
      supabase functions deploy "$fn" --project-ref "$expected"
    done
    ;;
  *)
    die "unknown action '$action' (check|db-push|functions-deploy)"
    ;;
esac
