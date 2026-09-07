# Retained library import adapter verification

Date: 2026-09-07
Worktree: `canvas-parallel-20260906/library-runtime`
Branch: `codex/canvas-library-runtime-20260907`

This is pure adapter verification. It does not claim durable storage acceptance,
source deletion/revocation acceptance, backend persistence, or installed-content
behavior.

## Implementation and test commits

- `770520e` — `canvas: materialize retained library imports`
- `24b92a8` — `test(canvas): cover retained library import materialization`

## Command and result

```text
node --test src/canvas-imports.test.mjs src/canvas-resolver.test.mjs \
  src/library-item-content.test.mjs src/library-publication-service.test.mjs \
  src/library-publication.test.mjs src/library-retained-imports.test.mjs \
  src/library-retention-preparation.test.mjs src/library-storage.test.mjs
```

Exit code: `0`
Tests: `58`
Passed: `58`
Failed: `0`
Cancelled: `0`
Skipped: `0`

The default test run creates only task-owned temporary fixture data; it does not
write a retained research corpus or call a backend, source resolver, browser,
device, or native compiler.

## Matrix counts

The 10 retained-adapter cases covered:

- `1` real release/retention/resolution case for qualified variable, style, and
  component resources, consumer same-name decoys, inherited light/dark modes,
  and a source-local mode override.
- `1` private qualified variable/style rejection case while retaining private
  closure resources for internal resolution.
- `1` two-level dependency case with colliding asset names and independently
  namespaced output paths.
- `2` alias namespace cases: identical accepted release under two aliases, and
  different accepted public items under two aliases without manifest leakage.
- `1` overlapping parent/child component case with one materialized root.
- `1` follow-record case requiring an accepted release identity.
- `1` failure table covering missing bundle, wrong root, bad item hash,
  malformed requested/retained kinds, missing accepted item, changed asset
  bytes, conflicting resource/axes/release identity, missing dependency/asset,
  and a release cycle.
- `1` input snapshot/output-byte isolation case.
- `1` minimal retained-item canonical-hash validator case.

The broader focused command also retained the existing publication,
retention-preparation, storage, import, and resolver coverage: `48` existing
tests passed alongside the `10` new retained-adapter tests.

## Evidence and boundaries

- Retained item content hashes are checked with the canonical JSON algorithm
  used by publication code.
- Root release hashes are treated as authenticated storage provenance; the
  adapter does not manufacture a full-release validation claim from a minimal
  bundle.
- Retained entries use an explicit `retained:true` branch for public-manifest
  checks. Full release import validation remains unchanged.
- Asset bytes are copied, size/hash checked, and namespaced as
  `imports/<rootAlias>/imports/<nestedAlias>/<sourceAssetPath>`.
- No source document mutation, network access, storage write, latest-release
  lookup, acceptance, or schema/API change was introduced.

`git diff --check` passed before the implementation commit. The worktree was
clean after both commits.
