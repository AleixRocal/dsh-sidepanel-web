#!/usr/bin/env bash
# Show, apply or remove the branch protection ruleset for `main`.
#
# The ruleset itself lives in .github/branch-protection.json so the policy is
# reviewed like code; this script is the only thing that talks to the API.
#
#   ./scripts/protect-main.sh show      # read-only: what is enforced on main now
#   ./scripts/protect-main.sh apply     # create or update the ruleset, then verify it
#   ./scripts/protect-main.sh remove    # delete the ruleset (unprotect main)
#
# Needs the GitHub CLI with admin rights on the repository (`repo` scope).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
payload="$root/.github/branch-protection.json"

usage() {
  echo "usage: $0 [show|apply|remove]" >&2
  exit 2
}

if [ ! -f "$payload" ]; then
  echo "missing ruleset payload: $payload" >&2
  exit 1
fi

if ! ruleset_name="$(node -p "require('$payload').name" 2>/dev/null)"; then
  echo "cannot parse $payload: expected a JSON ruleset with a name" >&2
  exit 1
fi

if [ -n "${GH_REPO:-}" ]; then
  repo="$GH_REPO"
elif repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)"; then
  :
else
  echo "cannot resolve the repository: set GH_REPO=owner/name, or run this" >&2
  echo "inside a checkout whose origin is a GitHub repository" >&2
  exit 1
fi

ruleset_id() {
  gh api "repos/$repo/rulesets" \
    --jq ".[] | select(.name == \"$ruleset_name\") | .id" | head -n 1
}

# Rules currently enforced on main, one per line. Fails loudly: the caller must
# not confuse "cannot read" with "nothing is enforced".
enforced_rules() {
  gh api "repos/$repo/rules/branches/main" --jq '.[].type'
}

# Compare the live ruleset with the payload, field by field for the parameters
# the payload sets. Comparing only rule types would hide a wrong approval count,
# a wrong check context or a wrong bypass actor.
verify_ruleset() {
  PAYLOAD="$payload" REPO="$repo" RULESET_ID="$1" node --input-type=module <<'NODE'
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const payload = JSON.parse(readFileSync(process.env.PAYLOAD, "utf8"));
const live = JSON.parse(
  execFileSync("gh", ["api", `repos/${process.env.REPO}/rulesets/${process.env.RULESET_ID}`], {
    encoding: "utf8",
  }),
);

const problems = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const contexts = (checks) => (checks ?? []).map((check) => check.context).sort();

for (const key of ["enforcement", "target"]) {
  if (!same(live[key], payload[key])) {
    problems.push(`${key}: ${JSON.stringify(live[key])} != ${JSON.stringify(payload[key])}`);
  }
}

const wantRefs = payload.conditions?.ref_name?.include ?? [];
const liveRefs = live.conditions?.ref_name?.include ?? [];
if (!same([...liveRefs].sort(), [...wantRefs].sort())) {
  problems.push(`conditions.ref_name.include: ${JSON.stringify(liveRefs)} != ${JSON.stringify(wantRefs)}`);
}

for (const rule of payload.rules) {
  const found = (live.rules ?? []).find((candidate) => candidate.type === rule.type);
  if (!found) {
    problems.push(`rule missing: ${rule.type}`);
    continue;
  }
  for (const [key, want] of Object.entries(rule.parameters ?? {})) {
    if (key === "required_status_checks") {
      const got = contexts(found.parameters?.[key]);
      const expected = contexts(want);
      if (!same(got, expected)) {
        problems.push(`${rule.type}.${key}: ${JSON.stringify(got)} != ${JSON.stringify(expected)}`);
      }
    } else if (!same(found.parameters?.[key], want)) {
      problems.push(`${rule.type}.${key}: ${JSON.stringify(found.parameters?.[key])} != ${JSON.stringify(want)}`);
    }
  }
}

for (const actor of payload.bypass_actors ?? []) {
  const found = (live.bypass_actors ?? []).some(
    (candidate) =>
      candidate.actor_id === actor.actor_id &&
      candidate.actor_type === actor.actor_type &&
      candidate.bypass_mode === actor.bypass_mode,
  );
  if (!found) {
    problems.push(`bypass actor missing: ${actor.actor_type} ${actor.actor_id} (${actor.bypass_mode})`);
  }
}

if (problems.length > 0) {
  console.error("ruleset verification failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `verified ${payload.rules.length} rules and ${(payload.bypass_actors ?? []).length} bypass actor(s) against the API`,
);
NODE
}

print_state() {
  echo "repository: $repo"
  echo "ruleset:    $ruleset_name"
  echo
  local rules
  if ! rules="$(enforced_rules 2>&1)"; then
    echo "cannot read the rules for main on $repo:" >&2
    printf '%s\n' "$rules" >&2
    return 2
  fi
  if [ -z "$rules" ]; then
    echo "main is NOT protected: no rules apply to it." >&2
    return 1
  fi
  echo "rules enforced on main:"
  printf '  - %s\n' $rules
}

case "${1:-show}" in
  show)
    print_state
    ;;

  apply)
    id="$(ruleset_id)"
    if [ -n "$id" ]; then
      gh api --method PUT "repos/$repo/rulesets/$id" --input "$payload" >/dev/null
      echo "updated ruleset #$id ($ruleset_name) on $repo"
    else
      gh api --method POST "repos/$repo/rulesets" --input "$payload" >/dev/null
      id="$(ruleset_id)"
      echo "created ruleset #$id ($ruleset_name) on $repo"
    fi
    if [ -z "$id" ]; then
      echo "the API accepted the ruleset but it cannot be found afterwards" >&2
      exit 1
    fi
    verify_ruleset "$id"
    print_state
    ;;

  remove)
    id="$(ruleset_id)"
    if [ -z "$id" ]; then
      echo "no ruleset named '$ruleset_name' on $repo" >&2
      exit 0
    fi
    gh api --method DELETE "repos/$repo/rulesets/$id"
    echo "deleted ruleset #$id ($ruleset_name)"
    if remaining="$(enforced_rules 2>/dev/null)" && [ -n "$remaining" ]; then
      echo "warning: main is still covered by other rules:" >&2
      printf '  - %s\n' $remaining >&2
      exit 1
    fi
    echo "no rules apply to main now"
    ;;

  *)
    usage
    ;;
esac
