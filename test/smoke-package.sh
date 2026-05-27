#!/usr/bin/env bash
set -euo pipefail

node -e "import('./dist/index.js').then(() => console.log('loaded effect-rules'))"

directory=$(mktemp -d ./.oxlint-smoke.XXXXXX)
cleanup() {
  rm -rf "$directory"
}
trap cleanup EXIT

config="$directory/oxlint.json"
fixture="$directory/fixture.ts"

printf '{"jsPlugins":["effect-rules"],"rules":{"effect/no-explicit-any":"error"}}\n' > "$config"
printf 'const value: unknown = 1;\nvoid value;\n' > "$fixture"

bun --bun oxlint -c "$config" "$fixture"
