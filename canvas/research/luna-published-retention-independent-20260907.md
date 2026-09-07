# Independent published-retention composition review

Date: 2026-09-07

This is a pure, in-memory review of the published-retention acceptance seam. It
does not change production code, storage behavior, source documents, native
targets, or capabilities.

## Provenance

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/library-publication-head`
- Branch: `codex/canvas-library-publication-head-20260907`
- Retained-publication preparation commits preserved before review:
  `12f8afb8fcb047774685966e785a1e3421c8dd79`,
  `646d27ed8cfdbdf0fe86e49a90bb37b25c26d449`,
  `658954521de1713277e1be315ada8ff83a3983d0`
- Cherry-picked acceptance source/tests/evidence (resulting local commits):
  `deb63cb412031671f99377d74998f222f8308438`,
  `b7fb50c`, and `a9f3b46`
- No production edits were made during this review. The only new files are
  `canvas/src/library-published-retention-independent.test.mjs` and this
  report.

## Verification command

```text
node --test canvas/src/library-published-retention-independent.test.mjs canvas/src/library-published-retention.test.mjs canvas/src/library-retained-publication.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retained-loader.test.mjs canvas/src/library-retention-preparation.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-publication-service.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/library-publication.test.mjs canvas/src/library-publication-head.test.mjs
```

Exit: `0`. Result: `85` passed, `0` failed, `0` cancelled, `0` skipped;
duration `193.264709 ms`. The independent review file contributes `5/5`
passing tests.

## End-to-end composition

The test builds real two-level A/B fixtures. B owns `shared.png`, has public
`card`, and has private variable `accent`; A publicly exposes `hero`, which
references B's accepted card. A retention is written to the in-memory C-owned
transport using `createLibraryStorage` only as fixture setup.

The review then performs this exact pure composition:

1. `prepareRetainedLibraryRelease` reads A's accepted retention from C-owned
   storage and creates C's release with its own `owned.png` plus direct `a -> A`
   identity.
2. A/B storage projects are removed. `preparePublishedLibraryRetention` is
   called with that returned `{release, assets, retentions}` and no API/source
   readers. It returns a minimal C retention containing `published`, A's
   `hero`, and B's `card`.
3. `buildRetainedCanvasImports` materializes a final consumer from the accepted
   C retention. The nested import chain is retained through
   `published -> a -> theme`, and assets are materialized as
   `imports/published/owned.png` and
   `imports/published/imports/a/imports/theme/shared.png`.

The B private `accent` remains resource closure data needed by `card`, but no
`variable:accent` item is promoted into the accepted item list. The final
retention contains only the required public item identities and required asset
bytes. No upstream resolver, source document getter, or source asset reader is
provided to the acceptance function or called by it.

## Negative and isolation findings

- Two aliases to the same release can accept different public roots (`card` and
  `button`), but alias A referencing `a:button` fails with
  `CANVAS_LIBRARY_ITEM_PRIVATE` in both retained-publication preparation and
  published-retention acceptance. The legal `a:card` + `b:button` consumer
  materializes separate public manifests.
- A requested private root fails with `CANVAS_LIBRARY_ITEM_PRIVATE`.
  Unused private closure content remains unavailable as an accepted item.
- Tampered retained resource content fails with `CANVAS_IMPORT_INTEGRITY`.
  A retained dependency cycle fails with `CANVAS_IMPORT_CYCLE`; neither path
  invokes source fallback.
- Missing accepted transport fails with `CANVAS_IMPORT_INTEGRITY` and has no
  upstream fallback path.
- Input and output detachment is preserved across the composition; result
  mutation does not mutate the prepared release or source fixture.
- Colliding source asset paths remain identity/namespace scoped rather than
  being flattened.

## Review result

No remaining production bug was reproduced in the reviewed acceptance seam.
The accepted-content path composes with the retained-publication preparation
helper in pure memory and preserves direct semantic dependency identities,
accepted public surfaces, authenticated bytes, and private closure boundaries.
This evidence does not establish live persistence, authorization, or broad
durable republication completion.
