# Canvas 0.2.71 release verification

Date: 2026-09-08

- Implementation/version commit: `d183df7`
- Private registry submission: `5f467108-f29f-4efe-ac9f-cf1fa4a16c6b`
- Registry version ID: `13f00b3f-6371-4acf-a960-ca26230b1096`
- Registry package digest: `2ee765640f4e58b9ec61495f34b313374ec1a58f12e0641e85c7b583e8626a01`
- Registry status: `published`
- Exact installed version after publication: `0.2.71`

This release adds frame-level `overflow` values `visible`, `clip`, `scroll-x`, `scroll-y`, and
`scroll-both`. The editor and screenshots show the authored clipped viewport. HTML, SwiftUI, and
Compose preserve live scrolling direction. Static extraction defaults to the viewport and accepts
`scrollContent: "full"` for PNG, SVG, and nonphysical PDF output. A physical PDF expansion fails
before publication because its declared page size cannot change implicitly.

`Get` inspection now reports each scroll frame's mode, content dimensions, and overflow amount on
both axes. The legacy `clip` boolean remains supported, and explicit `overflow` takes precedence.

Verification:

- full `npm test` passed: 2,095 passed, 0 failed, 0 cancelled, 0 skipped;
- the full suite compiled the generated SwiftUI fixture and assembled the generated Compose APK;
- focused schema, render, inspection, IR, exporter, extraction, capability, and real Chrome tests
  passed 129/129 before the final extent correction, followed by 49/49 affected IR/export/browser
  tests and 19/19 public-operation/extraction tests;
- Chrome measured `overflow-x`, `overflow-y`, `clientWidth`, `clientHeight`, `scrollWidth`, and
  `scrollHeight` for horizontal, vertical, and two-axis containers; this caught and repaired a
  missing containing block for scroll frames placed inside grid or flex layouts;
- development and production builds passed;
- the exact 0.2.71 distribution passed isolated App validation with all 14 operation-help entries,
  a ready renderer tab, and successful temporary-profile removal;
- registry archive, compatibility, digest, identity, manifest, permission, policy, and version
  validation passed before publication;
- installed-App QA created a disposable scroll-both frame whose inspection reported a 100×80
  viewport, 230×160 content, and overflow amounts 130×80. Installed `documents.extract` produced a
  100×80 default PNG and a 230×160 full-content PNG;
- the disposable QA document was moved to recoverable Canvas Trash and its temporary artifacts were
  removed.

Two initial publication calls used the command wrapper's default 30-second wait and timed out before
creating a registry submission. A subsequent call retained the same operation but used a 120-second
client wait, returned submission `5f467108-f29f-4efe-ac9f-cf1fa4a16c6b`, and the registry later
reported it published. This was a caller wait-boundary issue, not a registry validation failure.
