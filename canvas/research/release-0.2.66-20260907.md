# Canvas 0.2.66 release verification

Date: 2026-09-07

- Private registry submission: `aa33892f-bf72-4dc2-9558-ab3686be7f27`
- Registry package digest: `9309c6e99429d5114e5c4003dd5945ca411f0661ccee30b1e515d724b9301024`
- Registry status: `published`
- Exact registry version installed after publication: `0.2.66`
- `apps list` reports Canvas `0.2.66`.

This release aligns active App instructions, architecture, operation manuals, and packaged Skills
with the implemented module/role/format model. It removes the obsolete, unshipped `canvas-print`
Skill and replaces stale `documents.export-image` and role-driven export examples with
`documents.extract` and format-driven `documents.export` examples.

Verification:

- production and development builds passed;
- `penkra app test` passed for the exact 0.2.66 distribution with all 14 operations;
- the three remaining packaged Skills passed the skill validator;
- active non-historical guidance contains no obsolete `canvas-print`, `documents.export-image`,
  print-module, or page-role instruction.
