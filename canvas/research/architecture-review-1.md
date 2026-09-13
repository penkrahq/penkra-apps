# Canvas architecture revision 2 review — historical

> This review describes an obsolete architecture revision. Its findings were incorporated into
> `CANVAS-ARCHITECTURE.md` revision 4; they are evidence, not open work or a current plan.

I found 42 material issues. The reviewed plan was not implementation-ready: several settled decisions had not propagated, parts of §24 contradicted OOXML directly, and its sequencing could not satisfy its own gates.

I did not edit the plan.

## A. Internal inconsistencies

1. **Four verdicts survive after the three-verdict decision — §§2, 9, 14, 17, 18, 24 — [OBJECTIVE].**

The plan settles `native` / `raster` / `ignore`, but:

- P4 still refers to “substitution” ([CANVAS-ARCHITECTURE.md:73](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:73)).
- Stage 2 says “the four verdicts” ([line 1534](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1534)).
- Axis tables use `unavailable` ([line 726](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:726)).
- Print diagnostics use `verdict: "resolution"` and `verdict: "overflow"` ([lines 1391, 2214](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1391)).
- Deferred Lottie still calls `substitute` a target ([line 1684](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1684)).

Resolution: restrict `verdict` to the three settled values. Availability, overflow, resolution, and other checks need a different field such as `kind` or `diagnostic`.

2. **Deleted role families and `screen` still drive rules — §§8, 10, 14, 16, 17, 23 — [OBJECTIVE].**

Stale survivors include:

- “screen role” in cross-type paste and export validation ([lines 706, 838](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:706)).
- M7 assigns `role: .../screen` ([line 1503](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1503)).
- Stage 2 still builds paginated/view families ([line 1535](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1535)).
- Flow validation uses `screen → screen` and explicitly derives the rule from role families ([lines 2040–2042](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2040)).

Resolution: replace `screen` with the actual `ios`/`android` roles and delete every behavioral dependency on role families.

3. **The migration still treats `ios` as a document type — §§5, 8, 16, 18 — [OBJECTIVE].**

M2 maps 393×852 documents to `ios` ([line 1498](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1498)), while decision 9 says the module/document type is `mobile` and `ios` is a role ([line 1596](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1596)).

Resolution: M2 must assign `mobile`; M7 must assign `ios` to the qualifying frames.

4. **`type` and `module` are competing root-field names — §§5, 6, 10, 13, 17 — [OBJECTIVE].**

Every complete document example uses `type: "deck"` ([lines 369, 1152](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1152)), and export says “type implies format” ([line 832](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:832)). Stage 2 instead says “`module` at creation” ([line 1533](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1533)).

Resolution: choose one serialized field and use it throughout schemas, migrations, operations, and examples.

5. **“One document = one native target” is false for `mobile` — §§2, 8, 18, 24 — [OBJECTIVE].**

Decision 1 says one document has one native target ([line 1588](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1588)). A mobile document can contain both `ios` and `android` roles and emit SwiftUI and Compose ([lines 625, 2282–2309](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2282)).

Resolution: restate the invariant as either one module per document or one target per export role. It cannot remain “one target per document.”

6. **Unagreed node types return in Stage 8 — §§7, 17, 18, 20, 24 — [OBJECTIVE].**

The plan says `table`, `video`, and `lottie` are proposed but unagreed ([lines 400–403](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:400)), and the reversal table says they were removed because they are not node types ([line 1641](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1641)). Stage 8 nevertheless adds `table`, `image`, `video`, and `lottie` ([line 1572](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1572)).

Resolution: remove unagreed types from the build plan or add explicit settled decisions and complete schemas for them.

7. **`spread` remains in a reversal’s “Now” state — §18 — [OBJECTIVE].**

The reversal table says print/web changed to “`page`/`spread` vs `route`” ([line 1635](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1635)), even though decision 27 says `spread` is not a role ([line 1614](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1614)).

Resolution: the “Now” entry should be `page` versus `route`, with spread represented only by size/fold data.

8. **The `start`/`end` decision has not propagated and references a nonexistent migration — §§7, 13, 18, 25 — [OBJECTIVE].**

The text schema still uses `align: "left"` ([line 416](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:416)); most geometry examples retain `x`; current source properties include `left` and `right` ([openpencil-render-document.mjs:33](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-render-document.mjs:33)). Decision 32 says M-16 migrates 1,682 references ([CANVAS-ARCHITECTURE.md:1619](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1619)), but the migration table ends at M9, and 1,682 is the variable-reference count.

Resolution: define exactly which properties change—logical alignment, padding edges, absolute positioning, or all three—and add a real migration with measured counts.

## B. Claims contradicted by code or research

9. **The proposed variable schema is incompatible with the current schema — §§4, 7, 13, 16 — [OBJECTIVE].**

Current rendering expects each variable to be `{type, value}` and conditional entries to use `theme` ([openpencil-render-document.mjs:83–97](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-render-document.mjs:83)). The proposed deck stores each variable directly as an array of `{value, when}` ([CANVAS-ARCHITECTURE.md:1156–1161](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1156)). No migration covers:

- `themes` → `axes`.
- Node `theme` → axis selection.
- Variable `{type,value}` → direct cascade array.
- Cascade `theme` → `when`.

Resolution: specify one canonical variable/axis shape and add an explicit migration for all four changes.

10. **The rich-text examples contain invalid and incorrect ranges — §§7, 13, 25 — [OBJECTIVE].**

Examples are not internally executable:

- `"YOU RUN ${schoolName}. WE MAKE SURE IT GROWS."` is 45 UTF-16 units, but the paragraph ends at 47/46 ([lines 412–418, 1184–1186](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:412)).
- Its accent range `[8,24)` styles `"${schoolName}. W"`, not just the token.
- Speaker notes are 70 units but use `to: 74` ([lines 1190–1192](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1190)).
- The web headline is 45 units but uses `to: 46` ([line 1254](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1254)).
- `"Where the time goes"` is 19 units but uses `to: 20` ([line 2154](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2154)).
- The two “paragraphs” in §13.4 split inside the word `We` and leave a character uncovered ([lines 1265–1269](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1265)).
- `to: -1` is used without being specified ([lines 1221–1223](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1221)).

Resolution: define `[from,to)` invariants, newline/paragraph partition rules, sentinel policy, token-boundary behavior, and validate every example mechanically.

11. **The shipped CanvasKit version is 0.40.0, not 0.42.0 — §§19, 21, 25 — [OBJECTIVE].**

The plan treats 0.42.0 as its implementation baseline ([CANVAS-ARCHITECTURE.md:1801](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1801)). Canvas actually pins `canvaskit-wasm: 0.40.0` ([package.json:14](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/package.json:14)).

The listed hit-testing and run APIs do exist in the installed 0.40.0 types, but the version claim is wrong. Resolution: either target and test 0.40.0 or make upgrading to 0.42.0 an explicit prerequisite.

12. **The ICU question is already substantially answered by the shipped binary — §§19, 25.4 — [OBJECTIVE].**

Against the installed 0.40.0 WASM:

- `ParagraphBuilder.RequiresClientICU()` returns `false`.
- The binary contains ICU 74 data/symbols including `icudt74l`, bidi, break iterators, and CJK/Thai/Lao/Khmer break engines.

Resolution: Q25.4 should no longer ask merely whether ICU is present. The remaining measurement is a conformance corpus: Arabic shaping/bidi, emoji graphemes, and CJK/Thai line breaks rendered through the exact packaged WASM.

13. **D5 is already fixed and its example is now supported — §§4.9, 15 — [OBJECTIVE].**

The plan says `phosphor push-pin-fill` is unsupported and silently preserved ([CANVAS-ARCHITECTURE.md:1469](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1469)). Current tests explicitly compile that icon successfully with no issues ([openpencil-render-document.test.mjs:219–238](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-render-document.test.mjs:219)). Truly unsupported icons already produce an `icon` issue ([openpencil-render-document.mjs:549–555](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-render-document.mjs:549)), and writes return review issues ([document-review.mjs:3–7](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/document-review.mjs:3)).

Resolution: close D5 or replace it with a currently reproducible unsupported case.

14. **`slot` is not inert — §§4.5, 7.6, 16, 18 — [OBJECTIVE].**

The plan assigns M5 no risk because `slot` is supposedly inert ([CANVAS-ARCHITECTURE.md:1501](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1501)). The code maps slot-bearing components and their instances into `pencilSlotKind` ([openpencil-engine.mjs:137–168](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-engine.mjs:137)), and the vendor provenance explicitly says it draws Pencil slot semantics.

Resolution: measure all slot-bearing documents and render before/after removal. M5 is lossy unless equivalent output is materialized first.

15. **Undo is not “one Cmd-Z per agent operation” — §§18, 25.1 — [OBJECTIVE].**

The UI `Y.UndoManager` tracks `LOCAL_ORIGIN` and `ENGINE_ORIGIN`, not `REMOTE_ORIGIN` ([document-model.mjs:24–28](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/document-model.mjs:24)). Agent operations are received as remote updates by the editor, so they do not become a UI Cmd-Z entry. `documents.undo` is a separate backend operation using a stored inverse ([operations.mjs:226–248](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/operations.mjs:226)).

Additionally, the UI manager tracks `model.nodes` but not `documentFields`; future root variables, axes, and flows would not be covered.

Resolution: distinguish UI undo from durable agent-operation undo, and extend the UI manager if root changes must be undoable.

16. **The document uses Yjs, but rich-text collaboration is not already solved — §§18, 25.1, 25.6 — [OBJECTIVE].**

Strings and arrays are stored as atomic JSON values, not `Y.Text`/`Y.Array` ([pen-yjs-model.mjs:417–423](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/collaboration/pen-yjs-model.mjs:417)). Current text edits commit the whole `content` property ([openpencil-engine.mjs:423–437](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-engine.mjs:423)). Concurrent text, mark-array, paragraph-array, flow-array, and axis-mode-array edits are therefore not character/range-level CRDT operations.

Resolution: concurrency tests with two Yjs clients editing overlapping text and marks will settle the behavior. Supporting collaborative rich text requires a new Yjs representation or an operation-transform layer.

17. **Font rendering is only partially solved — §§18, 25.1, 25.3 — [OBJECTIVE].**

Current code configures Google and Fontsource only ([font-runtime.mjs:13–18](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/font-runtime.mjs:13)). It does not fetch SF Pro, Helvetica Neue, Segoe UI, or arbitrary purchased faces as decision 30 claims. Missing glyph coverage is not currently converted into consequences even though CanvasKit exposes `unresolvedCodepoints()`.

Resolution: separate “web-provider rendering works” from system/commercial font acquisition, glyph fallback, export embedding, and licensing.

18. **The export controller cannot use the browser’s IndexedDB font cache — §25.3 — [OBJECTIVE].**

The plan says PPTX export can embed face bytes because “we already hold” them in IndexedDB ([CANVAS-ARCHITECTURE.md:2380–2383](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2380)). `documents.export` is planned as a host/controller operation, while the font cache is created through browser `indexedDB` ([font-runtime.mjs:50–75](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/font-runtime.mjs:50)).

Resolution: define how the controller obtains exact face bytes—document font assets, a host font service, or its own cache.

19. **The filesystem conclusion is not established by the manifest — §§4.1, 10.1, 25.2 — [OBJECTIVE].**

The manifest indeed lists no filesystem permission ([penkra-app.json:21–31](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/penkra-app.json:21)). But the Node controller already opens arbitrary absolute image paths using `node:fs/promises` ([image-materialization.mjs:1–3, 111–139](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/image-materialization.mjs:111)), while the browser export path uses a user-selected directory handle ([pen-file-access.mjs:76–99](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/pen-file-access.mjs:76)).

Resolution: inspect or test the installed controller’s write policy. The manifest alone does not prove either arbitrary-write permission or prohibition.

20. **The proposed D4 fix is not a small structural-sharing change — §§4.7, 12.3, 17 — [OBJECTIVE].**

The script runtime serializes the whole document into QuickJS and receives the whole document back ([script-runtime.mjs:15–34, 331–332](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/script-runtime.mjs:15)). Object identity cannot survive that boundary, so there is no structural sharing available for the comparison at [operations.mjs:130](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/operations.mjs:130).

Pre-inspection is also serialized into QuickJS before execution, so genuinely lazy bounds/problems require a host callback bridge or a changed operation protocol.

Resolution: benchmark alternatives such as a mutation log, state hash, host-backed lazy inspection calls, or separate read/write execution modes. Stage 0 currently understates a runtime-protocol redesign.

21. **“Spill removes the ceiling” is false — §§4.6, 12.2, 17, 22 — [OBJECTIVE].**

Even with host response spilling, limits remain inside QuickJS:

- 16 MiB input and output ([script-runtime.mjs:4–5](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/script-runtime.mjs:4)).
- 64 MiB heap ([line 29](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/script-runtime.mjs:29)).
- 1,000 prints.
- 10,000 touched IDs/issues/inspection items.
- The complete output document is always serialized.

Visitor `Get` also constructs the complete matches array and all contexts before invoking the visitor ([lines 165–176](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/script-runtime.mjs:165)).

Resolution: spilling addresses only the outer tool response. Unbounded traversal requires streaming visitation or a non-QuickJS query path.

22. **The “deck never loads grid machinery” module argument contradicts the shipped bundle — §§5, 21, 23 — [OBJECTIVE].**

The app imports one 96,164-line engine bundle. That bundle contains the Yoga Grid implementation, and deck documents load the same engine. The current build has no per-document engine chunks ([scripts/build.mjs:30–68](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/scripts/build.mjs:30)).

Resolution: either remove bundle-size isolation as a reason for modules or define actual dynamic package/chunk boundaries.

23. **The hard-fork cost is understated — §§21.4, 23.3 — [OBJECTIVE].**

The plan concludes there is “no new build infrastructure beyond what `bun build` already does” ([CANVAS-ARCHITECTURE.md:2109–2111](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2109)). Its own research says a source fork owns the upstream workspace, lockfiles, dependency updates, CI, build/release tooling, notices, synchronization, and tests ([openpencil-fork-analysis.md:151–175](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/openpencil-fork-analysis.md:151)). The current Canvas build script does not build the six OpenPencil packages; regeneration is a separate manual process ([vendor README:13–23](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/vendor/open-pencil/README.md:13)).

Resolution: estimate source import, patch reconstruction, 46 behavior tests, CI, dependency pinning, and upstream-diff workflow as explicit work.

## C. Capability-table defects

24. **Grid and wrap are wrongly `raster` for PPTX — §§9, 14, 21.2, 24.1 — [OBJECTIVE].**

This is the highest-value table error. PPTX has no layout engine, but that does not require rasterization. Canvas/Yoga computes child rectangles; the exporter writes those child shapes at resolved EMU coordinates. The research explicitly says export must compute layout first ([pptx-capabilities.md:35](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:35)).

The plan itself says layout resolves to absolute geometry for deck/print ([CANVAS-ARCHITECTURE.md:505–506](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:505)), then contradicts that by rasterizing grid containers.

Resolution: layout properties compile away. Verdicts belong on resulting visual properties, not on whether the source used flex, wrap, or grid.

25. **`frame` is missing from every node table — §§9, 24 — [OBJECTIVE].**

Role-bearing export units and almost every layout container are `frame`, yet node maps list `group` and `ref` but not `frame` ([lines 727–731, 2193–2194, 2243–2244, 2299–2300](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:727)).

Resolution: add `frame` and state whether it emits a group, emits only its children, or becomes a picture when container-level compositing requires isolation.

26. **The table has no default or completeness rule — §§9, 24 — [OBJECTIVE].**

Only a handful of properties are listed. Missing entries include ordinary fills, strokes, opacity, clipping, rotation, image crop modes, angular gradients, font weight, font features/variations, word spacing, line height, overflow, paragraph alignment/direction, language, alt text, and flow transitions.

Without a declared default, an omitted entry can silently mean anything—the exact unfounded-assertion failure §24 warns about.

Resolution: require exhaustive schema-generated coverage or define a mechanically enforced default such as “unknown = error during capability-table validation.”

27. **`ref: native` violates the plan’s own native definition — §§7.6, 9, 24 — [OBJECTIVE].**

`native` means the object remains live/editable in the target ([CANVAS-ARCHITECTURE.md:751](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:751)). PPTX has no arbitrary component-instance object; masters/layouts are not general components ([pptx-capabilities.md:184–192](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:184)). HTML, SwiftUI, and Compose exporters may similarly inline the resolved children instead of preserving a component definition.

Resolution: the capability mechanism needs a “compile/lower while retaining editable children” concept distinct from both `native` and `raster`, or the definition of `native` must explicitly permit loss of source abstraction.

28. **The deck effects rows contradict OOXML — §§9, 21.2, 24.1 — [OBJECTIVE].**

The example table marks `effect.blur` as `raster` ([CANVAS-ARCHITECTURE.md:738](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:738)). DrawingML natively defines `a:blur`, along with `outerShdw`, `innerShdw`, `glow`, and `softEdge` ([pptx-capabilities.md:164–176](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:164)). §24 then lists shadow/glow but omits blur, inner shadow, and soft edge.

Resolution: make the five supported effect types and their parameter boundaries explicit. Separately record which require direct OOXML because PptxGenJS lacks public APIs.

29. **The deck blend verdict is too coarse and its explanation is false — §§9, 21.2, 24.1 — [OBJECTIVE].**

The table says OOXML has “no blend model” ([CANVAS-ARCHITECTURE.md:2142](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2142)). OOXML has limited effect-graph `a:blend` with exactly `over`, `mult`, `screen`, `darken`, and `lighten`; it is not a general per-shape blend property ([pptx-capabilities.md:25, 178](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:178)).

Resolution: verdicts must vary by blend value and composition context. Unsupported values rasterize; supported effect graphs still require custom OOXML.

30. **Angular/conic gradient is absent from the deck table — §§4.9, 24.1 — [OBJECTIVE].**

Current Canvas explicitly renders linear, radial, and angular gradients, but DrawingML has no conic/angular gradient element ([pptx-capabilities.md:150–162](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:150)). §24 mentions only linear, radial, and mesh.

Resolution: add angular/conic gradient as `raster` for deck unless approximated by a picture.

31. **PPTX text capabilities need per-property verdicts — §§7.2, 21.2, 24.1 — [OBJECTIVE].**

OOXML supports many run properties, but not every CanvasKit text property:

- Numeric variable-font axes and arbitrary OpenType feature settings do not map to `a:rPr`.
- Numeric font weights are not a generic run property; the exporter must select a concrete font face, while `b` is only a bold flag.
- `wordSpacing` has no equivalent general run property.
- CanvasKit foreground/background paints can exceed DrawingML’s supported character fills.
- Exact Skia shaping/line breaks are not encoded as glyph positions.

Evidence: exact `a:rPr` boundary ([pptx-capabilities.md:84–103](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:84)) versus CanvasKit `TextStyle` fields ([yoga-skia-capabilities.md:218–244](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/yoga-skia-capabilities.md:218)).

Resolution: enumerate every proposed mark and paragraph property in the deck table.

32. **Appearance is not generically native in PPTX or PDF — §§7.3, 9, 24 — [OBJECTIVE].**

Deck and print tables mark `appearance` as `native` ([CANVAS-ARCHITECTURE.md:726, 2183](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2183)). A PPTX/PDF cannot dynamically switch a Canvas light/dark mode according to OS appearance. A PowerPoint theme is not an arbitrary conditional axis.

Resolution: define export-time axis selection, multiple-artifact generation, or explicit dropping of inactive modes. The export request currently has no axis-mode field.

33. **Document-type-keyed consequences fail for mobile — §§9.3, 18, 24.4 — [OBJECTIVE].**

The plan says consequences are keyed on document type, not the containing role ([CANVAS-ARCHITECTURE.md:785–786](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:785)). But `fill.gradient.mesh` is explicitly native for `ios` and raster for `android` inside the same mobile document ([lines 2306, 2344–2345](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2306)).

Resolution: capability evaluation must identify the containing export role and selected target version, including through refs.

34. **A single PPTX cannot contain arbitrary per-slide sizes — §§8.2, 24.1 — [OBJECTIVE].**

The plan permits sizes independent of roles and therefore allows differently sized slide frames in one export ([CANVAS-ARCHITECTURE.md:672–674](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:672)). PowerPoint slide size is presentation-wide, not per slide.

Resolution: require all selected slide frames to resolve to one slide size, or split them into separate decks.

35. **The print table contains unverified capabilities and schema inventions — §24.2 — [OBJECTIVE].**

Unverified assertions include:

- Directly mapping Canvas mesh gradients to PDF type 6/7 shadings.
- `clip.mask`, spot colors, and CMYK as native despite no proposed color-space/mask schema.
- “PDF/X-4 forces CMYK” ([line 2227](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2227)); this is too broad because PDF/X-4 supports color-managed workflows, not only device CMYK.
- Treating PDF/A-3, PDF/X-4, PDF/UA-1, and `none` as one capability table even though conformance requirements differ.

Resolution: research the exact PDF writer/backend and validate each row against generated files using veraPDF and an appropriate PDF/X preflight. Add profile as a capability dimension.

36. **The export API cannot select a declared PDF profile — §§10, 24.2 — [OBJECTIVE].**

The print module lists four profiles ([CANVAS-ARCHITECTURE.md:2183–2185](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2183)), but export forbids a format parameter and defines no `profile` parameter.

Resolution: add a profile selection to the request or make one profile the module’s fixed output and model others as conversions.

37. **Mobile `native` verdicts ignore platform/API-version boundaries — §24.4 — [OBJECTIVE].**

Examples:

- iOS mesh gradient requires iOS 18+, but §23.1 says Canvas owns no deployment target.
- SwiftUI wrap requires an emitted custom `Layout`.
- Compose and SwiftUI grid APIs do not implement the complete CSS Grid track/span algorithm.
- Backdrop blur, blend modes, masks, and skew have different and version-dependent semantics across SwiftUI and Compose.
- Arbitrary viewport thresholds can in fact be expressed with SwiftUI geometry/container logic and Compose constraints; “no honest translation” is a product position, not a technical impossibility.

Resolution: expand verdicts by role, minimum SDK, property value, and whether a helper runtime is required.

38. **The definition of `native` does not work across PDF and source targets — §§9.1, 24 — [DECISION].**

“Live, editable object” is meaningful for PowerPoint, but not consistently for PDF, HTML/CSS source, SwiftUI source, or Compose source. A PDF text object is searchable but not a source-level paragraph; emitted source may be editable text while losing Canvas component identity.

Forks:

- Define `native` as visual/semantic expressibility, accepting loss of source abstraction.
- Define target-specific preservation dimensions such as visual, textual, structural, interactive, and editable.

The first keeps tables simple but hides losses; the second is more precise but expands the policy model.

39. **The raster-scope rule is not compositing-correct — §9.4 — [OBJECTIVE].**

Simple bounds overlap is neither necessary nor sufficient:

- Ordinary overlapping siblings can stay separate while preserving z-order.
- Backdrop blur, blend modes, masks, ancestor clips, group opacity, and filters can depend on pixels outside the subtree even when bounds logic says otherwise.
- Ref expansion and effects can make visual bounds depend on external resources.

Resolution: scope rasterization by isolated compositing/stacking context and dependency graph, not geometric overlap alone. Test with blend, backdrop blur, ancestor clip, group opacity, and masked siblings.

## D. Missing architecture

40. **There is no exporter intermediate representation — §§9, 10, 21.4, 25.7 — [DECISION].**

The plan alternates between exporters reading:

- Canonical model semantics.
- Resolved scene-graph geometry.
- Prepared render nodes.
- Rasterized subtrees.

Those contain different information. Prepared render data can lose components, variables, marks, axes, and provenance; the canonical model lacks final geometry. §25.7 merely says the intermediate should be inspectable ([line 2450](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2450)).

Forks:

- A semantic export IR containing resolved geometry plus source semantics/provenance.
- Per-exporter direct traversal of model and graph.

The IR costs design work but centralizes capability checking, raster scope, assets, and diagnostics. Direct traversal starts faster but duplicates resolution rules.

41. **Native editability and exact visual fidelity are mutually unresolved — §§1, 2, 14, 21.2, 25.7 — [DECISION].**

US-1 claims the font matches because one engine performed layout and every symptom is structurally impossible ([CANVAS-ARCHITECTURE.md:1330–1334](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1330)). The research says PowerPoint reshapes and line-breaks editable text itself; embedded fonts reduce substitution but do not make Skia and PowerPoint metrics identical ([pptx-capabilities.md:257–271](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:257)).

Forks:

- Preserve editable text and accept measured rendering tolerances.
- Insert hard line breaks/adjust boxes to improve initial fidelity while altering natural reflow.
- Rasterize or outline only text that fails tolerance, losing editability/searchability.

The plan promises all three benefits simultaneously without choosing.

42. **PptxGenJS cannot satisfy the deck table alone — §§17, 21.2, 24.1 — [OBJECTIVE].**

PptxGenJS 4.0.1 lacks general native-gradient and nested-group APIs and does not expose blur/glow/soft-edge, effect DAGs, transitions, or animations ([pptx-capabilities.md:232–255](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:232)). The Trusted Partners deck contains a gradient, yet Stage 3 promises zero rasterization.

Resolution: direct OOXML manipulation is required from Stage 3, not only later for flows. Generate the flagship deck, unzip it, inspect shape XML, and render it in both PowerPoint and LibreOffice.

43. **Speaker-note adjacency is an undefined heuristic — §§8.3, 10, 13, 14 — [OBJECTIVE].**

The exporter is told “no heuristics, ever” ([CANVAS-ARCHITECTURE.md:828](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:828)), but notes are discovered by geometric adjacency to a slide ([lines 709–712](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:709)). Multiple nearby text nodes, moved slides, and reordered frames make that ambiguous.

Resolution: add an explicit relationship such as `notesFor`, or a slide-owned non-rendering association while keeping the text visually displayed outside the frame.

44. **The flow model cannot represent click targets — §§7.7, 20, 23.2 — [OBJECTIVE].**

A flow connects frame `from` to frame `to`, but the stated web/mobile use case is a button navigating between screens. No node identifies which button owns the trigger. PPTX hyperlinks also attach to runs/shapes, not the source slide frame.

Resolution: define a trigger source node or action reference, plus validation for deleted nodes, refs, duplicate actions, and destination roles.

45. **Component expressions, cycles, and namespaces have no design — §§7.3, 7.6, 13.2 — [OBJECTIVE].**

Examples introduce expression strings such as `$props.icon != null` ([CANVAS-ARCHITECTURE.md:574](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:574)) but no grammar, type checker, dependency graph, cycle handling, or safe evaluator. A library component supposedly cannot see document variables, yet the component example references document-level paragraph style names like `eyebrow` and `slide-title`.

Resolution: specify a non-eval expression AST/grammar, typed validation, cycle errors, and namespaces for component-local versus document-level variables/styles.

46. **Observed component-ness creates unresolved semantic cases — §7.6 — [DECISION].**

“A frame becomes a component when referenced” means a visible artboard can unexpectedly become a reusable definition, references may form cycles, and deleting the last reference changes whether the source is treated as a component. The React/Vue analogy is factually weak: those systems still explicitly declare component functions/templates.

Forks:

- Keep explicit component declaration, accepting authoring friction.
- Infer component status but define source visibility, lifecycle, cycle prohibition, and export semantics.
- Treat refs as generic aliases without promoting sources to masters/classes.

47. **The unit and color systems are missing — §§7.4, 8.2, 10, 24 — [OBJECTIVE].**

Deck uses 1920×1080 unitless coordinates; print uses point-like A4 dimensions; PPTX requires EMUs; image-resolution checks require physical inches; web/mobile use logical pixels/points. No conversion invariant is specified.

Likewise current colors are mostly sRGB hex strings, while the print table invents CMYK and spot-color capabilities without a color-space/ICC model.

Resolution: define canonical units, physical-size conversion, pixel density, rounding tolerances, color-space values, ICC/output intents, and how gradients/images cross those boundaries.

48. **Font embedding is not designed or verified — §§18, 25.3 — [OBJECTIVE].**

PPTX font embedding is more than naming a face: it requires embedded-font package parts/relationships, appropriate font data/obfuscation, font-face mapping, and respect for embedding permissions. PptxGenJS has no established public font-embedding path in the cited comparison. Cached web fonts may also be WOFF2 subsets, not suitable PowerPoint font parts.

Resolution: generate a minimal deck with an embedded TTF/OTF, inspect `ppt/fonts`, reopen on a machine without the font, and inspect OS/2 `fsType` restrictions. Until that passes, decision 30 is an unsupported assertion.

49. **Accessibility requires more than the four bullets in §25.5 — §§24, 25.5 — [OBJECTIVE].**

Missing model requirements include:

- Explicit decorative-object state.
- Document and run language.
- Reading order for PPTX as well as PDF/HTML/mobile.
- Landmark/group semantics.
- Link purpose and focus order.
- Table headers/associations if tables are later added.
- Image-fill alt text on the owning shape, since current images are fills rather than nodes.

Current image storage proves the distinction: image objects occur inside fills ([image-materialization.mjs:88–96](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/image-materialization.mjs:88)).

Resolution: define a cross-target semantic/accessibility schema before PDF/UA and web/mobile export.

50. **Versionless clean-cut migrations are unsafe with offline CRDT clients — §§6, 16, 25.1 — [DECISION].**

The current parser already requires serialization `version: "2.15"` ([blank-document.mjs:3–7](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/blank-document.mjs:3)). The new plan removes versions while documents can exist in IndexedDB, shared accounts, imports, stale tabs, and rolling app deployments.

Forks:

- Persist a schema version and deterministic migrations.
- Use capability/feature detection with idempotent normalization.
- Require an atomic server migration plus minimum-client enforcement and invalidate stale offline states.

A deploy-time one-shot migration alone cannot distinguish or safely merge old client writes.

51. **Removing current semantic node types has no migration — §§7.1, 16, 18 — [OBJECTIVE].**

The new vocabulary removes `script`, `note`, `context`, and `prompt`. Current code actively renders/compiles all four ([openpencil-render-document.mjs:133–169](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-render-document.mjs:133)), and the plan’s census reports 25 script nodes. No M-step materializes script output or preserves ordinary note/context/prompt content.

Resolution: census each type, define deterministic materialization, preserve source/provenance if required, and test dynamic scripts whose output depends on inputs/time/mouse.

52. **The PNG/SVG “one raster function” claim conflates two different exporters — §§8.1, 14 — [OBJECTIVE].**

The plan calls PNG/SVG a function that renders a subtree “to pixels” ([CANVAS-ARCHITECTURE.md:631–634](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:631)). SVG is vector markup, not pixels. Current screenshot code emits PNG only ([document-screenshot.mjs:133–145](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/document-screenshot.mjs:133)). US-8 also invokes an eliminated `image` target while format is supposedly never a parameter.

Resolution: distinguish raster subtree rendering from standalone PNG export and SVG serialization, and define how PNG versus SVG is selected.

53. **Source-output cardinality is inconsistent with helper files and assets — §§8.2, 10, 23.1, 24.4 — [OBJECTIVE].**

Roles claim route/iOS/Android are 1 frame → 1 file ([CANVAS-ARCHITECTURE.md:652–654](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:652)). Web output already includes HTML, CSS, and assets. MOB-1 requires helper source files. The export request accepts a single `destination` path but does not define directory outputs, filenames, imports, collision handling, or manifests.

Resolution: specify an artifact bundle/directory contract and make cardinality refer to bundles rather than files.

## E. Sequencing and cost

54. **Stage 3 cannot retire the flagship defect before Stage 4 — §17 — [OBJECTIVE].**

The original failure requires one rich-text node with styled character ranges. Stage 3 promises 40 editable decks and retires §1.1, but rich text does not arrive until Stage 4 ([CANVAS-ARCHITECTURE.md:1539–1550](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1539)).

Resolution: move the minimum marks/paragraph/run implementation before the Stage 3 acceptance gate or narrow Stage 3’s promised outcome.

55. **Stage 2’s gate depends on Stage 7 — §17 — [OBJECTIVE].**

Stage 2 requires setting a grid on a slide and receiving a raster consequence ([line 1537](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1537)). Grid schema/model exposure is deferred to Stage 7. Current compatibility code rejects `layout: "grid"` as unsupported ([openpencil-engine.mjs:305–310](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-engine.mjs:305)).

Resolution: move grid exposure earlier or use an already-supported property to test the consequence channel.

56. **Stage 3 either duplicates legacy component support or secretly depends on Stage 6 — §17 — [OBJECTIVE].**

Existing decks use `ref` plus `descendants`. The new component interface and M4 migration arrive in Stage 6, after deck export. Therefore Stage 3 must either implement legacy descendant overrides and later replace them, or cannot export existing documents correctly.

Resolution: put component migration/resolution before deck export, or explicitly budget temporary legacy export support.

57. **The hard fork has no build stage — §§17, 18, 23.3 — [OBJECTIVE].**

Decision 22 makes the source fork foundational, but no stage imports upstream source, reconstructs 46 patches, establishes tests, or switches the build. Stage 7 merely exposes layout.

Resolution: add a fork-foundation stage before changes that modify scene, text, layout, or editor internals.

58. **Stage 4 assigns work to a PDF exporter that does not exist yet — §17 — [OBJECTIVE].**

Stage 4 includes mark-to-run flattening “in the PPTX and PDF exporters” ([CANVAS-ARCHITECTURE.md:1548](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1548)); the PDF exporter is deferred to Stage 8.

Resolution: Stage 4 should implement shared run normalization plus PPTX mapping. PDF mapping belongs with the PDF exporter.

59. **Stage 8 is several independent programs, not one shippable stage — §17 — [OBJECTIVE].**

It combines:

- PDF, including A/X/UA conformance.
- HTML/CSS generation.
- SwiftUI generation.
- Compose generation.
- Four new node types.
- Flow rendering.
- Asset/helper packaging.
- Accessibility requirements.

This contradicts “each stage is shippable” and the document’s admission that PDF/SwiftUI/Compose exporter design is absent.

Resolution: split Stage 8 by exporter and give each a schema, writer/backend, fixtures, validator, version matrix, and acceptance gate.

60. **The fidelity QA plan is too weak for the central promise — §§1, 14, 25.7 — [OBJECTIVE].**

LibreOffice headless alone cannot establish PowerPoint fidelity, and visual inspection alone will not verify editability, reading order, embedded fonts, notes, hyperlinks, or profile conformance.

Resolution: define a golden corpus and automated checks:

- Unzip/XML assertions for object structure.
- PowerPoint and LibreOffice rendering comparisons.
- Font-absence reopening test.
- Editable text/run verification.
- Notes/link/alt-text assertions.
- veraPDF/PDF-X preflight.
- Web browser matrix.
- Swift/Android compilation against declared minimum SDKs.

The most urgent corrections are findings 24, 15–18, 27, 31, 40–42, and 54–59. Those change the architecture or critical path; the rest are mostly propagation and specification repairs.
