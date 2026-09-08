# Canvas 0.2.69 release verification

Date: 2026-09-08

- Descendant contract implementation commit: `7ac1c3e`
- Descendant contract documentation commit: `aa08a8b`
- Export and retained-import resolution commit: `1f683e1`
- Private registry submission: `017d5848-47fc-4934-adef-5aed8ea25e2b`
- Registry package digest: `38b5888a41101cb84d3ed28bcb0cb02790fef0ac04b6cb2e680f7a96f704e898`
- Registry status: `published`
- Exact registry version installed after publication: `0.2.69`

This release completes the descendant-override repair by applying the same validated overrides to
the export resolver and to retained-library component instances. It prevents the editor and export
paths from disagreeing about an instance's rendered text, frame, or shape properties.

Verification:

- full `npm test` passed: 2,076 passed, 0 failed, 0 cancelled, 0 skipped; Swift and Compose
  compilation stages also passed;
- the final focused descendant, schema, resolver, operation, and export suite passed: 85 passed,
  0 failed, 0 cancelled, 0 skipped;
- development and production builds passed;
- eight consecutive isolated App integration tests of the exact 0.2.69 distribution passed within
  their eight-second bounds after the host test harness began awaiting exact controller closure;
- the installed 0.2.69 public operation contract exposes shallow `Get` by default, explicit depth,
  a 50-entry inspection bound with `inspectionSummary`, canonical bare descendant IDs, component-
  relative paths, non-text paint overrides, and validation-before-commit;
- an isolated live Canvas QA document proved bare-ID text, frame, and rectangle overrides render,
  a bare frame `Get` is shallow, inspection is summarized, and invalid descendant keys fail before
  commit without advancing the document sequence;
- the live QA document was moved to Canvas Trash after verification and is recoverable;
- the supplied reproduction document `9bf51d3d-8e14-470f-ad5a-559759d0be65` was inspected
  read-only and was not mutated.

The adjacent export test matrix proves local and retained-library descendant overrides survive
component expansion, including consumer-owned variable resolution, and invalid qualified component
paths fail before a mutation commits.
