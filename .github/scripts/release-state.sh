#!/usr/bin/env bash
set -euo pipefail

# Called immediately before each publishing operation.
mode="$1"
git fetch --force --prune --prune-tags origin '+refs/tags/*:refs/tags/*'
releases=$(gh api --paginate --slurp "repos/$GITHUB_REPOSITORY/releases?per_page=100" | jq -c 'add // []')
release=$(jq -c --arg tag "$RELEASE_TAG" '[.[] | select(.tag_name == $tag)]' <<< "$releases")
drafts=$(jq -c '[.[] | select(.draft)]' <<< "$releases")
count=$(jq 'length' <<< "$release")
[[ "$count" -le 1 ]] || { echo 'Multiple releases use the target tag' >&2; exit 1; }
if [[ "$count" == 1 ]]; then
  entry=$(jq -c '.[0]' <<< "$release")
  id=$(jq -r '.id' <<< "$entry")
  draft=$(jq -r '.draft' <<< "$entry")
  if [[ "$draft" == true ]]; then
    jq -e --arg sha "$COMMIT_SHA" --arg title "$RELEASE_TAG (run $GITHUB_RUN_ID)" '.target_commitish == $sha and .name == $title' <<< "$entry" >/dev/null || { echo 'Draft belongs to another run or commit' >&2; exit 1; }
  elif [[ "$mode" != publish || -z "${RELEASE_ID:-}" || "$id" != "$RELEASE_ID" ]]; then
    echo 'Target release is already published' >&2; exit 1
  fi
  if [[ -n "${RELEASE_ID:-}" && "$id" != "$RELEASE_ID" ]]; then echo 'Unexpected release ID' >&2; exit 1; fi
else
  [[ "$mode" == prepare ]] || { echo 'Expected release is missing' >&2; exit 1; }
  id=''
  draft=''
fi
jq -e --arg id "$id" 'all(.[]; (.id | tostring) == $id)' <<< "$drafts" >/dev/null || { echo 'Another draft release exists' >&2; exit 1; }
tags=$(git tag --sort=-version:refname | grep -E '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' || true)
if git show-ref --verify --quiet "refs/tags/$RELEASE_TAG"; then
  [[ -n "$id" ]] || { echo 'Target tag exists without this release' >&2; exit 1; }
  [[ "$(git rev-parse "refs/tags/$RELEASE_TAG^{commit}")" == "$COMMIT_SHA" ]] || { echo 'Target tag points to another commit' >&2; exit 1; }
  tags=$(printf '%s\n' "$tags" | grep -Fxv "$RELEASE_TAG" || true)
elif [[ "$draft" == false ]]; then
  echo 'Published release tag is missing' >&2; exit 1
fi
latest=$(printf '%s\n' "$tags" | head -n 1)
if [[ "$FIRST_RELEASE" == true ]]; then
  [[ -z "$latest" ]] || { echo 'Unexpected previous tag' >&2; exit 1; }
else
  [[ "$latest" == "$PREVIOUS_REF" ]] || { echo 'Previous release tag has changed' >&2; exit 1; }
  jq -e --arg tag "$PREVIOUS_REF" 'any(.[]; .tag_name == $tag and .draft == false)' <<< "$releases" >/dev/null || { echo 'Previous published release is missing' >&2; exit 1; }
fi
if [[ "$mode" == publish && "$draft" == false ]]; then
  echo 'already-published=true' >> "$GITHUB_OUTPUT"
else
  echo 'already-published=false' >> "$GITHUB_OUTPUT"
fi
if [[ -n "$id" ]]; then echo "release-id=$id" >> "$GITHUB_OUTPUT"; fi
