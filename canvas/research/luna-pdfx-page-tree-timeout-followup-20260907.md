# PDF page-tree timeout guard follow-up — 2026-09-07

This follow-up corrects only the malformed-tree regression execution boundary. It does not change production source or retained page-tree evidence.

## Commits

- Existing source wiring: `d2003f8`
- Existing page-tree regression: `fca4673`
- Follow-up test commit: `f7fc9dd`
- Follow-up evidence commit: this report's commit

## Isolation correction

`boundedPreflight` remains used for ordinary valid and non-cyclic mutations. The `cycle` and `malformedKids` serialized fixtures now run `preflightPdfx4` in isolated child Node processes. The parent sends the in-memory bytes over stdin and enforces a 5-second child bound, terminating with `SIGTERM` and a short `SIGKILL` fallback. This protects the parent from synchronous event-loop blockage or recursion that a Promise race cannot interrupt.

A separate child control executes `for (;;) {}`. The parent timeout is 350 ms; it terminated at approximately 352 ms and the test completed within the 2-second Node test bound.

Each isolated page-tree case still asserts:

- exact `PDF_PAGE_TREE_INVALID` issue code;
- repeated report ordering equality;
- `conformant:false`;
- unchanged input SHA-256.

The valid retained candidate remains an in-process baseline with no page-tree issue. Retained PDFs and historical manifests were not rewritten.

## Verification

Command, run from `canvas`:

```sh
node --test src/exporters/pdf-page-tree.test.mjs src/exporters/luna-pdf-page-tree-independent.test.mjs src/exporters/pdfx-page-tree-preflight.test.mjs src/exporters/pdfx-preflight.test.mjs
```

Result: exit 0; 36 passed, 0 failed, 0 cancelled, 0 skipped. `git diff --check` is clean before commit.

No production, profile, capability, native, device, or retained-artifact changes were made.
