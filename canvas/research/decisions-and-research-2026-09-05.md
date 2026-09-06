# Architecture decisions and research review — 2026-09-05

Research and observed evidence, not an implementation plan. Read against revision 4 §0.4, §§10.2–10.3, and both user-authored operation documents. The latest user message takes precedence over older prose. No new decision below was implemented and no protected plan, operation, instruction, or skill file was edited for this review. Earlier authorized PDF work remains in the worktree.

## Decision register and current contradictions

| Decision recorded | Current code / qualification |
| --- | --- |
| DEC1: modules are generic, deck, web, mobile; delete print/page; physical and bleed belong to frames; PDF/X-4 belongs to extraction | `src/canvas-schema.mjs` still admits print/page. Its print-geometry validator requires a page frame, excluding generic frames. `src/capability-tables.mjs` retains page and PAGE_PROFILE_DELTAS. `src/export-service.mjs` dispatches PDF from page. Migration defaults also retain print/page. Removing the table entry does not establish PDF/X-4 conformance: the checker and fail-closed feature gate must survive independently. |
| DEC2: folds/safeMargin are guides; bleed is real artwork outside trim | `src/exporters/pdf.mjs:27` requires bleed for folds and lines 46 onward emit fold marks. Both contradict DEC2. Boxes alone do not create bleed artwork: extending the page or filling a background is not proof that edge artwork extends correctly. |
| DEC3: roleless PDF extraction, N nodes, file/directory cardinality | Public extraction and `src/export-service.mjs:57` currently accept one node and PNG/SVG only. SVG has a roleless IR, but still consults the SVG table. PDF still follows the deliverable path. Native PDF paths and embedded text are implemented, but universal losslessness is not established. |
| DEC4: variants are component props, not axes; prose correction only | Schema/resolver already have separate props/bind and axes/modes. No unification rewrite is needed. Qualification: the sibling test is an authoring heuristic, not a strict invariant of current code, because explicit node modes permit two sibling subtrees to select different appearances. |
| DEC5: fixed-layout Canvas, no Word/Pages-style document pagination | Consistent with current frame-oriented model. Yoga/flex/grid inside a frame do not imply a paginated flowing-document product. |
| DEC6: only appearance and viewport axes; remove interaction | Schema accepts arbitrary axis names; web CSS still emits an interaction custom property on hover. DEC6 supersedes the earlier interaction wording even within §0.4 DEC4. |
| DEC7: N binding sets → N artifacts, layout per set; explicit output names; no sanitization, collisions before writing, never overwrite/version | A single bindings object reaches resolution; there is no full batch operation. Web `safeSlug` and mobile `sourceName` silently normalize names. Their Maps can replace an earlier same-name output before bundle collision checking. `writeAtomicBundle` checks names while writing staging files, not in a complete pre-write pass. `writeAtomicFile` checks existence and then renames: a concurrent creator can win between those operations and be overwritten by POSIX rename. The ordinary existing-file case works, but the race-free contract is not implemented. |
| DEC8: test actual installed-controller absolute-path writes | Passed for a user-writable path outside the workspace; details below. Not an inference from permissions. |
| DEC9: export default/image, image is a one-way forced raster override | Schema and validation still say live/image (`src/canvas-schema.mjs:70,135`); IR defaults still use live. Descendant and SVG-extraction image overrides exist. Deliverable root capability evaluation does not apply the descendant image-override branch, so a selected frame's override is another gap. No force-native author option exists. |

## A. Variables and tokens

### A1. Align with DTCG?

Recommendation: **yes to DTCG-compatible token interchange and typed alias semantics; do not merely rename tokenType/cascade.** DTCG is specifically an interoperability format and is a stable Community Group report, not a W3C Recommendation. Its `$value`, explicit/inherited `$type`, structured values and references differ from Canvas string interpolation. A whole-token alias must retain the referenced type, rather than stringify numbers or objects. [DTCG Format 2025.10](https://www.designtokens.org/tr/2025.10/format/).

Canvas's conditional cascade is a separate concern. The DTCG resolver specifies ordered sets, modifiers and contexts; portability requires an explicit mapping of the supported Canvas conditions, not putting the cascade array under `$value`. Unsupported conditions need a declared extension or a resolved export, with the limitation reported. Keeping an internal evaluated representation is compatible with exposing standards-shaped tokens. [DTCG Resolver 2025.10](https://www.designtokens.org/tr/2025.10/resolver/).

Generic template strings are not a standard DTCG token type. Figma itself documents a subset and extensions: string import is accepted although not a standard type, and cross-collection references require identity metadata. Therefore “DTCG-compatible” must specify supported types and lossless round-trip limits, not promise universal tool interchange. [Figma token import](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables).

### A2. Numeric scales and tiers

| System | Meaning of its numbers | Finding |
| --- | --- | --- |
| Tailwind | 11 shades, 50 through 950 | Familiar palette indexing; not a universal semantic-role system. [Colors](https://tailwindcss.com/docs/colors) |
| Material 3 | HCT tonal palettes spanning 0–100, with color roles selecting tones | Not “three tones” or one fixed equally spaced ramp. Primary, secondary, tertiary, neutral, neutral-variant and error palettes appear in its reference design. [Tonal palette implementation](https://github.com/material-foundation/material-color-utilities/blob/main/typescript/palettes/tonal_palette.ts), [reference/system token prior art](https://github.com/material-foundation/material-tokens/blob/main/tokens.md) (archived historical repository) |
| Radix | 1–12 with intended uses: backgrounds, component states, borders, solid colors, text | Functional steps align across light/dark; not interchangeable with a simple lightness ranking. [Scale uses](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) |
| IBM/Carbon | IBM palette swatches 10–100; Carbon themes assign role tokens | Palette primitives and theme roles are distinct. [IBM colors](https://www.ibm.com/design/language/color/), [Carbon color system](https://carbondesignsystem.com/elements/color/overview/) |

Recommendation: **primitive → semantic tokens as the default convention, optional component aliases when useful, no mandated numerical scale in the schema.** The current recursive resolver already permits alias chains; it does not need an exactly-two-level mechanism. Prior art converges on separating values from uses, but genuinely diverges on numbering, tone generation, and the number of naming layers. Existing library scales should retain their meaning, not be mechanically renumbered. Contrast must be tested on actual foreground/background pairs; a token number is not an accessibility guarantee.

### A3. Separator

Recommendation: **dot for hierarchical token paths, hyphen within a name segment**: `color.blue.600`, not a flat literal name whose dot has no structure. DTCG uses dot-separated brace references such as `{color.blue.600}` and forbids dots inside individual token/group names. Canvas `${...}` interpolation and DTCG `{...}` aliases are different syntaxes and should not be conflated. [DTCG naming and references](https://www.designtokens.org/tr/2025.10/format/).

Code confirms the blocker at `src/canvas-resolver.mjs:199,207`; `src/rich-text.mjs:135` repeats the same restriction. `${blue.600}` remains uninterpreted rather than resolving. A future change must cover both parsers, hierarchy lookup, typed whole-value aliases, mark-offset adjustment, and flattened-name collision detection. Changing only the regex would not implement nested DTCG groups. Existing hyphen names can remain valid; CSS/source-language spelling is a separate output mapping.

## B. Cross-document imports

### B1. Consumer theme versus source ownership

**Partly confirm, partly refute.** Consumer context commonly flows down, but it does not automatically replace an imported definition with a same-named local definition.

- Figma Auto modes inherit enclosing context for the bound collection; explicit modes stop inheritance while retaining variable bindings. Published styles retain library identity. A same-named consumer text style is not an automatic override. Thus literals are not the only way to lock a choice. [Figma modes](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables), [shared styles](https://help.figma.com/hc/en-us/articles/360039820134-Manage-and-share-styles).
- CSS custom properties inherit and cascade on the element, independent of which file supplied the rule. A local declaration can override inherited context without removing all variable references. [CSS Variables](https://www.w3.org/TR/css-variables-1/).
- SwiftUI views read inherited environment values; nearer modifiers override them. Importing a module alone does not make explicit fonts/colors theme-dependent. [Apple EnvironmentValues](https://developer.apple.com/documentation/swiftui/environmentvalues/).
- Material Compose uses scoped theme values through CompositionLocal; the nearest provider wins. A nested theme is another non-literal boundary. [Android CompositionLocal](https://developer.android.com/develop/ui/compose/compositionlocal).

Recommendation: default to consumer context for theme-aware values, preserve the identity of imported token/style definitions, and make local mode/context overrides explicit. A per-import boolean is not required by this prior art, but “lookup everything by consumer name” is not the equivalent mechanism.

`src/canvas-resolver.mjs` uses imported variables for imported nodes but a consumer paragraph-style map. That split has no coherent general library-identity contract. Source definition ownership plus consumer context can be correct for both; choosing one document's name map for everything is not enough. This is a research conclusion, not authorization to implement a new import model.

### B2. Public surface

| System | Explicit boundary | Representation |
| --- | --- | --- |
| Figma | Published reusable assets; selected items can be withheld | Per-item publication controls in a library UI. [Publishing](https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library) |
| npm/Node | Supported package entry points via exports; legacy packages can omit it | Package-level map. [Package entry points](https://nodejs.org/api/packages.html#package-entry-points) |
| ES modules | Exported bindings and re-exports | Declarations or export lists. [ECMAScript exports](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html#sec-exports) |
| Rust | Private by default, pub/restricted visibility/re-exports | Per-item and module boundaries. [Visibility](https://doc.rust-lang.org/reference/visibility-and-privacy.html) |
| Swift | Cross-module API uses public/open; default internal | Per-declaration access. [Access control](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/accesscontrol/) |
| Java named modules | Export packages; public declarations still matter | module-info plus declaration access. [JLS chapter 7](https://docs.oracle.com/en/java/javase/26/docs/specs/jls/jls-7.html) |

Conclusion: **an intentional public surface is the strong common pattern; a document-level manifest list is not universal.** For Canvas authoring, per-item publication metadata is a reasonable recommendation, with a derived inventory rather than two independently editable sources of truth. That representation is an engineering preference, not an objective result forced by all six examples. Do not overload DEC9's `export` field: it now has a distinct rendering meaning. Public-surface visibility is also not a replacement for account access control.

### B3. Replacing the pin

Figma separates editing from publishing and lets consumers review/accept published updates. Sketch supports review, starred release versions and automatic-update options. These are design-library precedents, not semver-range package-manager workflows. [Figma updates](https://help.figma.com/hc/en-us/articles/360039234193-Review-and-accept-library-updates), [Sketch updates](https://www.sketch.com/docs/libraries/updating-library-components/).

npm integrity hashes verify downloaded artifact bytes; resolved version/location and integrity have separate jobs. A hash is neither a release policy nor an update prompt. [npm lockfiles](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/).

Recommendation: a retained accepted published revision, updates offered explicitly, optional automatic-follow behavior if desired; content hashing may support integrity and deduplication beneath that. “No pin, but decline updates” is not coherent unless accepted content is retained somewhere. Design tools genuinely diverge on automatic versus manual updates.

`src/canvas-imports.mjs:39` derives version from snapshot/update sequences and compares an exact pin to the latest source head; it does not retrieve a retained historical revision. An unrelated edit can therefore invalidate an import without a publication. The defect is not that sequence numbers are intrinsically incapable of identifying history, but that this implementation couples acceptance to the mutable head and lacks historical retrieval/publication semantics.

## C. Verification from this machine and code

### C1. Mobile tooling

Yes. Xcode 26.2 is installed; `simctl` reports iOS 26.3 iPhone 17 Pro and iPad mini simulators booted. Existing simulator PNGs are under `research/mobile-qa/`. Android emulator 36.6.11 and API 36 Google APIs arm64 images are installed; five AVDs are listed. Android was not running at this recheck, so I launched `penkra_api36_pixel8`; ADB then reported emulator-5554 connected. The SDK binaries are under `/Users/emmanuelgyekyeatta-penkra/Library/Android/sdk`, not `/usr/local/bin`.

The fresh Android boot subsequently completed (`sys.boot_completed=1`), the installed fixture package was found, and `am start` launched its MainActivity successfully.

Required workflow: generated source in the fixture hosts, Xcode/Swift and the Android SDK/JDK/Gradle environment, install/launch, screenshots and accessibility inspection, device-density/font-scale variants, then per-property comparisons. No paid service or absent simulator installation is blocking it. Starting a simulator and compiling a fixture do not verify property fidelity.

Current inventory is **53 iOS + 52 Android = 105 unverified properties**, not the older 103 count; letter-spacing run rows account for the added two. Latest full regression: **336 passed, one cancelled Swift compilation test at its 240-second timeout, zero assertion failures, command exit 1**. Compose assembly passed in about 144 seconds. This is not a clean test suite and does not close the mobile rows.

### C2. Roleless IR

`buildExporterIR` remains role-driven: table lookup, selected-frame role equality, physical requirements for slide/page, projection and raster policy all use the role (`src/exporter-ir.mjs:18`). But the stronger claim “a roleless subtree cannot currently produce any IR” is **no longer true**. `buildExtractionIR` at line 115 accepts a roleless subtree, resolves/layouts it, computes descendant visual bounds and rebases its SVG output. Existing roleless tests pass. It still uses the SVG capability table and supports neither the new PDF extraction dispatch nor multi-node cardinality.

### C3. Fifteen-document migrations

Deleting parsePenFile does **not** block migration of stored Canvas documents. `createCanvasMigrationCopy` restores the stored snapshot plus Yjs updates, materializes the document, transforms it, creates a copy, transfers assets, checks the copy's projection, writes a report, and only then renames the original (`src/document-migration.mjs:75`). Its tests pass without parsePenFile; active engine export tests also require that parser to be absent.

This establishes the alternative path, not completion or fidelity of all fifteen actual migrations. Migrations retain obsolete print/page assumptions, and their best-effort validation fallback can drop top-level subtrees. A schema-valid copy alone is not a faithful migration. Actual copies require document-specific visual verification and explicit loss reporting. No raw Pencil compatibility path needs restoring.

## D. Bundle and exporter-IR review

### Section 10.2

The bundle observation is sound; the detailed contract is not established by current code. In addition to DEC1/DEC7 contradictions above:

- Web raster assets are `assets/<node-id>.png`, not content-hash addressed. Mobile raster data is embedded in generated source, not a shared content-addressed asset directory.
- Mobile helpers do use `_canvas/`; web CSS is root `styles.css` and contains document-specific rules. “All helpers byte-identical” is not a description of all current emitted files.
- Source filename Maps can silently erase collisions before filesystem validation. The report lists the destination root, not every emitted member. The single-file branch does not write the same report sidecar as source bundles.
- Temp-directory staging prevents ordinary partial destination bundles, but it does not establish a race-free no-overwrite commit or complete pre-write validation. DEC8 proves access, not these guarantees.

### Section 10.3

- The illustrated object is not the implemented schema: actual IR has `outputs[]` with nested nodes/root, paint retains Canvas forms, raster sizing uses variants, and provenance is not the shown complete per-node `{from, prop, lowered}` contract.
- “Semantic stops before collapsing” is inaccurate: both branches first call the resolver. The semantic branch recovers selected authored layout/variant fields afterward; it is not a complete preserved conditional/component program. Expanded instances and source-context data need particular scrutiny.
- Layout preservation is partial, not proof of equivalent target behavior. For example Swift grid output uses a count of flexible columns, not arbitrary authored track semantics. Compile success does not prove parity.
- Selected highest-density raster images are emitted by the service; declaring multiple variants in IR does not mean a full responsive density asset set is written.
- Role-based print scaling and page-profile composition are superseded. Extraction still needs explicit raster sampling for forced images/unsupported effects even without a role table.
- Fixed unit multipliers cannot describe arbitrary declared physical sizes: coordinate scaling must follow each frame's physical-to-logical ratio. The new extraction document's 72-dpi fallback also conflicts with this section's 96-dpi / 0.75-point convention.
- The bundled profile is display-class sRGB, not a printer output condition. PDF/UA does not universally require an output intent as the section claims. The current local PDF/X checker remains fail-closed and incomplete; moving the flag must not silently enable conformance claims.

### What breaks if tables are keyed by format?

**No fundamental model requirement breaks; a mechanical key rename breaks several consumers.** The coherent separation is module → allowed unit roles, role → deliverable selection semantics, format → writer capability. Public formats should be pptx/html/swift/kotlin; SwiftUI/Compose are writer identities. PDF/PNG/SVG follow the extraction contract, not role tables.

1. `capabilityTableFor(request.role)` must receive format; otherwise slide/route/ios/android return no table. A temporary explicit mapping would preserve existing behavior.
2. `roleRows(target)` compares roles to keys. Feeding it pptx makes even roles.slide look inapplicable. Role eligibility must be a separate constraint, not equality with a format string.
3. Service dispatch, projection selection, raster policy, report labels, verification fixtures and production totality checks currently use roles. Renaming table keys does not migrate those paths.
4. Page profile deltas must leave the capability-table inventory; PDF conformance validation remains a separate extraction option/gate.
5. Capabilities must identify the tested writer/version/platform, not claim that everything legal in a format is implemented. A language extension alone does not identify SwiftUI versus another Swift rendering library.
6. Whether a node is a slide or route is semantic eligibility; whether its gradient can be represented is a writer capability. Keeping these separate avoids the original vocabulary collision and lets multiple roles use one writer where genuinely applicable.

### Disagreements with the new operation documents

- `documents.export` still lists pdf in Usage despite assigning all PDF to extraction later.
- Its verdicts say native/lower/raster, whereas current tables use native/raster/ignore and report lowering separately. Its “anything unmeasured is raster” conflicts with DEC9's real-limit meaning and the current fail-closed unverified state.
- Existing tables themselves also contain raster reasons saying only “no measured native emission”; these are implementation/evidence gaps, not demonstrated format limits. DEC9 requires auditing that distinction rather than treating every existing raster row as settled physical impossibility.
- “Extraction loses nothing,” “paths stay paths/text stays text” without qualification, and “no consequences” conflict with export:image and unsupported effects/font availability. Removing a public role capability table is a product choice; removing truthful fallback/error reporting is not a consequence of it. PDF also can carry tags, links and metadata; “no semantics beyond dimensions” is too broad.
- PDF/X-4's extraction flag is absent from Usage. Scale is PNG-only in the new document, while current SVG uses it for fallback sampling; an internal/default sampling policy is still necessary.
- The 72-dpi fallback needs reconciliation with the plan's 96-dpi convention. With physical, distinguish trim size from bleed-expanded MediaBox and define extraction bounds including effects.
- “All role-bearing frames” must mean all frames matching the selected format, especially a mobile document containing both ios and android units.
- Multi-node directory classification, existing-directory behavior and relative-path resolution are underspecified. The sample relative destination is rejected by current absolute-only writes. The proposed error codes are not the installed ones.
- Batch bindings/output names and layout-per-binding-set are absent from export Usage. Static-flow non-export policy should not be confused with the introductory mention of PowerPoint transitions.

## DEC8 reproducible installed-controller evidence

Installed Canvas 0.2.40, operation `documents.extract`, source document `d8ad9244-5f82-4656-9986-21c73a0758e4`, node `qa-title`. The provider created only the empty probe directory; **the installed controller wrote the PNG** via its public command.

Destination: `/private/tmp/canvas-controller-write-SqGMRZ/probe.png`.

Result: PNG RGBA 1100 × 56, 6164 bytes. SHA-256: `e1c901f4303d551a8867be441f4248547a07e1561514ce15d2e96a08cf76370f`.

Repeating the same controller request returned “Destination already exists”; a subsequent hash was unchanged. No source-document mutation was requested. The artifact remains in the temporary QA directory. This establishes ordinary absolute-path writes outside the workspace under the current installed runtime, subject to OS access rights; it is not a claim of access to protected or unwritable directories.

## Earlier authorized PDF work retained

Before this review, local checks were expanded for XMP/Info consistency and a bounded embedded-font/content subset, with negative fixtures. Native PDF rendering fixes preserve root backgrounds, transparent unpainted containers, fill/stroke alpha and document paint order. Missing encoded glyphs now fail explicitly. A Canvas-versus-Poppler fixture matched 54,391 uniform interior pixels exactly; antialiasing edges were excluded, so this is not universal vector fidelity proof. Artifacts are in `tmp/pdfs/native-vectors/`.

The free ICC tool validated profile structure with warnings: the bundled sRGB is display-class; a temporary PSOcoated_v3 profile is printer-class. No commercial subscription was required. PDF/X-4 remains unverified rather than mislabeled. These checks and fixes survive DEC1; only their API attachment changes when implementation is authorized.
