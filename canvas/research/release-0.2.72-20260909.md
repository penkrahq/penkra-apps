# Canvas 0.2.72 release verification

Date: 2026-09-09

- Implementation/version commit: `12dcb84`
- Private registry submission: `48900b46-6375-41cb-9f7c-7e674e118ebf`
- Registry version ID: `e943aaca-755b-4341-8ada-0159f7418774`
- Registry package digest: `89fac113be9217de95938c7655d4ecf59f75f1e6d7f842c23941d644a2a697a5`
- Registry status: `published`
- Exact installed version after publication: `0.2.72` (updated through the validated local distribution because this Space's existing Canvas installation is development-sideloaded rather than registry-managed)

This release completes the format-keyed capability tables with zero unverified rows and keeps every
remaining raster verdict tied to a concrete representation limit or retained visual mismatch. It
adds semantic HTML/CSS output for the full supported web surface, native SVG/PPTX/PDF paths and
paint geometry, closed-writer PDF/X-4 preflight, durable published-library retention, atomic batch
delivery, and measured SwiftUI/Compose capability families.

The final audits additionally repaired native PDF image/gradient clipping, strokes, transformed
radial shadings, blend states, links, language markers, decorations and list markers; exact image
stretch behavior across PDF/PPTX/SVG; safe-link rejection; and mobile value-specific fallback for
vector gradients and gradient strokes. Mobile raster assets are now generated separately for each
appearance/viewport combination, so runtime variants neither reuse incorrect pixels nor fail an
otherwise valid export.

Verification:

- full `npm test`: 2,123 passed, 0 failed, 0 cancelled, 0 skipped;
- generated SwiftUI fixture: `swift test --jobs 2` and `swift build --jobs 2` both exited 0;
- generated Compose fixture: `./gradlew --no-daemon --max-workers 2 :app:assembleDebug` exited 0;
- production and development builds both exited 0;
- capability inventory: PPTX 115 native/12 raster/16 ignore; HTML 127/3/13; Swift 79/49/15;
  Kotlin 79/49/15; SVG 128/5/10; zero unverified entries;
- PDF/X focused and serialized matrices, Chrome/LibreOffice/Poppler document-format fixtures,
  retained mobile screenshots, forty-deck output, library retention, collision/no-overwrite, and
  roleless extraction all passed in the full run;
- the exact 0.2.72 distribution passed isolated Penkra App validation with all 14 operation-help
  entries, a ready renderer tab, and successful temporary-profile removal;
- registry archive, compatibility, digest, identity, manifest, permission, policy, and version
  validators all passed before publication;
- `apps list` reports the current Space's Canvas installation at 0.2.72 after exact-distribution
  sideload update.
