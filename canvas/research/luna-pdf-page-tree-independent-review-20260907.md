# Independent PDF page-tree review

Date: 2026-09-07  
Review target: `pdf-envelope` source commit `c06ac7d`  
Root evidence: `bd6e52c`  
Review worktree: `library-loading`, branch `codex/canvas-library-loading-20260907`

The root helper was inspected read-only. No file in `pdf-envelope` was edited,
and no library-loading production source was changed. The root report records
the earlier combined-preflight repro where `/Pages /Count 999` and a deleted
leaf `/Parent` were accepted as a clean candidate.

## Paired commands

The independent test uses `CANVAS_PDF_PAGE_TREE_IMPLEMENTATION` when set and
otherwise imports the eventual sibling `./pdf-page-tree.mjs`. It loads
`pdf-lib` through the same implementation URL so cross-worktree constructor
identity cannot turn valid dictionaries into false failures.

```text
CANVAS_PDF_PAGE_TREE_IMPLEMENTATION=/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/pdf-envelope/canvas/src/exporters/pdf-page-tree.mjs \
node --test src/exporters/luna-pdf-page-tree-independent.test.mjs
```

Exit `0`; 7 passed; 0 failed, cancelled, or skipped.

The same test was copied with the root helper into the task-owned isolated
archive `/tmp/canvas-pdf-page-tree-review-bDlCQ2` and run using the eventual
default sibling import. It passed 7/7 and the exact archive was removed after
the run.

The root helper's original paired selection was also run read-only:

```text
node --test canvas/src/exporters/pdf-page-tree.test.mjs
```

Exit `0`; 5 passed; 0 failed, cancelled, or skipped.

## Independent coverage

- Flat two-leaf and three-leaf multi-level trees assert exact `pageCount` and
  descendant `/Count` results.
- Wrong counts, missing/wrong/direct immediate parents, repeated leaves,
  cycles, direct child dictionaries, and dangling references fail closed.
- Missing/dangling trailer `Root`, missing catalog `Pages`, root-parent
  presence, missing/non-array `Kids`, missing/negative/fractional/unsafe/string
  `Count`, and wrong root/leaf `Type` are exercised.
- Valid and malformed object graphs are compared before/after inspection for
  immutability. The bounded 2,048-level chain completes without recursive
  traversal or stack overflow.
- The independent malformed/cyclic cases never call `getPages`; checker input
  is inspected through raw `pdf-lib` links before any cached page API.

## Boundary limitations

The checker receives parsed `pdf-lib` objects, not raw PDF bytes. The test
therefore verifies parsed integer behavior: `2.0` is accepted as the same
parsed value as `2`, while `2.5` and values beyond `Number.MAX_SAFE_INTEGER`
are rejected. It does not claim full PDF lexical-number, cross-reference,
object-stream, catalog, page-resource, inherited-attribute, or PDF/X grammar
validation. The helper remains an isolated page-tree relationship check; it is
not wired into a production preflight by this review.

Primary reference: [Adobe PDF Reference 1.6, Tables 3.26 and 3.27](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf).
