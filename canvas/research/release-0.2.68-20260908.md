# Canvas 0.2.68 release verification

Date: 2026-09-08

- Defect implementation commit: `7ac1c3e`
- Final documentation/version commit: `aa08a8b`
- Private registry submission: `9baf6629-7ff9-49e6-a273-c2fe61c7bc7c`
- Registry package digest: `388e532e4d8e32529d24bfdba25f809f8dd9b2d4d5ac066f1d13f5410bbfd719`
- Registry status: `published`
- Exact registry version installed after publication: `0.2.68`

This release repairs descendant instance overrides, bounds large script reads and mutation
inspection, and documents the authored-source versus component-relative path distinction.

Verification:

- full `npm test` passed: 2,074 passed, 0 failed, 0 cancelled, 0 skipped; Swift and Compose
  compilation stages also passed;
- the final focused descendant/runtime/operation suite passed: 30 passed, 0 failed, 0 cancelled,
  0 skipped;
- development and production builds passed;
- the exact 0.2.68 distribution passed the isolated App integration test in 5.4 seconds, including
  all 14 operations and a ready Canvas tab;
- an isolated live Canvas QA document proved bare-ID text, frame, and rectangle overrides render,
  a bare frame `Get` is shallow, inspection is summarized, and invalid descendant keys fail before
  commit without advancing the document sequence;
- the live QA document was moved to Canvas Trash after verification and is recoverable;
- the supplied reproduction document `9bf51d3d-8e14-470f-ad5a-559759d0be65` was inspected
  read-only and was not mutated.

The 0.2.68 package differs from the fully tested 0.2.67 candidate only in the exact help wording
for which descendant node types accept `fill` and the immutable App version.
