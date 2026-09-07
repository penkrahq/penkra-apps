# Canvas 0.2.65 release verification

Date: 2026-09-07

## Release

- Private registry submission: `dd725e76-ab52-4a47-a02b-7afe29fb3a1f`
- Registry package digest: `d5c5d78f241723967f7f4278e07c74e81bd2b03580c120ce12f5fb813d1b877e`
- Exact registry version installed after publication: `0.2.65`
- `apps list` reports Canvas `0.2.65`.

## Verification

- Full `npm test`: 2,069 passed; 0 failed, cancelled, or skipped. The run includes the pinned Swift build and Compose Gradle assembly.
- Production build passed.
- Public App validation passed for the exact distribution with all 14 declared operations.
- The public surface has no `documents.migrate` operation.
- `documents.export` publicly accepts `pptx`, `html`, `swift`, and `kotlin`.

## Installed acceptance

An Account-backed mobile QA document was exported through the installed 0.2.65 App.

- Swift: the iOS frame remained native; the unsupported text subtree alone rasterized at its authored 300 x 60 point bounds to 900 x 180 pixels at 3x. The generated accessibility label remained present.
- Kotlin: the Android frame remained native; the unsupported text subtree alone rasterized at its authored 320 x 60 dp bounds to 1280 x 240 pixels at xxxhdpi. The generated content description remained present.
- The temporary QA document was moved to recoverable Trash after verification.
- The four temporary 0.2.64/0.2.65 export directories were removed.

## Scope notes

- The 15 existing Canvas documents were migrated in place through the internal stored-projection migration path; no public migration command was added.
- Mobile capability verdicts are conservative. Measured native behavior is retained where demonstrated; failed or unmeasured candidate behavior uses deterministic raster fallback rather than blocking production export or claiming native fidelity.
- PDF/X-4 remains a roleless PDF extraction profile with bounded preflight checks. This release does not claim universal third-party certification.
- Stale `print`/`page` wording remains in protected prose that this implementation was explicitly instructed not to edit; runtime schemas and operations use the current module/role/format model.
- Penkra's semantic snapshot of a non-foreground Canvas tab remains a host-side visibility issue and is not a Canvas export or release blocker.
