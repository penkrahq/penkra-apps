# Canvas — Typed Documents, Rich Text, and File-Format Export

> **Status.** Historical architecture specification and evidence, not an executable plan. The
> clean-cut correction in §28 supersedes every earlier statement about Canvas schema versions,
> write handshakes, automatic migration, manifests, sequence-fenced census gates, and ambiguous
> migrations refusing to run.
> **Revision 4** incorporates all 60 findings of
> `research/architecture-review-1.md` (§26) *and* all 60 of the second-pass audit
> `research/architecture-review-2.md` (§27). Its full scope was authorized for implementation when written.
> **Decisions are NOT settled unless §0 marks them Agreed or Derived.** §0 is the provenance
> register and overrides any confidence expressed elsewhere in this document; §19 lists what was
> already known to be open, §26 and §27 record what each review round changed.
>
> **Revision 4's governing instruction was "less is more, consistency."** Where revision 3 answered
> a gap by inventing a mechanism, revision 4 answers it by deleting the gap. The invented `image`
> node is gone. The five-token verdict vocabulary is three again. Physical-unit dualism is gone.
> `p:sldLayout` reuse is gone. Nothing here is precise about pixels that we have not yet measured;
> anything unmeasured is `raster` until a test says otherwise, which is the simple, consistent and
> honest answer.
> `research/implementation-progress.md` is the current gate ledger; the ignored local `TODO.md`
> contains the reconciled paused remainder. Stage prose and review dispositions below preserve rationale and must
> not be treated as an additional backlog. `TODO.md` remains the only authoritative executable plan.
>
> **Everything in §4 is grounded in the live system** — read from source, or from the user's own
> documents through `documents.execute`. Everything else is design. The two are kept apart on
> purpose, because the most expensive errors in this discussion came from asserting design as if it
> were grounded.
## 0. Provenance

**Why this section exists.** The header above used to say *"Decisions are settled unless marked
OPEN."* That was false, and it was false in a way that was invisible. Much of this document was
written by the assistant thread to fill a gap in the argument, in the same voice and with the same
confidence as the parts the user actually decided. Nothing distinguished the two, so an
implementing agent had no way to tell a settled decision from an unreviewed invention.

**How this was determined.** Every user message across the three transcripts of this discussion was
extracted into a single corpus (148 messages, ~139 KB) and probed section by section. A section is
only marked *Agreed* where a user message decides it. Two failure modes were found and corrected
for:

1. **Changelog echo.** The assistant would summarise a newly written section back to the user; the
   user would quote that summary while asking about something else. Searching the corpus finds the
   section name inside a user message and scores it as agreement. It is not. §10.3 and §9.5 both
   failed this way — their only corpus hits are the assistant's own changelog quoted back.
2. **Question mistaken for decision.** *"How do we resolve this?"* and *"Whatever's objectively
   better"* are the user opening a question, not closing one.

**The verdicts.**

| Verdict | Meaning | What an implementing agent should do |
| --- | --- | --- |
| **Agreed** | A user message decides it. | Build it. |
| **Derived** | Follows necessarily from an Agreed decision, or is read from source/prior art rather than chosen. | Build it. Flag it if the derivation looks wrong. |
| **Written, not discussed** | The assistant wrote it. No user input exists. | **Do not build. Ask first.** |
| **Contradicted** | The user argued against it and it is still in the document. | **Do not build.** Slated for deletion. |
| **Superseded** | Overtaken by a later decision. | **Do not build.** Slated for deletion. |

### 0.1 Section register

| § | Section | Verdict | Note |
| --- | --- | --- | --- |
| Invariants | Product invariants | Agreed, except #26 | #26 names `documents.export-image`, which is deleted. |
| 1 | The problem | Derived | Retrospective on grounded events. |
| 2 | Principles | Agreed | "LESS IS MORE", WYSIWYG, no false hope, standards over heuristics are all user-stated. |
| 3 | Strategy | Agreed | Includes 3.1, the engine question. |
| 4 | Grounded facts | Derived | Read from source and from the user's real documents. Verify by re-reading, not by asking. |
| 5 | Product decomposition | Derived | |
| 6 | Document model — root | **Superseded** | Schema versions, write handshake, quiesce, minimum-client gate. Killed by "we DO NOT need to version anything… no legacy, and fine migrating even if lossy." §28 already says this; the section body was never cut. |
| 7.1 | Vocabulary | Derived | |
| 7.2 | Text — content plus marks | Agreed | Extensively discussed; offsets, partition rule, sentinel ban. |
| 7.3 | Axes | **Written, not discussed** | One corpus hit, and it is the assistant's own field list quoted back. Themes/states/variants/breakpoints unified into one mechanism was never put to the user. |
| 7.4 | Layout | Derived | Grounded in §21.1 — grid is already ours. |
| 7.5 | Variables and tokens | Agreed in principle, **open in shape** | The DTCG-vs-homegrown question was answered *"Whatever's objectively better"* — a research instruction, not a decision. Shape unsettled until researched. |
| 7.6 | Components — the `imports` surface | **Written, not discussed** | The single largest unreviewed mechanism in the document. Two corpus hits: one is the assistant's field list quoted back, one is the unrelated Pencil-import decision. Designed for one story (a pinned read-only vendor library) and then left as the general mechanism. See §0.2. |
| 7.7 | Flows | Derived, scope withdrawn | §23.2 withdrew the scope; 36 flow rows remain unverified. |
| 8.1 | The four modules | Agreed, with amendments | Four modules agreed. Amended in discussion: add `module: "generic"` for freeform work; module settable later while no role-bearing frames exist; no fifth `asset` module (the user's objection — an asset module guarantees assets can never live beside what uses them — is correct and decisive). Any mention of `documents.export-image` here is deleted. |
| 8.2 | Roles and sizes | Agreed | Amended: **a page is simply a frame that declares a real-world `physical` size.** That is the whole test. Arbitrary physical sizes already work in code; `physicalFor` no longer exists. |
| 8.3 | What the type constrains | Derived | |
| 9 | The capability table | Agreed | |
| 9.1 | Three verdicts | Agreed | Five collapsed to three under "less is more". |
| 9.2 | Completeness — must be total | Agreed | 140 unverified rows (36 flow / 103 mobile / 1 PDF/X-4). The user's instruction is that these get *completed*, using whatever tooling exists — not deferred. |
| 9.3 | `consequences` channel | Derived | |
| 9.4 | The raster scope rule | Agreed, but **misapplied** | The rule is sound. Its application to `nodes.path`, `nodes.polygon`, `properties.geometry`, `properties.viewBox` and `properties.fillRule` is a defect, not a decision: those rows are `raster` in all six targets *including SVG*, justified as "no measured native emission" — unimplemented, not impossible, and contradicted by our own `research/pptx-capabilities.md`. |
| 9.5 | `export: "live" \| "image"` | **Written, not discussed** | **Zero corpus hits.** No user message anywhere mentions this field. |
| 9.6 | Where constraints bind | Derived | |
| 10.1 | Export shape | Agreed | |
| 10.2 | The artifact is a bundle | **Written, not discussed** | Only reaches the corpus as changelog echo. |
| 10.3 | The exporter IR | **Written, not discussed** | Same. The user's only substantive engagement was *"What's IR work?"* — asking what it is. Note also the vocabulary collision the user did flag: `capabilityTableFor(request.capability ?? request.role, …)` conflates role, target and capability. That naming must be settled before this is built. |
| 10.4 | Templating | **Written, not discussed** | Eleven corpus hits for "template", every one of them from the unrelated school-deck production work. |
| 10.5 | The export report | Derived | |
| 10.6 | Presentation is a target, not a mode | Derived | |
| 10.7 | Import | **Written, not discussed** | Same status as 7.6. |
| 11 | Agent surface | Derived | |
| 12.1 | A job surface | Agreed | *"Good point, we'd probably have to include this id…"* |
| 12.2 | Spills | Agreed | User-originated — the user raised spills, citing the borge repo. Also user-decided: *"Export obviously cannot use the spill mechanism, controllers can write to the filesystem directly."* |
| 12.3 | Canvas-side performance | Derived | |
| 12.4 | Penkra host defects observed | Derived | Grounded observations. Add the tab-visibility finding: retained hidden tabs cannot be observed semantically, contradicting `penkra tabs --help`. |
| 12.5 | Root causes for §12.4 | Derived | |
| 12.6 | What `parentThreadId` governs | **Contradicted** | The user's words: *"What's parentThreadId used for other than this? I don't think it should matter. All threads are equal."* The section survives in the document anyway. Delete on prune. |
| 13.1–13.5 | Shapes | Derived | Illustrations of decisions made elsewhere; inherit their sections' verdicts. 13.5 (print page with bleed) is sound. |
| 14 | User stories | Mixed | Most are Derived illustrations. **US-8 (Exporting one slide) is superseded** — its shape assumes `documents.export-image`. **US-15** ("a component the library does not expose enough of") presumes the unreviewed §7.6 import model and inherits its verdict. |
| 15 | Defect register | Derived | Grounded. |
| 16 | Migration | **Superseded** | Migration manifests and the `sourceSequence` pin are deleted. Lossy migration is explicitly acceptable. |
| 17 | Sequenced build plan | Superseded as a plan | The header already says `TODO.md` is the only authoritative executable plan. Stage prose is rationale, not backlog. |
| 18 | Decision log | Agreed / Reversed as marked | The most trustworthy section in the document — but it does not cover everything above, which is why this register exists. |
| 19 | Open questions | Agreed | Incomplete: it does not list the items this register newly marks unreviewed. |
| 20 | Deferred | Agreed | |
| 21 | Research findings | Derived | Grounded research. 21.2 in particular *contradicts* §9.4's path rows. |
| 22 | Q10 — the `descendants` census | Derived | Measured. |
| 23 | Three questions closed | Agreed | 23.1 platform targets emit source; 23.2 flows scope withdrawn; 23.3 one owned fork. |
| 24 | The four modules, in full | Derived | The capability tables themselves. Subject to 9.2 and 9.4 above. |
| 25 | The foundations audit | Derived, one **open** | 25.2 explicitly flags the export-file *permission* as unsettled. 25.4 text direction carries one decision. |
| 26 | Review disposition — first pass | Derived | Historical record. |
| 27 | Review disposition — second pass | Derived | Historical record. |
| 28 | Clean-cut correction | Agreed | Supersedes §6 and §16. |
| 29 | Pencil file-compatibility deletion | Agreed | User's words: Pencil compatibility is irrelevant to us; breaking `.pen` import is acceptable in favour of a clean overall solution. |

### 0.2 The `imports` surface — what is actually unreviewed

§7.6 and §10.7 were written for a single story: importing a pinned, read-only vendor library such
as the Apple HIG. Everything that assumes a *living shared library* is either missing or inverted.
Read from source:

- **The pin is a CRDT sequence number.** `canvas-imports.mjs:39` computes `version` from
  `snapshot.throughSequence` and update sequences. That number increments on every keystroke, so
  `pin: "exact"` breaks on the next edit to the source. This is the same error as the deleted
  migration-manifest `sourceSequence` pin, made twice.
- **Cross-document refs skip every validation.** In `canvas-schema.mjs`, `validateRefs` and the
  cycle, containment and missing-target checks are all gated on the ref being *unqualified*
  (`!node.ref.includes(":")`). A qualified cross-document ref is checked by nothing.
- **Styling resolves in two directions at once.** `canvas-resolver.mjs` resolves variables from the
  **source** document (line 105) and paragraph styles from the **consumer** (line 6).
- **No module check**, no pruning, no deduplication of a diamond import, and no reverse dependency
  lookup — so nothing can answer "who imports this?" before a delete.
- **Documents are Account-owned, not Space-scoped.** `canvas documents list` returns
  `ownerAccountId` and `access`; there is no `spaceId` on a document. A foreign-key-style
  pre-delete check therefore cannot see importers in another account.

These are recorded for Decks as findings, **not** as work to start.

### 0.3 How to prune this document

Delete, do not rewrite: §6, §16, US-8, §12.6, invariant #26, every mention of
`documents.export-image`, and svg-as-a-seventh-target. For each **Written, not discussed** section,
either put the decision to the user or delete the section — do not leave it in place with the mark
attached, because the mark decays into background noise the moment there is more than a handful.

---

### 0.4 Decisions taken after the provenance pass

These were discussed with the user and are **Agreed**. They supersede the sections they touch.

**DEC1 — `print` is deleted as a module.** Every constraint it carried is per-frame, not
document-level. `deck` survives because PowerPoint imposes a document-global fact (one slide size
for the entire file); `print` had no equivalent. What remains:

| Was | Becomes |
| --- | --- |
| `module: "print"` | deleted |
| `role: "page"` | deleted — a page is a frame that declares `physical` |
| `physical` | frame property, drives real PDF page size |
| `bleed` | frame property, emits real BleedBox and TrimBox |
| `folds`, `safeMargin` | advisory authoring guides, any module, emit nothing |
| PDF/X-4 profile | a flag on extraction, not a module |
| A4 / Letter presets | blank-document presets, no module needed |

Roles reduce to `slide | route | ios | android`. The `page` capability table and
`PAGE_PROFILE_DELTAS` dissolve, retiring the 1 unverified PDF/X-4 row; the 36 flow and 103 mobile
rows are untouched. Affects §8.1, §8.2, §13.5, §24.2, invariants, §9.

The deciding example was the user's: there is no observable difference between a poster in `print`
and a poster in `generic`. The real distinction is whether the frame declares `physical`.

**DEC2 — Fold marks demote to guidance.** A shop given the finished size and a job ticket knows where
to fold; fold marks matter only for complex folds, and the thing that actually matters there —
panel widths, since a roll fold needs its inner panel 2–3mm narrower — is an authoring concern the
agent handles when placing content. `bleed` does **not** demote: bleed is artwork that must
physically exist past the trim line, and guillotine tolerance is not advisory.

**DEC3 — PDF is an extraction format, and extraction is multi-unit.** PDF's primitives are
essentially our node model, so extraction to PDF is vector, with text and embedded fonts, and needs
no role or capability table. `documents.extract` takes N nodes; the destination decides the artifact
count. A file destination with several nodes is legal only where the format holds several units,
which `pdf` does and `png`/`svg` do not. This removes the reason `svg` sat in `CAPABILITY_TABLES` as
a seventh peer of `slide` and `page` — it was misfiled as a target. Specified in
`operations/documents.extract.md` and `operations/documents.export.md`.

**DEC4 — Variants are component props, not axes.** §7.3's claim that variants unify into axes is
withdrawn; the shipped code never implemented it (`canvas-schema.mjs:65-74` carries `properties`,
`bind`, `varies` and `modes` as two separate systems). The test is one sentence: **can two siblings
on the same frame differ in it?** Yes, it is a prop. No, it is an axis. A slide with a primary and a
secondary button is unbuildable if `kind` is a document-root axis. Axes are `appearance`,
`viewport`, `interaction`; variants and sizes are props. Affects §7.3 prose only.

**DEC5 — Canvas is fixed-layout; flow-layout is a different product.** Word/Pages-class documents —
where pages are computed from a reflowing content stream, with pagination, widows and orphans,
keep-with-next, footnotes, running headers and a TOC — are not Canvas and must not be bolted on.
Canvas print work is poster, flyer, business card, packaging, brochure, signage, book *cover*. The
flow-layout product is future work, recorded here so nobody grows Canvas toward it.

---

**DEC6 — The `interaction` axis is removed.** It passed the sibling test but four of five modules
`ignore` it: a deck has no hover, a PDF has no hover, and SwiftUI/Compose have pressed states rather
than `:hover`. A general mechanism only one module understands is not general. Agents infer
interaction states when emitting web. Revisit if and when interactive previews are built. **Axes are
`appearance` and `viewport`.**

**DEC7 — §10.4 templating: purpose agreed, policy unreviewed.** Correcting the §0.1 mark. Batch export
— N binding sets producing N artifacts with **layout re-run per set** — is US-1, the forty decks,
the story this whole discussion started from. That is Agreed. What was never discussed is the
filename policy attached to it: explicit `output` per binding set, path-segment validation, no
silent sanitising, collisions as a pre-write error, and **existing destination is an error, export
never overwrites and never versions**. Those defaults stand unless challenged.

**DEC8 — §25.2 is a test, not a decision.** Whether the installed controller may write to an arbitrary
absolute path is empirical (Q18), and the plan already says so. Two file-access paths the manifest
does not describe already exist in the app: `image-materialization.mjs:111-139` opens arbitrary
absolute paths with `node:fs/promises`, and `pen-file-access.mjs:76-99` uses a browser directory
handle. This is assigned to the implementation thread, not to the user.

---

**DEC9 — the node field is `export: "default" | "image"`.** The value `live` is withdrawn; it
implied something dynamic, when all it ever meant was *do the normal thing*. The field is a one-way
author override: `image` forces rasterisation of a node whose construct the target could otherwise
emit natively, for the case where the author knows the native approximation will look wrong and
would rather have a predictable picture than a bad translation. There is no override in the other
direction, because the table's `raster` verdicts are real format limits, not preferences. This makes
§9.5 **Agreed**, superseding its "written, not discussed" mark.

---


---

## Product invariants

- Canvas is primarily agent-authored; people review and make focused corrections.
- The goal is a clean design and authoring model, not Pencil imitation. Pencil and Paper are
  evidence and interchange references.
- Components, instances, variables, themes, modes, and instance-specific values remain first-class;
  imports must not flatten them or reconstruct them heuristically.
- Icons remain semantic library-backed nodes rather than ordinary path conversions.
- Pencil scripts and shader fills require explicit compatibility semantics, bounded execution, and
  visible incompatibility—not opaque preservation or silent approximation.
- General model, rendering, selection, layout, measurement, and component fixes take precedence over
  document-specific or node-ID exceptions.
- Agents may move documents to recoverable Trash but may never permanently delete them.
- Essential authoring guidance belongs in App instructions and operation help, not only an optional
  Skill.
- The implemented clean model includes typed responsive layout, typed component properties and
  lexical scopes, rich-text paragraphs and marks with character-level collaboration, document-owned
  assets, and semantic module separation. Current gate status lives in the evidence ledger.

## 1. The problem

### 1.1 What happened

A 19-slide deck ("Trusted Partners") had to be personalised for ~40 schools and delivered as
`.pptx`. Canvas has no export beyond a raw `.pen` download and a one-PNG screenshot, so an agent
built this pipeline by hand:

```
Canvas frame
  → screenshot to PNG
  → PNG becomes a full-bleed PowerPoint slide background
  → live PowerPoint text boxes overlaid at each [SCHOOL NAME] location
  → patch rectangles drawn over the baked-in text underneath
```

Every reported defect traces to that one decision:

| Symptom | Cause |
| --- | --- |
| School name font never matched the headline | PowerPoint text box rendered in PowerPoint's font stack, not Canvas's |
| Text looked "detached", "pasted on" | Two rendering systems composited, never one layout |
| Placeholder text visible behind the overlay | Patch rectangle misaligned by a pixel or two |
| Casing wrong (`WHAT WE WOULD DO FOR Universal International School`) | Title-case applied globally, ignoring the uppercase context baked into the image |
| Some slides had text nodes, others didn't | Two strategies mixed within one deck |
| Layout broke on long names | Coordinates measured against one specific string |

The final resolution in that thread was to **flatten every slide to an image** — visually exact,
completely dead. That is the failure this architecture exists to prevent.

### 1.2 The root cause

The model is untyped. A frame is a frame. Nothing knows a document is a deck, so nothing can
guarantee it survives the trip into `.pptx`, and the only way to guarantee appearance is to destroy
the content.

### 1.3 What was actually needed

One text node reading `YOU RUN ${schoolName}. WE MAKE SURE IT GROWS.` with two colour marks,
laid out by Canvas, exported as one PowerPoint text box with three runs, personalised forty times
with the layout re-run per name.

Every piece of that is missing today, and §4 shows exactly which pieces.

---

## 2. Principles

**P1 — Capability constraints are enforced at design time, not discovered at export time.**
A document declares its module at creation. The editor only permits what that module's targets can
express, and tells you the consequence of each choice as you make it. So export never surprises you
with a *capability* failure.

P1 is about capability, not about operations. Export can still fail for reasons that have nothing to
do with what you drew: mixed slide sizes in one deck, a destination path that already exists, a font
whose licence forbids embedding, a filesystem permission the host withholds, a PDF profile
requirement the document does not meet. Those are operational errors with actionable messages
(§10.5). Conflating them with capability was revision 3's error.

**P2 — Fidelity is absolute where we control the pixels, and measured where we do not.**
Rasterized output is pixel-identical to the canvas, always — that is not a target, it is the same
renderer writing the same bytes. Native output is *expressible*, not pixel-identical: when we hand
PowerPoint editable text, PowerPoint reflows it with its own line breaker, and we report the
divergence rather than pretend it is zero (§14 US-1, decision 35). Choosing editable text is
choosing that tolerance knowingly. What you see is what you get, up to a difference we measure and
show you.

**P3 — Liveness is a tradeoff the designer makes knowingly.** Some choices cause a node to export
as an image. The editor says so at the time. The pixels still match.

**P4 — One mechanism, used everywhere, beats several mechanisms that each fit one case.**
Themes, component variants, interaction states and responsive breakpoints are one mechanism.
Every consequence — rasterization, dropped construct, reflow risk, overflow, resolution, missing
glyph, contrast — is one channel with one closed vocabulary (§9.3).

**P5 — The escape hatch is cloning, not overriding.** If you need more than a component exposes,
you own a copy. Undeclared per-instance divergence is not a feature.

**P6 — Constraints apply to what exports.** The rest of the infinite canvas is where you think, and
it stays unconstrained.

**P7 — Research before invention.** Where a standard exists — DTCG, statecharts, ISO PDF profiles,
ProseMirror's mark model, Lottie — adopt or adapt it rather than inventing a parallel vocabulary.

---

## 3. Strategy

Three strategies exist in the market:

| | Approach | Example | Consequence |
| --- | --- | --- | --- |
| A | Neutral model, N exporters | Figma, Pencil | Fidelity degrades per target. Figma's own answer was to split into `.jam` / `.deck` / `.site` / `.make` with degraded cross-product editing |
| B | The model **is** the target format | [paper.design](https://paper.design) — its document model is literally HTML/CSS | Perfect for that one target; structurally cannot produce `.pptx` or `.pdf` |
| C | Superset model + declared per-target capability tables | *this document* | Most work; the only one that serves all targets |

**Canvas takes C.**

B is rejected because a DOM-based model forces PPTX to be translated *out of* HTML — the worst
possible source, being far more expressive than OOXML and full of concepts with no PowerPoint
analogue. A is rejected because it is the status quo and it produced §1.1.

### 3.1 The engine question

Strategy C says "Canvas's own superset model." §4.3 shows that today the model is **OpenPencil's**,
running on a vendored OpenPencil engine with 46 local patches. Reconciling that is the largest
open cost in this document and is being researched separately (§19).

---

## 4. Grounded facts about the system as it stands

*Everything in this section was read from source or measured against live documents.*

### 4.1 The App surface

`penkra-apps/canvas/penkra-app.json` declares **9 operations** and **no export**:

```
documents.list  documents.create  documents.execute  documents.undo
documents.open  documents.trash
sharing.list    sharing.grant     sharing.revoke
```

Permissions: `account-data`, `network-fetch`. **No filesystem access.**

Export was deliberately removed — `TODO.md:83`: *"Replace Canvas `documents.get`, `documents.mutate`,
and `documents.export` with the single read/write `documents.execute` surface."*

### 4.2 The document model today

From `documents execute --help`, which is authoritative:

- **Node types:** `frame`, `group`, `rectangle`, `ellipse`, `polygon`, `line`, `path`, `text`,
  `icon`, `ref`, `note`/`context`/`prompt` (non-visual), `script`.
  **No table. No chart. No connector. No image node** (images are fills). **No video.**
- **Layout:** `horizontal` / `vertical` / `none`; `gap`, `padding`, `justifyContent`, `alignItems`,
  `layoutIncludeStroke`, `layoutPosition: absolute`, `fill_container` / `fit_content`.
  Explicitly documented as unavailable: *"percentages, viewport units, `calc()`, margins, wrapping,
  and baseline alignment."* **No wrap. No grid. No min/max.**
- **Typography:** one uniform style per node. `textGrowth` is `auto` / `fixed-width` /
  `fixed-width-height`. `lineHeight` is a multiplier. **No spans, no bullets, no lists,
  no paragraph styles.**
- **Effects:** `effect` (singular) — shadow, layer blur, background blur, with `blendMode`.
- **Components:** a frame with `reusable: true`; instances are `{type: "ref", ref: id}`;
  per-instance changes go in `descendants`.
- Documented limitation: *"`Get` cannot select a rendered instance descendant."*
- Documented limitation: *"This operation does not author document-root variables or themes."*

`blank-document.mjs` creates `{version: "2.15", children: [one frame]}`. A grep for
`documentType|docType|artboard|pageSize|canvasKind|preset` returns **zero hits**. There is no
concept of a document type anywhere in the codebase.

### 4.3 The engine is OpenPencil

`vendor/open-pencil/` contains:

- `engine.mjs` — **96,164 lines, 3.4 MB**, a tree-shaken build artifact
- `PROVENANCE.json` — upstream `github.com/open-pencil/open-pencil`, pinned commit
  `4a5e7d557064d941fbac88bd492586db5257ff5f`, SHA-256 recorded
- **46 local patches**, and they are not cosmetic:
  - *"Honor Pencil sizing fallbacks, padding shorthands, flex text growth…"*
  - *"Invalidate overridden text metrics before intrinsic layout…"*
  - *"Resolve slash-separated component descendant overrides through exact cloned-component identity chains…"*
  - *"Execute Pencil shader fills in a bounded WebGL 1.0 runtime with uniforms, time, mouse, SDF, and backdrop bindings."*
  - *"Render Pencil mesh gradients from their exact point grid and Bezier handles with adaptive Coons-patch tessellation."*
- A **13-export seam**: `computeBounds`, `computeAllLayouts`, `computeDescendantVisualBounds`,
  `createDefaultEditorState`, `createEditor`, `fontManager`, `getCanvasKit`, `parsePenFile`,
  `provideEditor`, `SkiaRenderer`, `useCanvas`, `useCanvasInput`, `useTextEdit`

**Consequences of this that change cost estimates:**

1. **Layout is Yoga** (flexbox). So `wrap` and min/max are very likely *exposure* work — Yoga
   implements them — while **grid is real engine work**, because Yoga has no grid. Being verified.
2. **Rendering is CanvasKit / Skia.** Skia's paragraph API handles styled runs natively. So rich
   text is a **model and editing** problem, not a rendering problem. Being verified.
3. **We are already forking by patch file.** 46 invasive patches reapplied by hand on every upstream
   bump is a fork without the benefits of one.

Local wrappers: `openpencil-engine.mjs` (561), `openpencil-render-document.mjs` (666),
`openpencil-surface.mjs` (332), plus nine `pencil-*.mjs` modules. ~4,650 lines including tests.

### 4.4 The variable system, exactly as implemented

`openpencil-render-document.mjs:581`:

```js
function isVariableReference(value, property) {
  return typeof value === "string" && value.startsWith("$") && VARIABLE_PROPERTIES.has(property);
}
```

**That is the entire test.** Consequences:

- Matching is **whole-string only**. `content: "$schoolName"` works.
  `content: "YOU RUN $schoolName."` does **not** — it does not start with `$`.
  **There is no interpolation. The personalisation story is not expressible today.**
- Any string starting with `$` on a variable-able property is treated as a reference, with no
  grammar. **A currency amount is parsed as a variable.**

`VARIABLE_PROPERTIES` covers numerics (`x`, `y`, `width`, `height`, `gap`, `opacity`, `rotation`,
`fontSize`, `lineHeight`, `letterSpacing`, …), booleans (`enabled`, `clip`, `flipX`, `flipY`,
`underline`, `strikethrough`), strings (`fontFamily`, `fontWeight`, `fontStyle`, **`content`**),
numeric arrays (`cornerRadius`, `padding`), plus `fill`, `stroke`, `colors`.

Resolution is an ordered cascade with a comment that matters:

```js
// Pencil 2.17 defines variable arrays as ordered cascades: the last value
// whose complete theme condition matches wins.
```

Walk every entry, keep those whose *entire* theme condition matches, last match wins; no match falls
back to the first entry. Cycles are detected. Failures push a `variable` issue and use a safe
fallback. **This cascade is the mechanism §7.3 generalises into axes — and it is Pencil's, not ours.**

### 4.5 Components, exactly as implemented

`node-reference.mjs`:

```js
const override = descendantPath && isPlainObject(instanceNode?.descendants?.[descendantPath])
  ? instanceNode.descendants[descendantPath]
  : null;
const effectiveNode = sourceNode
  ? { ...structuredClone(sourceNode), ...structuredClone(override ?? {}) }
  : null;
```

- Component = frame with `reusable: true`. Instance = `{type: "ref", ref: id}`.
- `descendants` is a **flat map** keyed by descendant source ID or slash-separated path
  (`"row-status/badge-label"`), valued with a partial property object.
- Resolution is a **shallow merge** — whole properties replaced, no deep merge.
- **Instances are references, not copies.** Editing the source changes every instance. The clone
  happens at render time.

`slot` is **not** a third mechanism. It is Pencil editor chrome: its sole renderer consumer drew an
inset coloured outline alongside text-edit and drop-target overlays. Content screenshots and exports
exclude editor chrome. Canvas deletes the field in M5 and owes `.pen` files no import-fidelity
compatibility.

### 4.6 Execution limits — who set them and where

| Limit | Value | Location | Owner |
| --- | --- | --- | --- |
| Script source | 100,000 bytes | `script-runtime.mjs:3` | ours |
| Execution time | 5,000 ms | `script-runtime.mjs:6` | ours |
| Heap | 64 MiB | `script-runtime.mjs:29` | ours |
| Stack | 4 MiB | documented | ours |
| `Get` result | **1–1000, hard** | `script-runtime.mjs:167-169` | ours |
| In-document `script` node | 2,000 ms | `pencil-script-runtime.mjs:4` | ours |
| Script node output | 1,000 nodes | `pencil-script-runtime.mjs:5` | ours |
| `Print` entries | 1,000 | `script-runtime.mjs:291` | ours |
| Touched nodes | 10,000 | `operations.mjs:123` | ours |
| Review issues | 10,000 | `operations.mjs:151` | ours |
| **Command invocation** | **30,000 ms** | Penkra host | **host** |

The `Get` cap is applied to the **visitor** form as well, where nothing is returned and there is no
payload to bound. That makes whole-document survey impossible — the cap protects nothing in that
form and blocks everything.

### 4.7 The per-execution O(document) tax

`operations.mjs:104-130`:

```js
const before = materialize(model);
const beforeInspection = inspectDocument(before, listNodes(model), 1_000);   // full render inspection
const execution = await executeCanvasScript(before, code, …);
…
const changedByScript = JSON.stringify(before) !== JSON.stringify(execution.document);  // full double serialize
```

Every execution pays a full materialize, a full render-inspection, and a whole-document
stringify-compare, **regardless of what the script does**. Verified: `Print(1)` — an empty script —
times out at 30s against the `Atferd-Complete-Portal-Redesign` document.

Export will inherit this tax once per output. Forty decks pay it forty times.

### 4.8 Audit of the user's real documents

14 documents. Surveyed through `documents.execute`; per-type queries because of the 1000 cap, so
key lists are partial where a type exceeded it.

| Document | Nodes | Findings |
| --- | --- | --- |
| Trusted Partners Deck | 804 | `text` 271, `frame` 305, `rectangle` 218, `icon` 10. Zero effects, zero blend modes, one gradient, 499 solid fills, 48 image fills. **Entirely inside PPTX's expressible set.** |
| SchoolBase Admin | 1000+ frames, 648 text, 239 icon | Zero effects, zero variables, **zero refs** — a design with no components at all |
| Penut Mobile | 461 frame, 1000+ text, 342 rect, 165 ellipse, 59 path, 253 icon | Frames at **393×852** — an iOS document in all but name. Zero refs. |
| penkra | 962 frame, **749 ref**, 620 text, 146 icon | **1682 variable references**, 21 problems, 7 effects. Uses `reusable`, `descendants`, `slot`, `theme`, `metadata`. The most advanced document. |
| Atferd Portal | — | Cannot be audited: times out (§4.7) |
| Lantern Row, Penkra Admin | ~1 | Effectively empty |
| 8 others | small | `design` ×3, `Untitled` ×2, QA/repro documents |

**Two conclusions.** The flagship deck needs no new expressiveness to export correctly — it needs
*export*. And component adoption is bimodal: `penkra` uses 749 refs, everything else uses zero.

### 4.9 Live defects found during this audit

**D1 — Currency parsed as a variable.** Three nodes in `penkra`:

```json
{"type":"text","id":"ezVOz","name":"Value","content":"$18.40","fill":"$text-primary"}
```

```
Variable $18.40 was not found.
Variable $4.20 / $20 was not found.
```

**D2 — No string interpolation.** §4.4. Blocks the entire personalisation use case.

**D3 — `Get` cap applied to the visitor form.** §4.6.

**D4 — Unconditional O(document) work per execution.** §4.7. Makes a whole document unreachable.

**D5 — Unsupported icon silently preserved.** `phosphor push-pin-fill` — reported as an issue,
correctly, but there is no design-time signal.

**D6 — Internal inconsistency in variable detection.** `isKnownVariableReference` checks
`Object.hasOwn(variables, …)`; `isVariableReference` does not. The strict check exists and is used
for chained resolution but not for the entry test.

---

## 5. Product decomposition

**One app, modular types.**

The engine — document model, layout, renderer, text measurement, collaboration, components,
variables, axes — is core. Each type ships as a **module** carrying four things: its capability
table, its editor chrome, its bundled design system, and its exporter. A deck document loads the
deck module and nothing else.

**Why one app.** The infinite canvas is the product's advantage. Three deck directions side by side
with generated images next to them, and "use that one on slide 9," only works in one app.

**Why modules.** Chrome is declared rather than branched (conditionals), capability is data rather
than code, and a real module boundary limits blast radius. **And it makes the decision reversible** —
splitting Decks into its own app later becomes repackaging, not rewriting.

**Bundle size is *not* a justification, and the plan wrongly claimed it.** "A deck never loads grid
machinery" is false of what ships: the app imports one 96,164-line engine bundle that contains the
Yoga Grid implementation, every document loads it, and `scripts/build.mjs:30-68` produces no
per-module chunks. Either real dynamic chunk boundaries get built — which is work nobody has scoped
(Q23) — or bundle size stops being cited. The other three reasons stand on their own.

**Split criterion for future work:** split when the *interaction model* changes; constrain within one
app when only the *capability set* changes.

- Deck, print, web, iOS, Android — direct manipulation on a spatial surface. Same gesture. One app.
- Word, Markdown, rich text — flow documents, a different gesture. **A separate Documents app.**
- TeX — author source and compile. A code editor with a preview. **Separate again.**

---

## 6. Document model — root

```js
{
  version: "2.15",               // OpenPencil's .pen format marker — not ours (§4.2)
  module: "deck",                // fixed at creation; selects the module
  axes: {                        // §7.3
    appearance: { modes: [{ name: "light" }, { name: "dark" }] }
  },
  variables: { … },              // §7.5
  paragraphStyles: { … },        // §7.2
  imports: { … },                // library resources — already exists (§4.3)
  flows: [ … ],                  // §7.7 — reserved now, even when empty
  children: [ … ]
}
```

**The serialized field is `module`, not `type`.** An earlier draft used both — `type: "deck"` in
every example, "`module` at creation" in the build plan. `type` is already the field every *node*
carries (`type: "frame"`), so reusing it at the root for something categorically different was a
name collision waiting to confuse a schema. One name, used in schemas, migrations, operations and
examples: **`module`**.

`version` stays exactly what OpenPencil means by it: a private `.pen` serialization marker. Canvas
writes what the engine expects and does not interpret it. There is no Canvas schema-version field,
minimum-client gate, session handshake, quiesce protocol, or automatic migration on open. This is a
deliberate clean cut with no installed legacy-client contract; future incompatible changes may take
another clean cut rather than reserving a protocol now.

Migration is an explicit, one-document-at-a-time operation (§16). Opening returns the stored
projection unchanged. A migration reads the original once, produces and validates a copy, transfers
assets, writes a prose Markdown report beside the run, and only then renames the untouched original
as superseded. Ambiguous cases take a reasonable best-effort result and are described in that report;
they never invoke a manifest or block the run.

`module` is on the **document**, not the frame. Frames carry `role` (§8.2).

---

## 7. Document model — nodes

### 7.1 Vocabulary

Universal. There is no `PPTXText`. The concepts genuinely are universal: a text node is "a box of
paragraphs of styled ranges" in PPTX, PDF, HTML and RN alike. What varies per type is which
*properties* are available, and that lives in the capability table.

```
frame  group  rectangle  ellipse  polygon  line  path
text   icon   ref
```

**Existing today** (measured): `frame` 133, `text` 71, `icon` 37, `rectangle` 34,
`ref` 26, `script` 25, `path` 9, `ellipse` 7, `line` 6, `group` 3, `polygon` 2. `slot`
is not a node type; it is discarded Pencil editor-chrome metadata (M5).

**There is no `image` node, and revision 4 does not add one.** Revision 3 listed one here and
reported "38 existing" — that 38 is a count of image *fill records*, relabelled as nodes. In the
engine, `VISUAL_NODE_TYPES` has no `image` (`openpencil-engine.mjs:13-29`), and image objects are
found by recursively walking `fill` arrays (`image-materialization.mjs:88-96`). §4.2 said this
correctly and §7.1 contradicted it — the exact defect class this revision exists to kill.

An image in Canvas is `fill.image` on any shape. That is strictly more expressive than an image
node (any shape can be image-filled, and a shape can carry an image fill *and* a stroke and effects),
it is what the code already does, and it needs no migration. Capability tables therefore carry
`fill.image`, never `image`.

**Removed from this list.** `script` is pen.dev compatibility surface — a `scriptUri` pointing at a
`.js` asset with an `@schema 2.11|2.17` header, executed in QuickJS with a 2s timeout and a 1,000-node
output cap, emitting child nodes. Only pen's schema versions are accepted, which is the tell. It is a
parametric generator we did not design and nothing here asked for. Pen scripts resolve to their output
nodes at import (#33). `slot` is deleted mechanically because its outline is editor chrome and never
part of document-content rendering (M5, §16).

`note`, `context` and `prompt` are removed with it. All four are actively rendered and compiled today
(`openpencil-render-document.mjs:133-169`), so **removal is a migration, not a deletion** (M10–M13,
§16). Nothing may be dropped from the vocabulary without a census, a deterministic materialisation
and a preservation rule for the source.

**Proposed but not agreed:** `table`, `video`, `lottie`. Each was written into capability tables in an
earlier draft of §24 as though it existed. Verdicts were then reasoned about — and the entire case for
the `substitute` verdict rested on them. **No node type earns a capability entry before it is agreed
into this vocabulary**, and none of the three appears in the build plan (§17).

#### Two fields every node may carry

```js
export: "live" | "image"     // author intent — §9.5. Default "live".
description: "…"             // alt text / accessible name — §25.5
```

`export` is not a remedy applied after a warning; it is a statement of what the node *is*. Body copy
somebody will edit in PowerPoint is content and stays `live`. A treated wordmark is design, and
`export: "image"` says so at author time, which suppresses the `raster` consequence because the
rasterization was asked for.

### 7.2 Text — content plus marks

One `content` string. Formatting is **marks**: annotations over character ranges, following the
ProseMirror / Portable Text model, in which *"unlike nodes, marks don't affect document structure."*

```js
{ id: `t1-h`, type: `text`,
  content: `YOU RUN ${schoolName}. WE MAKE SURE IT GROWS.`,   // 45 UTF-16 units
  start: 80, y: 300, width: 1140, textGrowth: `fixed-width`,
  fontFamily: `Inter`, fontSize: 112, fontWeight: `700`,
  lineHeight: 0.98, letterSpacing: -4, fill: `#111111`,
  paragraphs: [ { from: 0, to: 45, align: `start` } ],
  marks: [ { type: `fill`, from: 8,  to: 21, value: `#e4572e` },   // `${schoolName}`
           { type: `fill`, from: 23, to: 45, value: `#073b63` } ] }   // `WE MAKE SURE IT GROWS.`
```

Every offset above is checkable by hand, and that is deliberate: an earlier draft of this document
contained six ranges that did not match their own strings, including one that claimed to colour a
token and actually coloured the token plus two following characters. **Every range in this document
is mechanically validated against its `content`, and so is every range written by the editor.**

**Why marks, not runs-as-nodes:**

1. **Overlapping styles work.** Bold spanning across a colour boundary is one mark overlapping
   another. Runs force a split at every boundary; three overlapping styles become combinatorial.
2. **`content` stays one string**, so interpolation and the variable whitelist are unaffected.
3. **Editing does not churn the tree.** Typing shifts offsets rather than splitting and merging.
4. **Every target wants runs, and marks flatten to runs trivially** — sort boundaries, emit.
5. **Skia already wants this** (§4.3). The renderer has been handed one flat string per node.

A run is not a design object. Giving it a node ID and override semantics invents identity that does
not exist.

#### Range invariants

These are enforced at write time and are the contract for every `marks` and `paragraphs` entry.

1. **`[from, to)` — half-open, `from` inclusive, `to` exclusive.** A mark over the whole of a
   45-unit string is `{ from: 0, to: 45 }`.
2. **Offsets are UTF-16 code units**, because that is what Skia's `Paragraph` API indexes
   (§21.3). Q14 asks whether the *agent-facing* API converts to graphemes; storage does not.
3. **`0 ≤ from < to ≤ length`, and `from`/`to` are always integers.** Empty and inverted ranges are
   a write-time error, not a silently-dropped entry. There is no symbolic range type: a range whose
   endpoint depends on an unresolved binding (revision 3 wrote `to: "$boundLength"` in the component
   example) is not written at all. **Bound content carries no ranges.** The binding resolver
   synthesizes one paragraph covering the resolved string, and any styling the author wants on bound
   content is expressed on the node, not on a range into a string that does not exist yet.
4. **No sentinels.** `to: -1` appeared in an earlier draft meaning "to the end" and is
   **removed** — one unspecified magic value in a numeric field is how off-by-one bugs become
   permanent. Write the length.
5. **`paragraphs` partition the string exactly.** They are contiguous, non-overlapping, and cover
   `[0, length)` with no gap. A paragraph boundary falls **after** its terminating newline, so the
   newline belongs to the paragraph it ends. A string with no newline is one paragraph. This is
   what makes "two paragraphs" a statement about the text rather than about where somebody drew the
   ranges — an earlier draft split a single sentence mid-word and left a character in no paragraph
   at all.
6. **Marks of different types may overlap; marks of the same type may not.** A same-type write clips
   the existing range before inserting the new one, so array order can never decide precedence.
   Two marks of the same `type` and `value` that become adjacent are merged by the normalisation pass
   (§25.6).

**Offsets and interpolation.** With `${name}` delimiters (§7.5), a mark either contains a whole
token or does not touch it. Partial overlap of a token is a **hard error at write time**, reported
with the exact character range. On resolution, offsets at or after a token shift by
`len(value) − len(token)`; a mark that *contains* the token has its `to` shifted and its `from`
left alone.

**Lists are paragraph-level**, not a node type:

```js
paragraphs: [ { from: 0, to: 42, list: { kind: `bullet`, level: 0 } } ]
```

A list item is a paragraph, so the partition rule above applies unchanged.

**Paragraph styles are named**, not inline — a 12-page report with 40 body paragraphs cannot repeat
the font size 40 times, or changing the type scale rewrites 40 nodes:

```js
// content is 380 UTF-16 units, with a newline at index 41
paragraphs: [ { from: 0,  to: 42,  style: `h2` },     // includes the newline at 41
              { from: 42, to: 380, style: `body` } ]
```

The second range starts at `42`, not `43`. Revision 3 wrote `43` and left unit 42 covered by no
paragraph, in the same document that declared exact partition an invariant. The newline at index 41
belongs to the paragraph it ends, so the first paragraph is `[0, 42)` and the next begins where it
stops. **Adjacent paragraph ranges always share a boundary number.**

#### Empty text

A newly created text node has `content: ""`, length 0, and therefore cannot hold any range
satisfying `from < to`. Rather than carve an exception into invariant 3, the rule is:

**Empty content has zero paragraphs and zero marks.** Its styling comes from the node's own
`style` field, which every text node carries and which is the default for any paragraph created in
it. The first typed character produces `paragraphs: [{ from: 0, to: 1, style: <node style> }]`. This
keeps `from < to` universally true, needs no zero-length special case in the editor, validator or
exporters, and matches what the node already means when nothing has been typed.

### 7.3 Axes — one mechanism for themes, states, variants and breakpoints

> **Provenance: written, not discussed — and PARTLY WITHDRAWN by DEC4 (§0.4). Variants are component
> props, not axes. Axes are `appearance`, `viewport`, `interaction`.** Do not build from this
> section without asking. See §0.

Themes, component states, component variants and responsive breakpoints are the same structure: a
named axis with modes, and property values selected by an ordered conditional cascade. This is the
orthogonal-regions concept from Harel statecharts and W3C SCXML, and §4.4 shows Canvas already
implements the cascade.

```js
axes: {
  appearance:  { modes: [ { name: `light` }, { name: `dark`, media: `prefers-color-scheme: dark` } ] },
  interaction: { modes: [ { name: `default` }, { name: `hover`, selector: `:hover` } ] },
  viewport:    { modes: [ { name: `mobile`, minWidth: 0 },
                          { name: `tablet`, minWidth: 640 },
                          { name: `desktop`, minWidth: 1024 } ] }
}
```

**Modes carry target metadata.** Without it the axis idea compiles to nothing — `minWidth` becomes a
media query, `selector` becomes `:hover`. This is what lets one mechanism serve three different jobs.

Any property may take a cascade:

```js
{ id: `hero`, type: `frame`,
  layout: [ { value: `vertical` }, { value: `horizontal`, when: { viewport: `desktop` } } ],
  gap:    [ { value: 16 }, { value: 48, when: { viewport: `desktop` } } ],
  fill:   [ { value: `#fffefc` }, { value: `#0b1620`, when: { appearance: `dark` } } ] }
```

Resolution follows §4.4 exactly: last full match wins, first entry as fallback.

**Consequence: responsive design needs no duplicated frames.** Figma copies a frame per breakpoint.
Canvas varies properties along an axis.

**`when` also accepts component props** (§7.6), which is what collapses variants into this same
evaluator.

**Axis handling is a lowering rule, not a property verdict.** Revision 3 said axes use "the same
three verdicts" and then, one sentence later, put `select-at-export` in two tables — a fourth value
in a slot declared closed. The three verdicts answer *"can the target express this visual
property?"*. That is not the question an axis asks. An axis asks *"what does the target do with a
conditional?"*, and there are exactly three answers:

| Lowering | Meaning | Where |
| --- | --- | --- |
| `select-at-export` | The export request picks one mode; the others do not appear in the artifact. | deck, print |
| `emit-conditional` | The mode's target metadata becomes a real construct — a media query, a `:hover` rule, a size class. | web, mobile |
| `ignore` | The axis has no meaning in this target and is dropped, with a consequence. | any |

So a deck declares `appearance: select-at-export`, not `appearance: native`. This lives in the
module's `axes` block (§9), separate from the property table, and the two vocabularies never mix
again.

**Axes are not free in a static target.** A PDF cannot switch appearance with the reader's OS, and a
`.pptx` has no conditional anything. `appearance: native` in those tables was an unfounded assertion
(finding 32). What is actually true is that **export selects modes**, and the export request must say
which:

```json
{ "modes": { "appearance": "dark" } }
```

Unspecified axes resolve to their first mode, which is the same fallback rule as rendering (§4.4).
Two artifacts for light and dark is two export calls, which is honest; one artifact that claims to
be both is not. Only `web` — where the mode carries a real media query — resolves the axis in the
output rather than at export.

**Migration from the shipped shape.** The current renderer expects `themes` at the root, `theme` on
nodes, variables as `{type, value}`, and cascade entries keyed `theme`
(`openpencil-render-document.mjs:83-97`). The model above is four separate changes —
`themes` → `axes`, node `theme` → `modes`, `{type,value}` → `{tokenType, cascade}`, and
cascade `theme` → `when` — and each needs its own migration step, not one hand-wave. They are M14–M17
in §16.

### 7.4 Layout

Current primitives, plus:

| Addition | Cost (pending §19 verification) |
| --- | --- |
| `wrap` | Yoga implements it — exposure work |
| `minWidth` / `maxWidth` / `minHeight` / `maxHeight` | Yoga implements them — exposure work |
| `layout: "grid"` with explicit tracks | **Already ours — exposure work.** Stock released Yoga has no grid; the vendored OpenPencil fork we ship does (`@open-pencil/yoga-layout@3.3.0-grid.3`, `Display.Grid`, track setters, and an adapter that calls `setDisplay(Display.Grid)` — `vendor/open-pencil/engine.mjs:37780, 39647-39657`). Revision 3 budgeted this as engine work in §7.4 and as exposure work in §17, from the same evidence. It is exposure work. |

Explicitly not adopted: floats, `calc()`, viewport units, baseline alignment. The axis mechanism
covers what viewport units would have been used for.

For deck and print, layout **resolves to absolute geometry at export**. Visually lossless, and it is
simply what those formats are.

**This is why layout properties never carry a verdict of their own.** An earlier draft marked
`layout.grid` and `layout.wrap` as `raster` for PPTX, reasoning that PowerPoint has no layout engine.
It does not need one: Yoga computes every child rectangle before the exporter runs, and a resolved
rectangle is exactly what PPTX stores. **Layout compiles away.** Verdicts belong on the visual
properties that survive into the target — fills, effects, blend modes, text run properties — not on
whichever algorithm the author used to arrive at a coordinate. This correction removes most of the
`raster` entries from the deck table and deletes an entire user story (§14).

### 7.5 Variables and tokens

The mechanism is kept. Two changes, both forced by §4.4 and §4.9:

**Change 1 — delimited interpolation, `${name}`.**

```js
content: `YOU RUN ${schoolName}. WE MAKE SURE IT GROWS.`
fill: `${text-primary}`
```

- Unambiguous next to literal text. `Price: $18.40` is just text. **D1 fixed.**
- Multiple references in one string. **D2 fixed** — and D2 is what blocks the entire use case.
- Same convention as every template system in wide use.

Migration: `^\$([A-Za-z][\w-]*)$` → `${$1}`, run once at deploy over all stored documents. The three
currency nodes match nothing and are correctly left alone. 1682 references in `penkra`.

**Change 2 — agents may create and edit root variables and axes.** The current restriction
(§4.2) is an oversight and blocks templated export.

**Interop:** the token-shaped subset imports and exports in **W3C DTCG** format (stable since
2025.10; supported by Figma, Sketch, Penpot, Framer, Supernova, zeroheight). DTCG is *not* the
internal model — it describes design decisions and has no concept for binding a node's `x`, and its
mode story is still draft. Speak the standard at the boundary; keep the superset in the core.

### 7.6 Components

> **Provenance: written, not discussed — see §0.2.** No user decision stands behind this section. Do not build from it without asking. See §0.

**Change 1 — there is no component status.** No `reusable` flag, and equally no "a frame becomes a
component when something references it."

The observed-component-ness idea was in an earlier draft and does not survive contact with its own
cases. It makes a visible artboard silently become a reusable definition; it makes deleting the last
reference change what the source *is*; and it leaves cycles undefined. The React/Vue analogy that
justified it was also weak — those systems have no convert-to-component *button*, but they very much
have an explicit declaration, a function or a `<template>`.

What replaces it is smaller and has no status at all:

> **Any node may declare `properties`. Any node may be the target of a `ref`.**

`properties` is an interface, not a badge. A frame with `properties` and no refs is a frame with an
unused interface, which is fine and means nothing. A frame with refs and no `properties` is aliased
as-is, which is also fine. Nothing is promoted, nothing is demoted, and deleting the last ref changes
nothing about the source.

**Change 2 — the one structural rule.**

> **A `ref` target may not live inside a role-bearing frame.**

Enforced at write time, in both directions: you cannot `ref` a node inside a slide, and you cannot
move a ref target into one.

The reason is that a role-bearing frame is an *export unit*. If the "Title slide" master lived inside
slide 3, slide 3 would export twice — once as itself and once as everybody else's dependency — and
deleting it would break four other slides. So masters live on the freeform canvas, where they have no
role, are never exported as an output of their own, and can be edited without touching the export
list. This is the same rule as §8.3's nesting rule, applied to references instead of containment.

**Refs do not become PowerPoint slide layouts.** Revision 3 claimed a `p:sldLayout` *is* a role-less
propertied frame that several slides reference. It is not. OOXML's hierarchy is master → layout →
slide; a slide has exactly **one** layout relationship, overrides match through `p:ph idx/type`
placeholders, and the research says in terms that it is not a general component system
(`research/pptx-capabilities.md:184-194, 273-280`). A Canvas ref can appear many times on one slide,
nest inside another ref, target any node rather than a whole slide, and carry typed props that vary
per instance. None of that survives the mapping.

**So refs always inline.** The deck exporter expands every ref into duplicated native shapes. That is
simple, always correct, and needs no eligibility schema, no placeholder mapping and no separate test
matrix. It costs file size and PowerPoint-side reusability, which is a real loss and the right one to
take: a narrow "whole-slide ref used as a structural base" subset could be recognised later without
changing anything written here, because inlining is the conservative case that subset would optimise.

**Refs are acyclic.** A ref may not reach itself through any chain. Checked at write time on the
reference graph, reported with the cycle path.

**Change 3 — presets are not components.** They look adjacent and are not the same thing:

| | Preset | Component |
| --- | --- | --- |
| What it is | module data, shipped with `deck` / `print` / `web` / `mobile` | a node in your document |
| What insert produces | a stamped frame carrying `role` and `size` | a live `ref` |
| Later edits | there is nothing to edit — it is not user-writable | propagate to every instance |
| Lives | in the module | on the freeform canvas, outside any role frame |

Insert of the `iphone` preset produces exactly this, and nothing else:

```js
{ id: "screen-login", type: "frame", role: "ios", size: "iphone", children: [] }
```

**Presets stamp rather than reference**, and the reason is narrow: a live ref to immutable data buys
nothing. Propagation is the entire point of a reference, and module data never changes under you, so
the indirection would add a resolution step before export, validation and the write-time checks could
know a frame's role — and return nothing for it. `role` and `size` stay literal strings readable
straight off the JSON.

(An earlier draft justified stamping by the danger of somebody editing the `iphone` preset into Pixel
dimensions and silently reshaping every existing screen. That cannot happen — presets are module
data and are not user-writable — and the argument is withdrawn. The conclusion stands on the ground
above.)

A team's own "standard title slide" is not a preset. It is a component: a document node, live, edits
propagating, on the freeform canvas. Which needs no new mechanism.

**Change 4 — typed properties are the interface.**

```js
{ id: `btn`, type: `frame`,
  properties: {
    label:     { type: `string`, default: `Get started` },
    tone:      { type: `enum`, values: [`primary`,`secondary`,`ghost`], default: `primary` },
    icon:      { type: `icon`, optional: true },
    fullWidth: { type: `boolean`, default: false }
  },
  varies: [`interaction`],
  layout: `horizontal`, gap: 8, alignItems: `center`, padding: [12, 20, 12, 20],
  width: [ { value: `fit_content` },
           { value: `fill_container`, when: { props: { fullWidth: true } } } ],
  fill:  [ { value: `#111111` },
           { value: `#2b2b2b`, when: { interaction: `hover` } },
           { value: `#f2f2f2`, when: { props: { tone: `secondary` } } } ],
  children: [
    { id: `btn-icon`,  type: `icon`, bind: { icon: `$props.icon` },
      visible: { op: `notNull`, arg: { prop: `icon` } } },
    { id: `btn-label`, type: `text`, bind: { content: `$props.label` } } ] }
```

`properties` says what the interface *is*, which `reusable: true` never did.

`bind:` is instance-scoped (`$props.label`); `${…}` is document-scoped. Both are needed, because a
component in a library cannot see the consuming document's variables.

#### The property type algebra

Revision 3 showed four types in an example and called it an interface. An interface needs a closed
type set with defined compatibility, or the validator has nothing to check. The full set:

| Type | Value domain | Notes |
| --- | --- | --- |
| `string` | any string | interpolation applies after binding |
| `number` | finite JSON number | `min` / `max` optional, validated at write |
| `boolean` | `true` / `false` | |
| `color` | a colour literal or a `${var}` reference | resolves in the *owning* document (§ namespaces) |
| `enum` | one of a declared `values` array | |
| `icon` | an icon identifier | |
| `node` | a subtree supplied by the instance | the only type that carries structure |

Seven types, and no others. `node` is what replaces `slot` and `descendants` for the one case they
were genuinely needed for: handing a component arbitrary content.

Rules, all enforced at write time:

1. **A property is required unless it declares `default` or `optional: true`.** Declaring both is an
   error — `optional` means the absent value is `null`, `default` means the absent value is the
   default, and a property cannot mean both.
2. **Assignment compatibility is exact.** No coercion, ever. `"3"` does not satisfy `number`.
3. **A binding resolves to exactly one type**, checked against the property's declared type. `$props.x`
   used where a `color` is expected must be a `color` property.
4. **A property value may not itself be a cascade.** Cascades resolve *inside* the component against
   axes and props; letting an instance pass a cascade in would make the resolution order circular.
   Variation is expressed by varying the property, and the component's own cascade responds.
5. **Enum evolution:** adding a value is compatible; removing or renaming one is a migration that
   must rewrite every instance passing it, or the write is rejected.
6. **Resolution order is fixed:** props bind first, then axis cascades resolve, then `${…}` variables
   resolve in the owning document, then layout runs. Each stage sees only the output of the previous
   one, which is what makes the whole thing a pipeline rather than a fixpoint.

#### Cross-document references

`imports` at the root (§6) is the record of what this document may reference. It is not namespace
prose; it is an addressable graph:

```js
imports: {
  hig: { documentId: "doc_8f21…", version: 14, pin: "exact" }
}
```

- **A qualified reference is `<importAlias>:<nodeId>`** — `ref: "hig:btn-primary"`. Unqualified IDs
  are local. The alias is chosen by the consuming document, so two libraries exporting `btn-primary`
  never collide.
- **`version` is the imported document's `canvasSchemaVersion`-independent content revision**, and
  `pin: "exact"` means edits to the library do not reach this document until the pin is moved.
  `pin: "live"` means they do. Both are legitimate; the default is `live`, because propagation is the
  point of a component.
- **The import graph is acyclic**, checked at write time on the same pass as the ref cycle check.
- **Assets and fonts belong to the document that declares them.** Exporting a document that refs a
  library pulls the library's assets into the export bundle; it does not copy them into the document.
- **A missing or unreadable import is a load-time error naming the alias**, not a silent empty render.

#### Conditions are an AST, not an expression string

An earlier draft wrote `visible: "$props.icon != null"`. A string like that needs a grammar, a parser,
a type checker and a sandbox, and the obvious implementation of it is `eval`. There is no grammar
here to write:

```js
{ op: "notNull", arg: { prop: "icon" } }
{ op: "eq",      arg: { prop: "tone" }, value: "primary" }
{ op: "and",     args: [ … ] }
```

Closed operator set — `eq`, `neq`, `notNull`, `isNull`, `in`, `gt`, `lt`, `and`, `or`, `not`. Operands
are a property reference or a literal. It is type-checked against the `properties` declaration at
write time, so `{ op: "gt", arg: { prop: "label" }, value: 3 }` is an error against a `string`
property rather than a surprise at render. It is trivially serialisable, diffable and translatable —
`eq` becomes a Swift `==`, a CSS class selector, or a resolved boolean at PPTX export.

`when: { props: { … } }` in a cascade is sugar for a conjunction of `eq` over the same AST, and
resolves through the same evaluator.

#### Namespaces

A component and its consuming document each have variables and paragraph styles, and they must not
silently collide.

- `$props.x` — the instance's property. Only inside the component subtree.
- `${x}` — resolved **in the document that owns the node**. A library component resolves against the
  library's variables, not the consumer's. This is what "a component in a library cannot see the
  consuming document's variables" actually means, and it applies to paragraph style names too: a
  component referencing style `eyebrow` gets the *library's* `eyebrow`.
- To let a consumer restyle a component, expose a property. That is the interface, and it is P5.

**Change 5 — `descendants` is dropped, and `slot` with it.**

Its three justifications each failed:

- *Locked libraries.* Circular — locked source does not prevent cloning. If you need a HIG button
  with a property Apple's does not expose, you clone it and own it.
- *Singular content.* That is just a node's properties. Nothing to do with overrides.
- *Import round-tripping.* The only survivor — and imports are deprioritised and must not distort
  the model.

A mechanism existing solely for a deprioritised feature, competing with the component interface for
the same job, does not belong in the clean model. **Cost, stated plainly:** instance-level tweaks
get more expensive — add a property, or clone. Both outcomes beat an undeclared override.

**`slot` is deleted outright.** Its only renderer consumer was `drawPencilSlotOutline`, a 1px inset
pink or purple outline located among editor-overlay routines. Screenshots and exports capture document
content without editor controls, so the field has never affected an exported artifact. M5 is a
mechanical, non-lossy deletion with no census, manifest or before/after render requirement. Canvas is
not Pencil and provides no `.pen` import-fidelity guarantee.

### 7.7 Flows

A document-root collection, **reserved now even when empty**, because changing the root shape later
is the single most expensive migration in the system.

```js
flows: [
  // deck: the whole slide advances. No trigger node exists or is needed.
  { id: `f1`, from: `slide-1`, to: `slide-2`, trigger: { kind: `advance` } },

  // web / mobile: a specific node is the click target.
  { id: `f2`, from: `route-home`, to: `route-pricing`,
    trigger: { kind: `tap`, source: { path: [], node: `hero-cta` } } }
]
```

A transition is an **edge between two nodes**, and a tree has no place for edges. Modelled on
statechart concepts, not SCXML's XML serialisation.

**The trigger carries a source node, and it has to.** An earlier draft connected frame to frame with
a bare `trigger: "advance"`, then claimed the use case was "a button navigates between screens" —
with nothing anywhere identifying the button. PPTX has the same requirement from the other side: a
hyperlink attaches to a run or a shape, never to the slide. `source` is required for every trigger
kind except `advance`, which is genuinely whole-frame.

Validation, at write time:

- `from` and `to` must be role-bearing frames in this document, and must carry the **same role**.
  A `route` does not navigate to a `slide`.
- `source`, when present, must be a node **inside** `from`.
- Deleting a node named by a `source`, or a frame named by `from`/`to`, deletes the flow and reports
  it. A dangling edge is not a state we keep.
- A `source` inside a ref target is addressed by a **typed instance path**, not a string:

  ```js
  source: { path: ["card-ref", "cta-ref"], node: "btn-label" }
  ```

  `path` is the ordered list of ref-instance IDs walked from the frame down, and `node` is the
  terminal ID in the ref *target*. Revision 3 wrote `"<refId>/<nodeId>"`, which handles exactly one
  ref layer, breaks when refs nest, and needs escaping rules for IDs containing `/` or an import
  alias's `:`. An array needs none of that. `path: []` means the node is directly in `from`.

- **Instance paths are validated after ref expansion**, because before expansion the terminal node
  is not reachable.
- **Editing a shared ref target invalidates every path through it.** Deleting a node inside a target
  used by six instances deletes six flows, and each is reported with its own path.
- **Two flows are duplicates when `from`, `source` and `trigger` are deeply equal** — structural
  equality over the trigger object, since triggers are objects and not strings.

#### One flow schema

`trigger` is **always an object**, in every example, table and operation in this document. Revision 3
had three incompatible versions of this contract in three sections. Day-one trigger kinds, closed:

```
advance   tap   hover   keypress
```

`transition` is **deferred and not part of the v3 contract.** Revision 3 wrote committed-looking
`transition: { kind: "fade", duration: 300 }` examples, then said elsewhere the transition vocabulary
was undecided. Rather than half-commit, transitions are removed from every example and table until a
deck stage designs them against `p:transition`. The examples above show `trigger` only.

Day one: stored and validated, rendered only where the target is native.

---

## 8. Types and roles

### 8.1 The four modules

> **SUPERSEDED IN PART by DEC1 (§0.4) — `print` is deleted as a module; `page` is deleted as a role.**

| Module | Roles | Output per role |
| --- | --- | --- |
| `deck` | `slide` | `.pptx` |
| `print` | `page` | `.pdf` (PDF/A, PDF/X, PDF/UA profiles) |
| `web` | `route` | `.html` + `.css` + assets |
| `mobile` | `ios`, `android` | SwiftUI source / Compose source |

**One role produces one kind of output.** Export takes a document and a role, collects the frames
carrying that role, and writes the artifact. There is no separate format parameter and no mapping
table between roles and exporters — the role *is* the target.

**A module has one native target; a document may have more than one role.** Decision 1 originally
read "one document = one native target", which is false for `mobile` the moment a document holds both
`ios` and `android` frames. The correct invariant is **one module per document, one target per export
role** — restated as decision 1 in §18.

`image` is **not a module.** A capability table whose every entry is `native` carries no information,
because the target is the renderer we already draw with.

There are, however, **three distinct things** an earlier draft collapsed into one "render a subtree to
pixels" function, and they are not interchangeable:

| | What it is | Who calls it |
| --- | --- | --- |
| **Raster subtree** | a subtree → an in-memory bitmap at export scale, composited into the artifact | every `raster` verdict, in all four exporters |
| **PNG export** | a subtree → a `.png` file at a requested scale | the user, for Slack |
| **SVG export** | a subtree → vector markup | the user, for a logo or an icon set |

The first two share an implementation and differ only in destination. **SVG shares neither.** It is
vector serialisation, not pixels, and it needs its own writer with its own capability table — Skia
shaders, mesh gradients and backdrop blur have no SVG equivalent, which is exactly the sort of thing
a capability table exists to say. Today's `document-screenshot.mjs` emits PNG only.

PNG and SVG are therefore **explicit operations** — `documents.export-image` with a `format` — and not
a `module`, and not the `documents.export` path where format is implied by the role. This is the one
place a format parameter exists, because here the format *is* the request.

**Both are scheduled, not implied.** PNG export and the SVG writer with its own property table are
stage 14 in §17. Revision 3 promised an SVG capability table that §24 does not contain and no stage
built; either it is scheduled or it is not real, and it is now scheduled last because nothing else
depends on it.

Word / Markdown / rich text are the separate Documents app (§5). TeX is separate again.

### 8.2 Roles and sizes

> **SUPERSEDED IN PART by DEC1 (§0.4) — a page is a frame that declares `physical`; roles are `slide | route | ios | android`.**

`role` marks **export units only**. A heading frame floating on the canvas has no role and is never
exported. No heuristics are needed anywhere: export takes the role-bearing frames you name.

**There are no role families.** An earlier version of this document grouped roles into "paginated"
and "view" families on four correlated properties. The grouping did not hold — `image` had to be
given a family of `none`, which is the tell that a taxonomy is not one — and it made adding a role a
question of which bucket it belonged to. Each role declares its own rules directly:

| Role | Height | Ordered | Frames → bundle | Files in bundle | Overflow |
| --- | --- | --- | --- | --- | --- |
| `slide` | fixed | yes | N → 1 | 1 `.pptx` | reported |
| `page` | fixed | yes | N → 1 | 1 `.pdf` | reported |
| `route` | `fit_content` | no | N → 1 | one `.html` per frame, plus shared `.css` and assets | scrolls |
| `ios` | `fit_content` | no | N → 1 | one `.swift` per frame, plus shared resources | scrolls |
| `android` | `fit_content` | no | N → 1 | one `.kt` per frame, plus shared resources | scrolls |

**Every export produces exactly one bundle.** Revision 3's column was headed "Frames → files" and
said route/iOS/Android were `1 → 1`, which contradicted §10.2's bundle contract on the same facts.
The cardinality is uniform: N selected frames go in, one bundle comes out. What differs is how many
*files* are inside it, and whether they share a stylesheet — which is why the source targets get a
shared `.css` or resource set at all.

`ios` and `android` are separate roles rather than one `screen` because they differ in **design
intent** — different system conventions, different component idioms, different output language. They
are not two renderings of one frame.

#### Sizes are adaptive modes, not copies

A role offers **named sizes**. A size is a set of dimensions with a name, and switching size does not
duplicate the frame — the content adapts, through the same axis mechanism as web breakpoints (§7.3).

> **The rule.** If the difference between two surfaces is *available space*, it is a size mode on one
> frame. If the difference is *design intent*, it is a separate frame.

So iPhone and iPhone Pro Max are one `ios` frame with two size modes — you switch to see how the
design breathes in more room. iOS and Android are two frames. Mobile web and desktop web are one
`route`, because it is the same content in different space.

**Sizes are not owned by roles.** A `route` may be A4-shaped if you are designing a template; it
still exports HTML, because the *role* decides output and the size is only numbers. The sizes a
module lists per role are defaults offered for convenience, not a constraint.

**One exception, and it is the format's, not ours.** PowerPoint slide size is a property of the
*presentation*, not of a slide. So every frame named in one deck export must resolve to the same
size. Mixed sizes are a write-time-clean, export-time error naming the offending frames, with the
remedy being two exports. This is the only place a role constrains size, and it exists because OOXML
says so.

#### Presets

A **preset** is a named `(role, size)` pair shipped as module data:

```js
// modules/mobile/presets.js
export default [
  { id: "iphone",     label: "iPhone",         role: "ios",     size: "iphone" },
  { id: "iphone-max", label: "iPhone Pro Max", role: "ios",     size: "iphone-max" },
  { id: "pixel",      label: "Pixel",          role: "android", size: "pixel" }
];
```

Inserting one stamps a frame carrying `role` and `size` as literal values (§7.6 change 3). **Nobody
types `role` by hand** — it arrives with the preset, which is what keeps a hand-authored typo from
producing a frame that silently is not an export unit.

Presets are module data and are not user-writable. A team's own reusable slide is a component, not a
preset (§7.6).

**Brochure, flyer, banner, poster, business card are not roles.** They are `print` size presets — a
width, height, bleed and margin set. A poster is one page at different numbers. Adding a role for
each would multiply the vocabulary without adding a capability.

**`spread` is not a role either.** Facing pages are a `page` at double width with a fold guide. See
`folds` below.

#### `folds`

A `page` may declare `folds: [794]` — positions along the width where the paper physically creases.
A tri-fold A4 landscape is `folds: [794, 1588]`; a magazine spread is `folds: [794]`.

**`folds` is a guide and nothing more.** It draws a line on the canvas so you know where the crease
lands, and it can print fold marks in the bleed area, which is a standard print convention alongside
crop marks. **Export never cuts at a fold.** The deliverable is one whole PDF; the print shop does
imposition and all physical cutting and folding. Artwork spanning a fold is the normal case and the
reason spreads exist at all. A content check — a face or a line of text landing on the crease — is
optional polish, advisory at most, and may be worth nothing in v1.

### 8.3 What the type constrains

**Everything outside a role-bearing frame is freeform.** Mood boards, reference screenshots,
alternate directions, notes, generated images — all fine in any document. This is P6.

**Inside a role-bearing frame,** the capability table applies.

**Nesting:** a role-bearing frame may not contain another role-bearing frame. Slides do not contain
slides. Enforced at write time.

**Cross-type framing is not a thing.** There is no "web frame inside a deck." A frame is a frame; only
its role and its containing document's module give it meaning. Pasting an `ios`-role frame into a
deck strips the role and reports it — the geometry survives, the export unit does not. (There is no
`screen` role; `ios` and `android` are separate roles — §8.2.)

**Speaker notes are visible text with an explicit relationship.**

```js
{ id: "slide-1-notes", type: "text", notesFor: "slide-1",
  x: 0, y: 760, width: 1280, content: "Open warm. Name the school out loud." }
```

A `text` node placed outside the slide frame and adjacent to it, exactly like the frame's title
label. Not a hidden property, not a `note` node: visible on the canvas, editable in place,
selectable, restyleable.

**`notesFor` is required, and adjacency is not a rule.** An earlier draft had the exporter discover
notes by geometric proximity to a slide — in the same document that tells the exporter "no
heuristics, ever." Proximity is ambiguous the moment there are two nearby text nodes, and it silently
breaks when somebody drags a slide. `notesFor` names the slide; the editor sets it when you use the
notes affordance; the exporter reads it and never measures anything.

Validation: `notesFor` must name a frame with role `slide` in the same document, the node must be
**outside** that frame, and at most one node may claim a given slide. Deleting the slide deletes the
association and reports it.

---

## 9. The capability table

Each module declares one, and it is **data, not code** — which is what makes adding a target a data
exercise rather than a new exporter.

```js
// modules/deck/capabilities.js
export default {
  target: `pptx`,
  roles: { slide: { height: `fixed`, ordered: true, cardinality: `N:1`,
                    uniformSize: true,
                    // logical px @96dpi; physical slide size is declared, not inferred (§10.3)
                    sizes: { "16:9": { w:1280, h:720, physical: { w:13.333, h:7.5, unit:`in` } } } } },
  axes:  { appearance: `select-at-export`, interaction: `ignore`, viewport: `ignore` },
  layout: { "*": `resolve-to-geometry` },      // §7.4 — explicit, never inferred from absence
  nodes: {
    frame: `native`,        // → a:grpSp, or its children inlined — see below
    text: `native`, rectangle: `native`, ellipse: `native`, polygon: `native`,
    line: `native`, path: `native`, icon: `native`,
    group: `native`, ref: `native`
  },
  properties: {
    "fill.solid":            `native`,
    "fill.image":            `native`,
    "fill.gradient.linear":  `native`,
    "fill.gradient.radial":  `native`,
    "fill.gradient.angular": `raster`,
    "fill.gradient.mesh":    `raster`,
    "effect.blur":           { verdict: `native`, status: `unverified` },
    "effect.shadow":         { verdict: `native`, status: `unverified` },
    "effect.backgroundBlur": `raster`,
    "blendMode":             { "*": { verdict: `raster` } },
    "transform.rotate":      `native`,
    "transform.skew":        `raster`,
    "text.marks.fill":       { solid: `native`, "*": `raster` },
    "text.marks.link":       `native`,
    "text.marks.weight":     { verdict: `native`, requires: `concrete-face` },
    "text.marks.wordSpacing":`raster`,
    "text.marks.fontVariation": `raster`,
    "text.paragraphs.list":  { verdict: `native`, status: `unverified` }
    // … the remaining property paths; §24.1 carries the current table
  }
};
```

Note what is **not** in `properties`: `layout.grid` and `layout.wrap`. Layout compiles away (§7.4) —
and because absence must never be interpretable, the module states that explicitly in its own
`layout` block rather than leaving it to be inferred from an omission.

**Three things in that example changed in revision 4, and each was an overread:**

- **`image` is gone from `nodes`**, replaced by `fill.image` in `properties`. There is no image node
  (§7.1).
- **`effect.shadow.inner`, `.glow` and `.softEdge` are gone.** DrawingML's `a:effectLst` really does
  admit `a:outerShdw`, `a:innerShdw`, `a:blur`, `a:glow` and `a:softEdge` — that research is correct.
  But Canvas has only `shadow`, `blur` and `background_blur`
  (`openpencil-engine.mjs:296-303`), so revision 3 wrote capability entries for three properties that
  do not exist. The two that do exist are marked `unverified`, because an element existing is not
  proof that every one of our shadow's parameters — radius, spread, offset, colour, blend — maps to
  its OOXML attributes. That mapping is a Stage-8 test, not an assumption.
- **`blendMode` is `raster` for every value.** `ST_BlendMode` genuinely contains exactly `over`,
  `mult`, `screen`, `darken` and `lighten`. The same research says `a:blend` is a primitive *inside
  an effect DAG*, not a general per-shape blend property, and Canvas blend lives on fill/stroke/effect
  objects and composites the object against its backdrop (`openpencil-engine.mjs:197-220`). Shared
  value names are not a demonstrated mapping. Blend becomes `native` per value when, and only when, a
  generated `.pptx` over a nontrivial backdrop image-diffs against Skia inside tolerance.

### 9.1 Three verdicts

| Verdict | Meaning | Editor signal |
| --- | --- | --- |
| `native` | **Expressible in the target.** The exporter can write it as the target's own construct | none |
| `raster` | Exported as an image. Pixel-exact, not editable | consequence at author time |
| `ignore` | Has no meaning in the target and is dropped — a hover state in a PDF | consequence naming what was lost |

#### `native` means expressible, not identical

This is the definition that took two attempts. The first read *"exports as a live, editable object,"*
which fails in two directions at once.

It fails **downward**: a PDF text object is selectable and searchable but is not an editable
paragraph; emitted SwiftUI is editable text but has lost Canvas's component identity. Under the old
definition almost nothing about PDF or source targets could be called `native`.

It fails **upward**, and worse: PowerPoint re-shapes and re-line-breaks editable text at open time
using its own metrics (`pptx-capabilities.md:257-271`). Embedded fonts reduce substitution but do not
make Skia and PowerPoint measure identically. Under the old definition every text node in every deck
would be `raster`, which would flatten exactly the decks this architecture exists to keep alive.

So:

> **`native` = the target can express this construct as its own object.**
> Not "it will land pixel-identical."

The residual difference is real and it is **reported, not hidden** — as a `reflow-risk` consequence
(§9.3), which is a tolerance, not a verdict. This is the trade the plan previously refused to make
while promising all of its benefits at once: **we keep editable text and accept measured rendering
tolerance.** We do not insert hard line breaks to fake fidelity, because that destroys the reflow
that US-1 depends on. We do not rasterize text that merely re-measures, because that is §1.1.

An author who wants pixel-exactness for a specific node says so with `export: "image"` (§9.5).

#### `native` may lower an abstraction

`ref: native` is honest under this definition even though PPTX has no general component-instance
object, and neither do HTML, SwiftUI or Compose in the form we emit. The exporter **lowers** a ref:
it resolves the instance and writes the resulting children as target-native objects, preserving a
layout part or a CSS class where the target has one. Source abstraction is lost; visual and semantic
content is not.

What the tables must never do is use `native` to imply the abstraction survived. Where the loss
matters — a component instance becoming nine independent shapes that no longer update together — the
exporter emits a `lowered` note in the export report (§10.5). Not a consequence, because nothing was
lost from the artifact; a record, because the user should know their deck is no longer parameterised.

#### There is no `forbid`

Almost nothing is genuinely impossible; "PowerPoint has no mesh gradient" really means "this exports
as an image." Forbidding it means the designer fights the tool. Allowing it with a clear consequence
means they choose. This is P3, and it removes an entire class of "why won't it let me" support burden.

#### There is no `substitute` either

An earlier version had a fourth verdict for swapping a node for a defined alternative — video to a
poster frame, Lottie to a first frame, a table to a SwiftUI `List`. Every example failed on
inspection. Rasterizing a video node *renders its poster frame*, so the substitute and the raster
path produce the identical result. The same held for Lottie. And `table` → `List` was simply wrong:
our `table` would be a bordered grid of cells, SwiftUI's `List` is a scrolling stack with system
chrome, and SwiftUI has had `Grid` since iOS 16, making the honest verdict `native`. Three flagship
examples, three collapses — and all three of the node types involved turned out not to exist (§7.1).

Non-visual constructs — a viewport mode, a hover state, a flow transition — have no pixels to
rasterize, so `ignore` plus a consequence is the only option and is sufficient.

The strong pressure not to rasterize comes from the **role Skill**, read before the work starts, not
from a wall hit afterwards.

### 9.2 Completeness — the table must be total

A capability table with twelve entries and no default is worse than no table, because an omitted
entry silently means whatever the reader assumes. That is precisely the unfounded-assertion failure
this document keeps catching in itself.

> **Every export-relevant schema path must have an entry in every module's table. Unknown is an
> error at capability-table validation, in CI, not at export.**

The check is mechanical: enumerate the schema's paths, diff against each table's keys, fail the build
on any path missing from any table. Adding a property to the model therefore *forces* four decisions,
at the moment somebody is thinking about that property, which is the only time they will be answered
honestly.

**This requires two things revision 3 did not have, and both are now scheduled.**

*First, a machine-readable schema.* §7 is prose and examples. The shipped Yjs validator accepts any
non-empty node `type` and arbitrary JSON properties (`collaboration/pen-yjs-model.mjs:379-397`), so
there is nothing for CI to enumerate. **Stage 4 of §17 produces one canonical schema** — root fields,
every node variant, nested fill / stroke / effect / mark / paragraph objects, conditional cascades,
role and module constraints — and *generates* both the runtime validators and the capability-path
inventory from it. Neither is hand-maintained; that is the whole point.

*Second, the right scope.* Revision 3 required totality over node properties only, which left the
constructs that most obviously determine output outside the check entirely — which is exactly why
PPTX transitions were researched as native, written into a deck example, and never scheduled.
Totality covers **five domains**:

| Domain | Examples |
| --- | --- |
| `root` | axes, variables, paragraph styles, imports |
| `roles` | sizes, physical size, folds, bleed, uniformity constraints |
| `nodes` | the node type vocabulary |
| `properties` | every nested property path on every node |
| `relationships` | flows, triggers, `notesFor`, refs and their lowering, accessibility fields |

Every target must say, for every path in all five, how it survives, lowers, resolves or is ignored.

**Until that schema exists, §24's tables are labelled illustrative, and they are.** The second-pass
audit checked and the totality rule holds against none of them: the print, web and mobile tables carry
8–13 property rows each, and all four omit properties used in this document's own examples —
`fill.image`, stroke and its subproperties, opacity, clip, corner radius, flips, `textGrowth`,
`content`, font family/size/style, line height, letter spacing, alignment, italic/underline/strike,
paragraph spacing and indent, `export`, `description`, `visible`, `notesFor`, and everything
icon- and path-specific. Declaring a rule the data violates is worse than having no rule, so the rule
now arrives with the artifact that makes it enforceable.

#### The entry grammar

There are exactly three verdicts, and revision 4 makes that true of the serialized data rather than
only of the prose. Revision 3's tables contained `native-if-face-exists`, `unverified`,
`native-sdk:18`, `native-helper` and `native-approx` sitting in the verdict slot; saying "those are
not verdicts" does not make it so when they occupy the field.

**An entry is either a bare verdict string, or an object with a `verdict` key.** All the extra
information moves into sibling fields:

```js
{ verdict: "native" | "raster" | "ignore" | null,
  status:  "verified" | "unverified",      // default "verified"
  requires: "concrete-face" | "sdk:31" | "compose:1.7" | …,   // export-time precondition
  helper:   "…",                            // emitted support code the target needs
  approximation: "…" }                      // what differs, and why it is still expressible
```

- **`verdict: null` with `status: "unverified"` is the honest unknown**, and it is
  **build-blocking**: a module cannot ship a table containing one. This is the mechanism that
  replaces guessing.
- **`status: "unverified"` on a stated verdict** means we believe it and have not yet run the test.
  It blocks that module's exporter stage, not the whole build.
- **`requires` failing at export emits a consequence** and falls back — a numeric font weight needs a
  concrete face because `a:rPr` has only a bold flag.
- **`approximation` implies a consequence.** Revision 3 had `native-approx` both count as `native`
  and emit a consequence, contradicting "`native` never produces a consequence". Now the verdict is
  `native`, the approximation is metadata, and the consequence comes from the metadata being present
  — the rule survives intact.

Keyed forms are unchanged and may nest either shape:

```js
"transform.skew":     `raster`                                    // flat, verified
"blendMode":          { multiply: `native`, "*": `raster` }        // by value
"fill.gradient.mesh": { ios: `native`, android: `raster` }         // by role
"effect.blur":        { verdict: `native`, status: `unverified` }  // object form
```

`"*"` is the required fallback in any keyed form.

### 9.3 The `consequences` channel

One channel, on every write and again on every export. An earlier draft keyed it on the document
type; that is wrong for `mobile`, where `fill.gradient.mesh` is `native` for `ios` and `raster` for
`android` **in the same document**. So:

> **Consequences are evaluated against the containing role-bearing frame**, resolved through refs,
> together with the module's declared target version. A node in no role frame produces none (P6).

```json
{ "ok": true, "touched": 3,
  "consequences": [
    { "node": "hero-bg", "kind": "raster",
      "why": "OOXML has no mesh gradient element",
      "instead": "Use a multi-stop linear gradient to stay editable" },
    { "node": "s1-title", "kind": "reflow-risk",
      "why": "PowerPoint re-measures Inter at open time; line count may differ from the canvas" }
  ] }
```

#### One field, one closed vocabulary

The field is **`kind`**, not `verdict`. They were the same field in an earlier draft, which is why
`verdict: "resolution"` and `verdict: "overflow"` appear in it — values that are not verdicts and
never were. A verdict is a property of the *capability table*; a consequence is a property of *this
node right now*. Splitting the names splits the concepts.

| `kind` | Raised when |
| --- | --- |
| `raster` | a `raster` verdict applies and the author did not ask for it |
| `ignore` | an `ignore` verdict dropped something meaningful |
| `reflow-risk` | the target re-measures text itself; line count may differ (§9.1) |
| `overflow` | content exceeds a fixed-height frame — `didExceedMaxLines()` (§21.3) |
| `resolution` | placed image resolves below the target's DPI floor |
| `missing-glyph` | the resolved face has no glyph for a codepoint in `content` |
| `contrast` | foreground/background fails the target's legibility floor — advisory |

Closed set. Adding a kind is a decision, not a string somebody types at a call site.

**`native` never produces a consequence.** **`why` is always present.** **`instead` is present only
when a real alternative exists** — an earlier draft made it mandatory, which guarantees invented
remedies, and an invented remedy is worse than none. `reflow-risk` frequently has no `instead`, and
that is the honest answer.

### 9.4 The raster scope rule

Rasterization applies to the **smallest isolated compositing subtree** containing the offending node.
A mesh gradient inside a slide rasterizes the frame that isolates it, not the slide — the title and
body stay live text. This rule is what keeps §1.1's failure, flatten the whole slide, from recurring.

**Isolation is a compositing property, not a geometric one.** An earlier draft defined the boundary
as "nothing outside overlaps its visual bounds," which is both too strict and too loose. Too strict:
two ordinary siblings can overlap all day and still export as two separate shapes, because z-order
preserves the result. Too loose: a backdrop blur reads pixels from *behind* it, a blend mode composes
against whatever is beneath, a mask or an ancestor clip changes what is drawn, and group opacity
changes how a whole subtree composes — none of which bounds arithmetic detects.

**The rule starts at the offending node and widens only for a real pixel dependency.**

1. **Begin with the smallest subtree containing the offending draw** — often a single leaf. A
   rectangle with a mesh fill rasterizes as one bitmap placed at its own z-position, and the result
   is identical, because ordinary source-over compositing is exactly what placing an image does.
2. **Widen upward only when a pixel dependency crosses the boundary:** the subtree samples what is
   behind it (backdrop blur), something composes against it with a blend other than `over`, an
   ancestor applies group opacity below 1, or a mask or clip whose semantics the target cannot
   express covers it.
3. **Stop at the first ancestor where no such dependency crosses.**

Revision 3 required the subtree to *already form* a compositing context and walked upward until it
found one. That is backwards: forming a context is a technique for containing a dependency, not a
precondition for rasterizing. A plain mesh-filled rectangle forms no context, so the old rule walked
up — potentially to the slide — and recreated the whole-slide flattening it exists to prevent.

A ref is expanded before the walk, because its resolved children carry the effects.

Test corpus, and it must exist before this ships: blend mode over a sibling, backdrop blur over a
sibling, ancestor clip, group opacity, masked sibling, and a ref whose target contains all five.

### 9.5 `export: "live" | "image"` — author intent

> **Provenance: now AGREED via DEC9 (§0.4).** The field is `export: "default" | "image"`, a one-way
> author override forcing rasterisation. The value `live` is withdrawn.

Rasterization has two entirely different causes and an earlier draft had a name for only one of them.

- **The target cannot express it.** A mesh gradient in a deck. The system decides; the author gets a
  `raster` consequence and a remedy.
- **The author does not want it live.** A treated wordmark, a chart rendered for exactness, any node
  the author considers *design* rather than *content*. The author decides.

```js
{ id: "n9", type: "text", content: "SUMMIT 2026",
  stroke: { width: 3 }, export: "image" }
```

`export: "image"` rasterizes deliberately and **emits no `raster` consequence**, because a warning
about something you asked for is noise. It also suppresses `reflow-risk` on text, which is the point:
this is how an author says "this headline must land exactly, I will never edit it in PowerPoint."

`export: "live"` is the default and means "prefer the most editable native form; tell me where
fidelity slips."

**Outlining text to paths was considered and dropped.** It would preserve shape while losing
editability — the same trade as raster, with more machinery. It is also not currently possible: the
shipped CanvasKit 0.40.0 exposes `getGlyphBounds`, `getGlyphIDs` and `getGlyphIntercepts` but has no
glyph-to-path binding at all. Raster is the same outcome, available today.

### 9.6 Where constraints bind

**Advisory everywhere. Reported at write time on role-bearing frames.**

Draw a mesh gradient in scratch space: silence. Move it into a slide: the write result carries
`consequences`. This is the only design that respects both P6 and P1.

Export re-evaluates the same tables and returns the same shapes, because export sees things a write
cannot: the selected axis modes, the resolved bindings, the actual asset pixel dimensions, and the
resolved font faces.

## 10. Export

### 10.1 Shape

```
canvas documents export --input '{
  "documentId": "…",
  "role": "slide",
  "frames": ["slide-1", "slide-2", "slide-3"],
  "destination": "/Users/me/Desktop/deck.pptx",
  "modes": { "appearance": "light" },
  "profile": null,
  "bindings": [ { "schoolName": "Universal International School" } ]
}'
```

**`destination` is an absolute path.** Relative paths have no defined base — the agent's cwd is not
the user's. Where the controller may write is §25.2, which is a *measured* question and not one the
manifest answers.

**`frames` is explicit and ordered.** No heuristics, ever. Export one slide, three slides, or all
nineteen. The order in the array is the order in the artifact. For `route`, `ios` and `android` order
is ignored and each frame becomes its own file within the bundle.

**`role` is required, not optional.** It selects the exporter. An earlier draft made it optional and
inferred it from the frames, which is a heuristic in the one place this document promises there are
none, and it fails outright on a `mobile` document holding both `ios` and `android` frames. Every
named frame must carry the named role; a mismatch is an error listing the offending frames.

**Format is never a parameter — the role implies it.** `.pdf` from a `deck` is a *conversion*, done
after the `.pptx` exists, not a second exporter, because a second exporter is exactly how A-strategy
fidelity rot starts. The one exception is `documents.export-image`, where PNG-vs-SVG *is* the request
(§8.1).

**`modes` selects axis modes** (§7.3). Omitted axes take their first mode. Only `web` compiles modes
into the artifact instead of resolving them.

**`profile` is a target-conformance selector**, valid only where the module declares profiles. For
`print`: `PDF/A-3`, `PDF/X-4`, `PDF/UA-1`, or `null`. An earlier draft listed four PDF profiles in
the capability table and then gave the export request no way to ask for one. A profile **tightens
the capability table** — under `PDF/UA-1` a missing `description` is an error rather than an
advisory — so it is a dimension of the table, not a post-processing step.

### 10.2 The artifact is a bundle

> **Provenance: written, not discussed.** No user decision stands behind this section. Do not build from it without asking. See §0.

An earlier draft said `route`, `ios` and `android` are "1 frame → 1 file." That is false the moment
web output includes CSS and assets, or SwiftUI output includes the `FlowLayout` helper (MOB-1).

> **Cardinality is frames → *bundle*, not frames → file.**

`destination` names a **file** when the role produces one (`slide` → `.pptx`, `page` → `.pdf`) and a
**directory** when it produces many:

```
/Users/me/site/
  index.html
  pricing.html
  styles.css
  assets/hero-3f9a2c.png
  export-report.json
```

The contract, which every source exporter must satisfy:

- **Filenames derive from the frame `name`**, slugified, with the role's extension.
- **Collisions are an error before anything is written**, naming both frames. Never a silent `-2`.
- **Assets are content-addressed** into `assets/`, using the `sha256` the asset store already carries
  (§25.1) — so the same image referenced by four routes is written once.
- **Helper/runtime files** (a SwiftUI `FlowLayout`, a CSS reset) go in a single `_canvas/` directory,
  are byte-identical across exports, and are listed in the report. One self-contained file per helper,
  not a package: a package implies versioning and a dependency the user's build must resolve, and we
  are emitting source precisely to avoid that.
- **The directory is written atomically** — build in a temp directory, move into place — so a failed
  export never leaves half a site.

### 10.3 The exporter IR

> **Provenance: written, not discussed.** No user decision stands behind this section. Do not build from it without asking. See §0.

**Every exporter reads one intermediate representation. No exporter walks the document.**

This closes a real ambiguity: the plan alternately had exporters reading canonical model semantics,
resolved scene geometry, prepared render nodes, and rasterized subtrees. Those carry *different
information*. Prepared render data has lost components, variables, marks, axes and provenance; the
canonical model has no final geometry. An exporter needs both at once, and PPTX proves it — it
stores resolved EMU coordinates (geometry) as text runs with bullet properties (semantics).

```json
{
  "projection": "resolved",
  "output": { "kind": "slide", "index": 2, "width": 1280, "height": 720, "unit": "px",
              "physical": { "w": 13.333, "h": 7.5, "unit": "in" } },
  "modes":  { "appearance": "light" },
  "nodes": [
    { "id": "s3-title", "type": "text",
      "geometry": { "x": 120, "y": 340, "w": 1200, "h": 180, "rotation": 0 },
      "paint":    { "fill": { "kind": "solid", "value": "#0b1620" } },
      "semantics": {
        "content": "Q3 revenue",
        "runs": [ { "from": 0, "to": 2, "weight": 700 }, { "from": 2, "to": 10 } ],
        "paragraphs": [ { "from": 0, "to": 10, "style": "slide-title", "level": 1 } ],
        "language": "en", "description": null
      },
      "provenance": { "from": "master-title", "prop": "heading", "lowered": true },
      "parent": "s3-body", "z": 4, "clip": null, "isolation": null }
  ],
  "rasters": [ { "id": "s3-logos", "bounds": { … }, "reason": "fill.gradient.mesh",
                 "pixels": { "w": 1600, "h": 900 }, "ppi": 220, "colorSpace": "sRGB",
                 "alpha": "premultiplied", "outset": { "l": 24, "t": 24, "r": 24, "b": 24 } } ]
}
```

#### Two projections, one contract

The IR has **two projections of the same document**, and an exporter declares which it consumes:

| Projection | Contains | Consumed by |
| --- | --- | --- |
| `resolved` | axes selected, conditions collapsed, absolute geometry on every node | `deck`, `print`, and every `raster` subtree in any target |
| `semantic` | the layout tree with track definitions, sizing modes and constraints intact; unresolved variants keyed by axis mode; conditions as AST | `web`, `mobile` |

Revision 3 said "no conditional survives into an exporter" and "every node carries absolute
geometry", and in the same document required the web exporter to emit appearance media queries,
viewport media queries, `:hover` rules, `display: grid` and wrapping flex. You cannot reconstruct a
discarded cascade from the value it resolved to, and you cannot reconstruct a grid from one
rectangle. The two statements were incompatible and the web/mobile exporters were the ones that would
have discovered it.

**"One IR" means one contract with two projections, not one fully resolved instance.** Both are built
by the same pipeline from the same document; `semantic` simply stops before the collapsing steps and
carries a `resolved` geometry snapshot alongside, because source targets still need geometry for
raster subtrees and for a starting layout.

#### The scene graph is a graph

The `nodes` array carries `parent`, `z`, `clip` and `isolation` on every entry, so it reconstructs a
tree with sibling order. Revision 3's example was a flat list with no structure at all, in the same
document whose raster scope rule (§9.4) depends on parent/child structure, sibling z-order, clips,
masks, group opacity, blend inputs and backdrop dependencies. A flat list cannot answer any of those
questions.

`rasters` likewise carries what an exporter actually needs to place a bitmap: final pixel dimensions,
the ppi they were computed at, colour space, alpha convention, and the outset that effects bleeding
past the node's bounds require.

#### Raster scale is derived, never a magic number

Revision 3 wrote `"scale": 2`, which means nothing in common across a 300-dpi print page, a
PowerPoint slide, responsive CSS and @1x/@2x/@3x mobile assets. **The IR carries target ppi and final
pixel dimensions**, derived from:

- **print** — 300 PPI / 3.125× as a Canvas commercial-print policy (PDF/X and PDF/A specify no
  minimum image resolution), plus bleed expansion where the page declares it;
- **deck** — 96 PPI / 1×, matching PowerPoint's documented default slide-image export;
- **web** — 96/192/288 effective PPI at 1×/2×/3×;
- **iOS** — 192/288 effective Canvas PPI at Apple's @2x/@3x scales;
- **Android** — 120/.75×, 160/1×, 240/1.5×, 320/2×, 480/3× and 640/4×.

Effect outsets are added before pixel dimensions are computed, so a shadow is never clipped by the
node's own bounds. Canvas passes `radius / 2` as Skia sigma and Skia truncates at
`ceil(3 × sigma)`, so `k = ceil(3r/2)`. Layer/foreground blur adds `k` on every side; an outer
shadow adds `max(0,k+spread∓offset)` per side; inner shadow and background blur have zero external
ink outset, while background blur widens the dependency scope to the nearest isolation boundary.
Multiple effects take the per-side maximum. The evidence and citations are in
`research/export-constants-and-flow-prior-art.md`.

#### Responsibilities

What the IR is responsible for, once, so four exporters are not each responsible for it:

1. **Refs resolved**, with `provenance` recording what they came from and whether the abstraction was
   lowered (§9.1).
2. **Axes and props resolved** against `modes` — in the `resolved` projection. In `semantic`, axis
   variants and prop conditions are carried through as data for the exporter to compile into media
   queries, pseudo-selectors or size classes.
3. **Variables and bindings interpolated**, with mark offsets already shifted (§7.2).
4. **Layout run**, so every node carries absolute geometry (§7.4). In `semantic`, the normalized
   layout tree — direction, track definitions, gaps, sizing modes, min/max constraints, wrap — is
   preserved *alongside* that geometry, because `display: grid` and SwiftUI `Grid` cannot be
   recovered from a rectangle.
5. **Marks flattened to non-overlapping runs**, sorted — the operation every target wants and none
   should implement.
6. **Capability verdicts applied**, so `rasters` is a finished list of subtrees with the scope rule
   (§9.4) already evaluated, and `consequences` is a finished list.
7. **Semantics preserved**: paragraph style names and heading levels, list structure, language,
   `description`, link targets, `notesFor`.

The cost is real design work and it is the right trade: capability checking, raster scoping, asset
resolution and diagnostics happen once rather than four times, and the IR is inspectable, which is
what §25.7 asks for. Per-exporter direct traversal starts faster and then duplicates every resolution
rule four times, diverging on the third one.

**Units — one canonical unit, and physical size is declared rather than derived.**

Canonical storage is **px at 96 dpi**, everywhere, for every module. It is the unit the model already
uses, the one the renderer draws in, and there is no second logical unit anywhere in the system.
Conversions are fixed and total:

```
EMU        = px × 9525
PDF points = px × 0.75
CSS px     = px            (identity)
iOS pt / Android dp = px   (identity; @2x/@3x are asset scales, not coordinates)
inches     = px / 96
```

Revision 3 stated exactly these constants — they are correct — and then contradicted every one of
them with its own presets. It called A4 `595×842` and said those were points; under the canon that
exports as 446×632 pt, **6.2 × 8.8 inches**, not A4. It called a deck `1920×1080`, which is a
**20-inch-wide slide**. And it said "iOS points and Android dp are px at the frame's density", naming
a `density` field no frame schema contains.

Two corrections, and they are the whole fix:

1. **Presets carry 96-dpi-correct dimensions.** A4 is `794 × 1123` px. Letter is `816 × 1056`. The
   numbers are now what the canon says they mean.
2. **A role that has a physical size declares it**, as `physical: { w, h, unit }` on the size (§9).
   A slide's design resolution and its physical size are genuinely independent facts — a `1280×720`
   slide is 13.333 × 7.5 inches by PowerPoint convention, not 13.333 × 7.5 because of a dpi
   calculation. Deriving one from the other was the mistake. Web and mobile declare no `physical`,
   because they have none.

No density field, no dual unit system, no per-module logical unit. One number, one meaning.

**Colour — sRGB only in v1, with one bundled output intent.**

Canonical is **sRGB**, stored as it is today. There is no colour space on a fill, no ICC profile on a
document, and no output intent selector in the export request — so CMYK and spot colour are **not in
the print table** (§24.2).

PDF export writes sRGB with a **single bundled output condition**: `sRGB IEC61966-2.1`, shipped as
module data on the `print` module, embedded as the PDF's `OutputIntent`. It is not selectable, not a
parameter, and not derived from the document. This satisfies PDF/A-3 and PDF/UA-1, which require *an*
output intent rather than a specific one. It does **not** satisfy an arbitrary print provider's PDF/X
requirement, and that is a stated v1 limitation rather than a hidden one: a provider demanding
FOGRA51 needs the colour model in §19, which is a real model change and not a flag.

### 10.4 Templating

> **Provenance: written, not discussed.** No user decision stands behind this section. Do not build from it without asking. See §0.

`bindings` is an array. N binding sets produce N artifacts, and **layout re-runs per set** — which is
the whole point, and the thing the §1.1 pipeline could not do. Long school names reflow instead of
overflowing.

Destination for N>1 takes a pattern: `/Users/me/Desktop/decks/${schoolName}.pptx`.

**A binding value is not a filename**, and interpolating one straight into a path is how you get
`../`, a stray `/`, a reserved device name, a colon, or two Unicode spellings of the same name that
collide after normalisation. So:

- **Each binding set supplies an explicit `output` name.** If the pattern interpolates a binding, the
  resolved value must be a valid single path segment: no separators, no `.` or `..`, no control
  characters, no reserved device name, NFC-normalised, non-empty, within the platform's length limit.
- **A value failing any of those is an error naming the binding and the value.** Nothing is
  sanitised silently — a deck quietly written as `Universal_International_School` when the user asked
  for `Universal/International School` is a file they will not find.
- **Collisions across binding sets are an error before anything is written**, naming both sets. Never
  an automatic `-2`; that would contradict §10.2's rule on frame filenames.
- **An existing destination is an error.** Export never overwrites and never versions. Delete it, or
  choose another path. This is the same conservative default as everywhere else in this document.

### 10.5 The export report

Export returns a path and a report, not a bare path:

```json
{ "artifacts": ["/Users/me/Desktop/deck.pptx"],
  "consequences": [ … §9.3 … ],
  "lowered": [ { "node": "s3-title", "from": "master-title",
                 "why": "PPTX layout parts do not carry arbitrary component properties" } ],
  "embeddedFonts": [ { "family": "Inter", "subset": true, "fsType": "installable" } ],
  "rasterized": [ { "node": "s7-logos", "reason": "fill.gradient.mesh", "scale": 2 } ] }
```

The point is that **everything the artifact lost is enumerable without opening the artifact.** That
is the capability the §1.1 pipeline never had, and the reason nobody could tell whether the flattened
deck was a reasonable outcome or a catastrophe.

### 10.6 Presentation is a target, not a mode

Present mode reads the same ordered frame list the exporter reads. It is not a separate concept and
needs no `sequence` collection at the document root — an earlier design that was correctly killed,
because it duplicated information the export call already carries and would have gone stale.

### 10.7 Import

> **Provenance: written, not discussed — see §0.2.** No user decision stands behind this section. Do not build from it without asking. See §0.

**Deprioritised, and explicitly not allowed to shape the model.** §7.6 dropped `descendants` even
though it helps `.pen` round-tripping. Import is a *translation* into Canvas's model, with a
consequences report, and it is fine for it to be lossy. Agents are good at rebuilding.

Cross-type transfer is also **dropped entirely** — no mapping layer, no partial translation report.
An agent rebuilds. That is more consistent than a half-fidelity converter nobody trusts.

---

## 11. Agent surface

Unchanged in shape — `documents.execute` remains the read/write surface. Additions:

| Addition | Reason |
| --- | --- |
| `documents.export` | §10 |
| Root variables and axes writable from scripts | §7.5 change 2 |
| `TakeScreenshot` returning **N separate images** | Today it composites all targets into **one** PNG. For a 19-slide review that is unusable — one giant strip. The multi-target form already exists; the ask is per-target output |
| `Get` without a cap in visitor form | §4.6 / D3 |
| Job handles for long operations | §12.1 |
| Spilled results | §12.2 |

Per-type **Skills**, bundled with the app and discoverable from `--help`, carry the design pressure
(§9.1). The former planning note needed the clarification "bundled and discoverable from help"
rather than implying they are fetched.

---

## 12. Host-level changes this forces

These are **not Canvas problems**. Canvas is where they bit first. Both belong in platform guidance.

### 12.1 A job surface

Keep the 30s limit for synchronous calls — it is a good limit and forces good design. Add a job
surface for anything O(document × N): the operation returns a handle immediately, the agent polls or
is notified.

Exporting 40 personalised decks is minutes of work. Raising a timeout to cover it is the wrong fix
and pushes the failure to 41 decks.

**Belongs in the app-development guidance every agent reads**, because app authors must know when to
declare an operation long-running.

### 12.2 Spills

Bound the **returned payload** by bytes; spill above the threshold to a file and return a path or
signed URL. Prior art in this workspace — Borge's MCP layer: ≤64 KB inline, above that a blob store
plus a signed expiring URL and `{spilled: true, url, expires_at, bytes, mime_type}`. Its guidance is
worth copying too: *"Download it with the agent runtime and continue from the file."*

This is the correct fix for §4.6's `Get` cap. **Bound bytes, not traversal.** Traversal is unbounded;
the payload is what needs a limit.

**It does not remove the ceiling, and an earlier draft said it did.** Spilling bounds the *outer tool
response*. Everything that actually constrains a large document lives inside QuickJS and is untouched
by it: 16 MiB input and 16 MiB output (`script-runtime.mjs:4-5`), a 64 MiB heap (`:29`), 1,000
prints, 10,000 touched IDs / issues / inspection items, and the fact that the complete output
document is always serialised back across the boundary. `Get` in visitor form also builds the entire
matches array and every context *before* invoking the visitor (`:165-176`), so removing its cap does
not make traversal streaming.

Genuinely unbounded traversal therefore needs either streaming visitation or a query path that does
not go through QuickJS at all. That is a real piece of work, listed in Stage 1, and not something
spilling delivers for free.

**Belongs in `penkra_exec_command` guidance, not app-development guidance** — spilling is handled by
the host, so app authors do not implement it, but calling agents must know that a result may arrive
as a path rather than a value.

### 12.3 Canvas-side performance

Fix §4.7 regardless: make the pre-inspection lazy and diff by structural sharing rather than double
`JSON.stringify`. The Atferd document must become reachable before anything else can be measured
against it.

### 12.4 Penkra host defects observed while doing this work

Recorded here because they were found by using the host in anger, and because §12.1/§12.2 are the
same family of problem. Not Canvas issues.

**Canvas editor QA constraint — App tabs are Thread-owned and visibility does not transfer.**
The host stamps `spaceId` and `threadId` into an App-tab descriptor at creation
(`electronAppTabHost.ts:#create`) and exposes no ownership-transfer method. `tabs.list`,
`tabs.snapshot`, and every reference action resolve only tabs in the caller's Space and Thread;
`tabs.current` additionally returns the one globally visible tab only when it belongs to that caller;
`tabs.screenshot` is intentionally visibility-bound and accepts no tab id
(`appCommandPipeServer.ts:#scopedTabs`, `#scopedCurrentTab`, `#tab`). The shell alone selects a pane
and reports visibility through `AppDockPane` → `appTabs.setActive`; an operation can create a retained
tab but cannot make another Thread's surface visible or transfer that tab to itself. Therefore a
thread that does not own the visible Canvas tab can never snapshot, screenshot, or interact with
that tab. Canvas editor QA that requires visible controls must run from the Thread that owns the
visible Canvas tab. The Enter split, newline merge, mark-inclusivity, and same-type clipping checks
are assigned to that Thread rather than classed as blocked implementation work.

There is a narrower host discrepancy: CLI guidance says a retained tab remains semantically
addressable when another tab is visible, but inactive App panes render their iframe with `hidden`
(`AppDockPane.tsx`). In the observed scratch-tab run, the owning Thread could call `tabs.snapshot` by
id, but the hidden frame yielded only the Canvas document root and no actionable descendants. This
does not change the ownership rule above; it means retained-tab addressability is insufficient for
accessibility-driven editor QA unless the pane is visible.

**H1 — `threads create` succeeds when the provider has no quota.**
`penkra capabilities --provider codex` listed `gpt-5.6-sol` as available. Three `threads create`
calls all returned `status: task_dispatched`. Six minutes later all three were `error`:
*"You've hit your usage limit."* The failure is a property of the account, known before dispatch.
Either `capabilities` should report remaining quota, or `create` should fail fast. Silently
accepting three research tasks that cannot run is the worst of the three options.

**H2 — `threads diagnose` is not bounded.**
Its own help says *"one bounded cross-source assessment."* One call returned **126,325 characters
across 3,390 lines** and overflowed the caller's context, because it inlines full message text
including the entire dispatch prompt. This is exactly the §12.2 spill case, in Penkra's own tooling.

**H3 — Orphaned child threads.**
`agent-1da0c6af…` errored, but two of its `provider_native` Codex subagents remained `working` with
a dead parent. Nothing will consume their output. Child threads should be interrupted when the
parent turn terminates abnormally, or the status should reflect that they are orphaned.

**H4 — `isSelf` is undocumented.**
Every `threads list` row carries `isSelf`. It appears in no schema and no help text. Its meaning is
inferable — true for the calling thread — but an undocumented response field is a field agents
will guess at.

**H5 — `folders list` is space-blind.**
Returns 13 folders, **four of them titled "Main"**, with no space id, no parent, no archived flag —
only `folderId`, `title`, `workspaceRoot: null`, `isPinned`. There is no way to tell which space a
folder belongs to, and `threads list` has no space filter either. An agent asked to "put this in
Main" cannot resolve the reference.

**H6 — Manual wording on provider subagents is too absolute.**

> *"Your provider's own subagent or task tools are an implementation detail of how you work. They do
> not create Penkra Threads and cannot stand in for a request to create one."*

The factual half is right and should stay. The prescriptive half over-reaches: it reads as a ban on
provider subagents generally, when the actual rule is narrower — **do not silently substitute a
provider subagent for an explicit request for a Penkra Thread.** Using a provider subagent on your
own initiative for internal fan-out is legitimate. Suggested wording:

> Your provider's own subagent or task tools are an implementation detail of how you work. They do
> not create Penkra Threads. Use them freely for your own internal work, but when the user asks for
> a Thread — or when work should be visible, resumable, and addressable by the user — create a real
> Penkra Thread and do not substitute a provider subagent for it.

### 12.5 Root causes for §12.4, read from source

**H1 root cause — `threads create` picks a Connection by list order, ignoring the user's default.**

`apps/server/src/provider/Layers/ProviderTurnSelectionResolver.ts:184` —
`resolveNewThreadConnection` resolves like this:

```ts
const connection = entries.find((entry) => {
  if (entry.harness !== harness || entry.lifecycle !== "active") return false;
  const method = findConnectionAuthenticationMethod(entry);
  return method?.authorizesInternalProvider(internalProviderId) === true;
});
```

**`entries.find` — first active Connection that authorizes the model wins.** There is no preference,
no tie-break, no quota check, and no consultation of whatever the composer shows as the selected
Connection when the user switches to Codex.

**CORRECTION.** An earlier draft of this section claimed no Connection default exists as data.
That was wrong — it was a bad grep (`defaultConnection|preferredConnection|isDefault`). The default
does exist and is persisted. It is just persisted in a place the server cannot read.

`apps/web/src/composerDraftDomain.ts:168`:

```ts
stickyConnectionByProvider: Partial<Record<ProviderKind, ProviderConnectionId | null>>;
```

persisted through zustand's `persist` middleware under
`COMPOSER_DRAFT_STORAGE_KEY = "penkra:composer-drafts:v1"`
(`composerDraftStore.ts:90-97`, `composerDraftDomain.ts:41`). That is why the chosen Connection
survives an app restart, and why switching it sticks.

Two things follow, and they are the actual architecture problem:

1. **Scope is `Partial<Record<ProviderKind, …>>` — per provider, globally.** Not per Space, not per
   folder. One Codex default for the entire client.
2. **It lives in the web client's composer draft store.** `resolveNewThreadConnection` runs in
   `apps/server` and has no access to a browser-persisted zustand store. The server genuinely cannot
   see the user's default, so it falls back to `entries.find` list order.

There is also a **per-thread server-side binding** — `ThreadProviderBindingRepository`
(`apps/server/src/persistence/{Layers,Services}/ThreadProviderBindings.ts`, wired in
`serverLayers.ts:37`, read in `wsRpc.ts:1323-1326` and by `ProviderLaunchResolver`). This is why
`threads send` into an existing composer-created thread uses the right account while
`threads create` does not: an existing thread has a persisted binding; a new one has nothing, so it
falls to list order.

**So the correct statement of the bug:** the Connection default is client-side sticky UI state, the
per-thread Connection is server-side durable state, and there is no server-side *default* between
them for a brand-new thread to inherit.

Consequence, observed live: the account has two Codex Connections — one Plus (quota exhausted) and
one Pro (fine, and the one the composer defaults to). All three gateway-created threads got the
Plus one and died on a usage limit. The user's composer default was never consulted, because it is
UI-side state that `resolveNewThreadConnection` cannot see.

**Direction — keep the agent surface out of it.** Spawning a thread should take
`provider`, `model` and options like `reasoningEffort`, and **nothing about Connections**. The moment
`threads create` accepts a `connectionId`, the gateway also owes agents a way to list Connections,
compare their quota, and reason about which account to spend — an entire surface area nobody wants,
exposing billing detail to an agent that has no business making that call. The Connection is the
user's standing choice; the agent inherits it.

That means the default has to move to where the server can read it. Candidate shapes, to be decided:

- **Per Space × provider**, server-side. Matches how Spaces already scope work, and a user with a
  work account and a personal account plausibly wants them split by Space.
- **Global per provider**, server-side. Exactly today's client semantics, just relocated.
- **Per folder × provider.** Almost certainly too fine-grained.

**Decided: per Space × provider, server-side.** A user with a work account and a personal account
splits them by Space, which is what Spaces are for. `stickyConnectionByProvider` stops being the
source of truth and becomes a client-side cache of the server value. Low urgency — the quota
fallback below matters more than the scope.

Independent of that decision, three things are wrong regardless:

1. **Silent fallback to list order.** `entries.find` should not be the resolution strategy for
   something that determines whether the turn can run at all.
2. **No fallback on exhausted quota.** When the resolved Connection reports a usage limit and
   another active Connection authorizes the same model, the turn dies instead of retrying. All three
   research threads were lost to this.
3. **The resolved Connection is invisible in the result.** `threads create` returns `provider`,
   `model`, `runtimeMode` — not the Connection, i.e. not the field that actually decided success.
   Even with agents unable to *choose* a Connection, the result should *report* which one ran, so a
   failure is diagnosable without reading server source.

`penkra capabilities` cannot compensate for this. Its availability concept is **harness-level**
("including its unavailable reason when it cannot run" — i.e. is the Codex binary installed and
runnable), not Connection-level or quota-level. It reported `gpt-5.6-sol` as available because
Codex was installed, which was true and useless.

**H4 root cause — `isSelf` is pure duplication. Remove it.**

`apps/server/src/agentGateway/threadSummary.ts:96`:

```ts
isSelf: thread.id === callerThreadId,
```

`penkra context` already returns `caller.threadId`, so every agent can compute this. It is on every
row of every list, documented nowhere, and `threads send` already enforces the one rule it exists to
support ("never target the caller"). Two sources for caller identity is one too many.
**Verdict: delete the field.** If a convenience is wanted, it belongs in `threads list`'s help text
pointing at `penkra context`.

**H3/sidebar — spawned threads should be visible, and the filter is not the cause.**

`apps/web/src/storeSelectors.ts:280`:

```ts
sidebarSummaries.filter((thread) => !thread.parentThreadId && thread.archivedAt == null)
```

The three created threads have `parentThreadId: null`, `archived: false`, and the caller's
`folderId`. They pass this filter. Grepping `apps/web/src` for `creationSource` finds it referenced
only in `storeProjection.ts:84`, `storeNormalization.ts`, and one `ChatView.tsx:900` badge —
**no view filters on `creationSource`**, so `penkra_mcp` threads are not being deliberately hidden.

There are no hidden threads by design. So the remaining suspects are (a) the gateway's
`thread.create` dispatch not reaching the web client's store as a live event, leaving the sidebar
stale until reload, or (b) the created thread not being associated with the space/project scope the
sidebar is querying. **This needs a live repro: create a gateway thread and watch whether the
sidebar row appears without a refresh.** Open item.

### 12.6 What `parentThreadId` governs, and why it goes away

> **Provenance: CONTRADICTED — the user rejected this; slated for deletion.** No user decision stands behind this section. Do not build from it without asking. See §0.

**H7 — what `parentThreadId` actually governs.**

It is not only a sidebar filter. Six distinct behaviours key on it:

| Site | Behaviour |
| --- | --- |
| `orchestration/decider.ts:158-170` | Transitive closure of a thread and **all descendants** — the cascade set for delete/archive |
| `orchestration/decider.ts:502` | Move invariant: *"Nested child threads move together with their root thread."* A child cannot be relocated on its own |
| `orchestration/decider.ts:542` | Only `parentThreadId === null` threads participate in sidebar sort order |
| `orchestration/providerSessionThread.ts:20-32` | **A child thread resolves to its parent's provider session.** Children are not independent runtimes |
| `agentGateway/threadReadTools.ts:359` | The `parentThreadId` list filter |
| `web/storeSelectors.ts:280` + `Sidebar.logic.ts:604-648` | Flat display excludes children; the tree selector re-includes them nested under a "N subagents" toggle |

The fourth row is the load-bearing one. **A child thread is a view into the parent's provider
session, not a peer.** That is why the orphaned Codex subagents in H3 are unreachable — their
session belongs to a parent that errored.

**Decided: all threads are equal. These behaviours are not needed and come out.**

Every row above exists to support a hierarchy the product does not want. Agents can spin up threads;
those threads are threads. Concretely:

| Behaviour | Disposition |
| --- | --- |
| Transitive cascade on delete/archive | **Remove.** Archiving a thread archives that thread |
| *"Nested child threads move together with their root thread"* | **Remove.** Any thread moves anywhere |
| Only `parentThreadId === null` gets sidebar sort order | **Remove.** Every thread sorts |
| Child resolves to the parent's provider session | **Remove.** Own session, own Connection binding |
| Flat display excludes children; tree re-nests them | **Remove.** One flat list |
| `parentThreadId` list filter | **Keep as metadata only** — provenance ("who spawned this"), not behaviour |

`parentThreadId` survives as a **provenance breadcrumb** and nothing else. Nothing branches on it.
This also dissolves H3: a thread whose spawner died is just a thread that is still running.

Sizing: the provider-session change is the real work — child threads currently have no Connection
binding of their own, so this depends on the §12.5 Connection work landing first.

**It does not affect the reported symptom, though.** Gateway-created threads already have
`parentThreadId: null` — the summary above shows all three — so they are top-level and the filter
passes them. The sidebar problem is elsewhere.

**H8 — agents *can* archive.** `penkra threads archive` was called three times during this session
and returned `{"archived": true}` each time. `threads unarchive` also exists. What agents cannot do
is *delete* — which is correct and should stay that way.

---

## 13. Shapes

Concrete node shapes for every construct in §6–§8. These are the contract.

### 13.1 A deck document, end to end

```js
{
  version: "2.17",
  module: "deck",
  axes: {
    appearance: { modes: [{ name: "light" }, { name: "dark" }] }
  },
  variables: {
    "brand-ink":    { tokenType: "color", cascade: [{ value: "#0b1620" }, { value: "#f7f5f0", when: { appearance: "dark" } }] },
    "brand-accent": { tokenType: "color", cascade: [{ value: "#e4572e" }] },
    "font-display": { tokenType: "fontFamily", cascade: [{ value: "Canela Deck" }] },
    "font-body":    { tokenType: "fontFamily", cascade: [{ value: "Inter" }] },
    schoolName:      { tokenType: "string", cascade: [{ value: "[SCHOOL NAME]" }] }
  },
  paragraphStyles: {
    "slide-title": { fontFamily: "${font-display}", fontSize: 96, lineHeight: 0.98,
                     letterSpacing: -3, fontWeight: "700", fill: "${brand-ink}" },
    "slide-body":  { fontFamily: "${font-body}", fontSize: 28, lineHeight: 1.4,
                     fontWeight: "400", fill: "${brand-ink}" },
    "eyebrow":     { fontFamily: "${font-body}", fontSize: 16, letterSpacing: 3,
                     fontWeight: "600", textTransform: "uppercase", fill: "${brand-accent}" }
  },
  flows: [
    { id: "f1", from: "slide-1", to: "slide-2", trigger: { kind: "advance" } }
  ],
  children: [
    { id: "slide-1", type: "frame", role: "slide", name: "Cover",
      x: 0, y: 0, width: 1280, height: 720, fill: "#f7f5f0", clip: true,
      children: [
        { id: "s1-eyebrow", type: "text", start: 120, y: 140, width: 800,
          content: "TRUSTED PARTNERS",                                  // 16
          paragraphs: [{ from: 0, to: 16, style: "eyebrow" }] },
        { id: "s1-title", type: "text", start: 120, y: 220, width: 1400,
          textGrowth: "fixed-width",
          content: "YOU RUN ${schoolName}. WE MAKE SURE IT GROWS.",      // 45
          paragraphs: [{ from: 0, to: 45, style: "slide-title" }],
          marks: [ { type: "fill", from: 8, to: 21, value: "${brand-accent}" } ] }  // the token
      ] },

    // Speaker notes: a real, visible text node OUTSIDE the slide frame (§8.3)
    { id: "slide-1-notes", type: "text", notesFor: "slide-1",
      x: 0, y: 760, width: 1280,
      content: "Open warm. Name the school out loud. Pause before the second sentence.",  // 70
      paragraphs: [{ from: 0, to: 70, style: "slide-body" }] }
  ]
}
```

Note what is **not** here: no `sequence` array, no `reusable`, no `descendants`, no `preset` field on
the node, no `slot`. All removed (§18). `version` **is** here — it was removed in an earlier draft and
restored (§6).

Every range above equals the length of the string it covers. The mark `[8, 21)` is exactly
`${schoolName}`, 13 units, which satisfies §7.2's whole-token rule; an earlier draft wrote `[8, 24)`,
which silently included `. W`.

### 13.2 A component with a typed interface

```js
{ id: "stat-card", type: "frame", name: "Stat card",
  properties: {
    label: { type: "string", default: "Retention" },
    value: { type: "string", default: "94%" },
    tone:  { type: "enum", values: ["neutral", "positive", "warning"], default: "neutral" },
    icon:  { type: "icon", optional: true }
  },
  varies: ["appearance"],
  layout: "vertical", gap: 8, padding: [24, 24, 24, 24],
  width: 320, height: "fit_content", cornerRadius: [16, 16, 16, 16],
  fill: [ { value: "#ffffff" },
          { value: "#101b24", when: { appearance: "dark" } },
          { value: "#f0fdf4", when: { props: { tone: "positive" } } },
          { value: "#fffbeb", when: { props: { tone: "warning" } } } ],
  children: [
    { id: "sc-icon",  type: "icon", bind: { icon: "$props.icon" },
      visible: { op: "notNull", arg: { prop: "icon" } }, size: 20 },
    { id: "sc-label", type: "text", bind: { content: "$props.label" },
      paragraphs: [{ from: 0, to: "$boundLength", style: "eyebrow" }] },
    { id: "sc-value", type: "text", bind: { content: "$props.value" },
      paragraphs: [{ from: 0, to: "$boundLength", style: "slide-title" }] } ] }
```

Instantiation, and the **entire** instance vocabulary:

```js
{ type: "ref", ref: "stat-card", x: 120, y: 600,
  props: { label: "Schools onboarded", value: "41", tone: "positive", icon: "school" } }
```

There is no `descendants` key. If you need the value's colour to differ per instance, you add a
`valueTone` property to the component, or you clone it. That is P5.

Two details this example is carrying:

- **`stat-card` is on the freeform canvas, not inside a slide.** §7.6's rule: a ref target may not
  live in a role-bearing frame. The instance above sits at `(120, 600)` *inside* slide 3; the
  definition does not.
- **`to: "$boundLength"` is not the `to: -1` sentinel §7.2 removed.** A bound string has no length
  until the instance resolves it, so a literal number is impossible here. It is a named, declared
  value with one meaning, resolved before validation, and it is legal only in a node whose `content`
  is bound.

### 13.3 A responsive web route

```js
{ id: "route-home", type: "frame", role: "route", name: "/",
  width: [ { value: 390 }, { value: 768,  when: { viewport: "tablet" } },
                           { value: 1280, when: { viewport: "desktop" } } ],
  height: "fit_content",
  layout: "vertical", gap: 0,
  children: [
    { id: "hero", type: "frame",
      layout: [ { value: "vertical" }, { value: "horizontal", when: { viewport: "desktop" } } ],
      gap:    [ { value: 16 },         { value: 48,           when: { viewport: "desktop" } } ],
      padding: [ { value: [32, 20, 32, 20] },
                 { value: [96, 80, 96, 80], when: { viewport: "desktop" } } ],
      alignItems: "center", width: "fill_container",
      children: [
        { id: "hero-copy", type: "text", width: "fill_container",
          content: "Every school deserves a system that keeps up.",   // 45
          paragraphs: [{ from: 0, to: 45, style: "h1" }] },
        { id: "hero-cta", type: "ref", ref: "btn",
          props: { label: "Book a walkthrough", tone: "primary",
                   fullWidth: [ { value: true }, { value: false, when: { viewport: "desktop" } } ] } } ] } ] }
```

**One frame. Three breakpoints. No duplicated artboards.** This is §7.3's payoff.

### 13.4 Rich text with overlapping marks

```js
{ id: "para", type: "text", width: 640, textGrowth: "fixed-width",
  //        0         1         2          3         4         5         6
  //        0123456789012345678901234 5 678901234567890123456789012345678901234
  content: "We do not sell software.\nWe take responsibility for the outcome.",   // 64
  paragraphs: [ { from: 0,  to: 25, style: "body" },     // includes the \n (§7.2 rule 5)
                { from: 25, to: 64, style: "body" } ],
  marks: [
    { type: "fill",   from: 6,  to: 14, value: "${brand-accent}" },  // "not sell"
    { type: "weight", from: 10, to: 30, value: "700" },              // "sell software.\nWe ta"
    { type: "link",   from: 33, to: 64, value: "https://example.com/promise" },
    { type: "italic", from: 33, to: 64, value: true } ] }
```

Marks 1 and 2 **overlap** — `[10, 14)` is both accent-coloured and bold. A run model would have to
split into three fragments here; the mark model does not. Flattening to runs happens once, in the IR
(§10.3), and no editing operation ever pays for it.

The paragraphs **partition the string exactly**: `[0,25)` and `[25,64)`, contiguous, no gap, covering
everything. The earlier draft of this example used `[0,26)` and `[27,64)` on a string with no newline
at all — which splits mid-word, leaves character 26 in no paragraph, and describes a text node that
could not be built. It is a small error and it is the exact class of error §9.2's completeness rule
and §7.2's invariants exist to make impossible.

### 13.5 A print page with bleed

> **SUPERSEDED IN PART by DEC1/DEC2 (§0.4) — `bleed` stays native, `folds` demotes to guidance, the `page` role is gone.**

```js
{ id: "page-1", type: "frame", role: "page", name: "Cover",
  size: "a4", orientation: "portrait", physical: { w: 210, h: 297, unit: "mm" },
  width: 794, height: 1123,
  bleed: 9, safeMargin: 36,          // points; bleed extends outside width/height
  children: [ … ] }
```

A facing spread — **a `page` at double width with a fold guide**, not a role of its own. Export
writes it as one PDF page; the print shop does imposition.

```js
{ id: "spread-2", type: "frame", role: "page", name: "pp. 2–3",
  size: "spread-A4", width: 1588, height: 1123,
  physical: { w: 420, h: 297, unit: "mm" },
  bleed: 12, safeMargin: 48, folds: [794],
  children: [
    { id: "bg", type: "rectangle", start: -9, y: -9, width: 1208, height: 860,   // into the bleed
      fill: { gradient: "mesh", points: [ /* … */ ] } },                          // native in print
    { id: "hd", type: "text", start: 36, y: 60, width: 500,
      content: "The quiet part",                                                  // 14
      paragraphs: [{ from: 0, to: 14, style: "h1" }] } ] }
```

`bg` spans the fold deliberately — that is what a spread is for. `folds` only draws the guide.

---

## 14. User stories

Each states the trigger, the agent's calls, and what the system does. These are the acceptance
criteria for everything above.

### US-1 — The forty decks (the story that started this)

> *"Personalise this deck for these 40 schools and put the PPTX files on my Desktop."*

```js
Update("#slide-1 text", { content: "YOU RUN ${schoolName}. WE MAKE SURE IT GROWS." })
```

then one call:

```json
{ "documentId": "…", "frames": ["slide-1", …, "slide-19"],
  "destination": "/Users/me/Desktop/decks/${schoolName}.pptx",
  "bindings": [ { "schoolName": "Universal International School" }, … 40 … ] }
```

Returns a **job handle** (§12.1), not a result. Forty `.pptx` files, each a real PowerPoint deck of
19 editable slides. The long name reflows because layout re-runs per binding — before export, in our
engine, which is the thing the §1.1 pipeline could not do. **Nothing is an image.**

Five of the six symptoms in §1.1's table are structurally impossible here: there is one rendering
system, one layout pass, no patch rectangles, no baked-in casing, and no per-slide strategy choice.

**The sixth is a tolerance, not a guarantee, and the plan previously overclaimed it.** "Font never
matched" is fixed — the face is embedded (§25.3), so PowerPoint uses the real Inter rather than
substituting. But PowerPoint re-shapes and re-line-breaks that text with its own metrics at open
time, so a long name may break one word differently than the canvas showed. That is reported as a
`reflow-risk` consequence (§9.3), not hidden.

Accepting that tolerance is the deliberate trade (§9.1). The alternatives are inserting hard line
breaks — which destroys the reflow this story is built on — or rasterizing, which is §1.1. **How
large the tolerance actually is has not been measured**, and no number appears anywhere in this
document, because measuring it means rendering the real Trusted Partners deck through both engines
and diffing. That measurement is a Stage 8 gate (§17), not an assumption.

### US-2 — *(deleted)*

> *"Make this a 3×3 grid of logos."*

This story existed to demonstrate the `consequences` channel, using a grid on a slide as the example
of something PowerPoint cannot express. **PowerPoint expresses it fine.** Yoga resolves the grid to
nine rectangles before export and PPTX stores resolved coordinates, so the nine logos export as nine
native shapes and the story has no consequence to demonstrate (§7.4).

It is left here as a marker rather than deleted silently, because it was the plan's most-cited
example of the whole mechanism, and being wrong about it means the deck table was wrong about
`layout.grid` and `layout.wrap` in every place it appeared.

The channel is now demonstrated by US-7 (`resolution`) and US-16 (`raster`, from a mesh gradient
that OOXML genuinely has no element for).

### US-3 — The currency bug

> *"Add a price of $18.40."*

Today: `Variable $18.40 was not found` and a fallback value renders. After §7.5: `$18.40` is text,
because references are `${…}`. Nothing to think about.

### US-4 — Dark mode without a second file

> *"Show me this landing page in dark mode."*

`appearance: dark` is a mode on an axis. Every `fill` cascade re-resolves. The agent flips one
selection; nothing is duplicated. On web export the dark modes emit under
`@media (prefers-color-scheme: dark)` because the mode carries that metadata (§7.3).

### US-5 — Speaker notes

> *"Add speaker notes to slide 4."*

A `text` node placed below the slide frame (§13.1). **Visible on the canvas**, editable in place,
selectable, restyleable. On `.pptx` export it becomes the `notesSlide`. It is not a hidden property
and it is not a `note` node — a correction to an earlier wrong decision.

### US-6 — The repeated card nobody made a component

> *"Why is this design so hard to change?"*

`SchoolBase Admin` — 1000+ frames, **zero refs** (§4.8). The same card was almost certainly built
many times, and nothing in the model made that visible.

With §7.6 there is no component status to declare and no convert-to-component step to forget: you
move the frame out of any role-bearing frame, add `properties`, and reference it. A repetition
detector reports *"this subtree appears 9 times; referencing it would make one edit propagate"* and
offers the move.

This is weaker than the earlier draft's claim, which was that component-ness would be *inferred* from
the existence of a reference. That was withdrawn (§7.6) — it made a visible artboard silently become
a definition and left cycles and lifecycle undefined. What survives is that instantiation is
frictionless, which was the actual point.

### US-7 — An image that will print badly

> *"Put the product shot full-bleed on the back cover."*

Allowed, and the only check unique to print. The asset is 800px wide and the node is 8 inches wide,
so it prints at 100dpi where print wants 300:

```json
{ "node": "product-shot", "kind": "resolution",
  "why": "Asset is 800px across an 8in placement — 100dpi, where print requires 300dpi",
  "instead": "Supply an asset at least 2,400px wide, or reduce the placed size" }
```

`kind`, not `verdict` (§9.3). `resolution` was never a verdict; it is a property of this asset at
this size, computed from the asset's real pixel dimensions and §10.3's unit conversion.

Invisible on screen, visibly soft on paper. Caught by arithmetic, before the print run is paid for.

No `forbid` anywhere (§9.1).

### US-8 — Exporting one slide

> *"Just export slide 9 as a PNG for Slack."*

```
canvas documents export-image --input '{
  "documentId": "…", "frames": ["slide-9"],
  "format": "png", "scale": 2,
  "destination": "/Users/me/Desktop/slide-9.png" }'
```

A **separate operation**, not `documents.export` with an `image` role — there is no `image` module
(§8.1). This is the one place a `format` parameter exists, because here the format *is* the request,
and PNG and SVG are two different writers rather than two spellings of one (§8.1). No heuristics, no
"which frames did you mean." The array is the answer.

### US-9 — Reviewing nineteen slides

> *"Show me all the slides."*

`TakeScreenshot` with 19 targets returns **19 images**, not one composited strip (§11). The current
behaviour makes deck review impossible.

### US-10 — Scratch space beside the real work

> *"Drop these five reference screenshots next to slide 3 while we work."*

They sit on the canvas, in no role-bearing frame. No consequences, no constraints, not exported
(§8.3 / P6). They are simply not export units.

### US-11 — The document that cannot be opened

> *"What's in the Atferd portal design?"*

Today: 30s timeout on an empty script (§4.7). After §12.3: the pre-inspection is lazy and the diff
is structural, so `Print(1)` costs nothing.

### US-12 — Surveying a whole document

> *"How many text nodes use the display font?"*

Visitor-form `Get`, no cap (§4.6/D3). Traversal is unbounded; the returned payload is bounded by
bytes and spills to a file above the threshold (§12.2).

### US-13 — Moving a screen into a deck

> *"Put that iOS screen on slide 6 to show the client."*

The geometry pastes. The `ios` role is stripped — there is no `screen` role; `ios` and `android` are
separate roles (§8.2) — and the write reports it (§8.3). There is no cross-type translation layer;
that was dropped entirely (§10.7).

### US-14 — Building the same design for three platforms

> *"Now do the Android version."*

The agent rebuilds it in an `android` document with Material 3 bundled. It does not run a converter.
This is deliberate: a half-fidelity converter nobody trusts is worse than a rebuild that is right.

### US-15 — A component the library does not expose enough of

> *"Make the timestamp in this notification card grey instead of black."*

The card exposes `title`, `body` and `unread`, not the timestamp's colour. Two legitimate moves:
add a `timestampTone` property to the card, or clone the card and own the copy. There is no
per-instance override (§7.6 change 5). The cost is real and accepted.

### US-16 — Something PowerPoint genuinely cannot express

> *"Give the cover a mesh gradient background."*

Allowed. It renders correctly on the canvas, and the write returns:

```json
{ "consequences": [ { "node": "cover-bg", "kind": "raster",
    "why": "OOXML has no mesh gradient element",
    "instead": "Use a multi-stop linear gradient to stay editable" } ] }
```

At export, the **smallest isolated compositing subtree** containing it becomes a picture (§9.4). The
cover's title and body stay live text. This is the story US-2 was supposed to be, using an example
that is actually true: `a:gradFill` has linear and radial and nothing else
(`pptx-capabilities.md:150-162`).

### US-17 — A headline that must land exactly

> *"This wordmark has to be pixel-perfect. I'm never editing it in PowerPoint."*

```js
{ id: "wordmark", type: "text", content: "SUMMIT 2026",
  stroke: { width: 3 }, export: "image" }
```

Two things follow, and both matter. The `raster` consequence that the stroke would otherwise produce
is **suppressed**, because the author asked for the raster — a warning about a deliberate choice is
noise. And `reflow-risk` is suppressed too, because there is no text left to reflow.

This is the author-intent half of rasterization (§9.5). The system decides in US-16; the author
decides here. An earlier draft had a name for only the first, which forced every fidelity question to
be argued as a capability question.

### US-18 — Two iPhone sizes, one screen

> *"How does this look on a Pro Max?"*

The login screen was created from the `iPhone` preset, so it carries `role: "ios"`, `size: "iphone"`
(§8.2). Switching to `size: "iphone-max"` re-runs layout at 440×956. **The children are not
duplicated** — same nodes, more room (§8.2's rule: same space → size mode).

A button that fits at 393 and overflows its fixed-height container at 440 reports `overflow` at that
size only. Compare US-14: `ios` → `android` is *different intent*, so it is a different frame, and
nothing is copied automatically between them.

### US-19 — The team's standard title slide

> *"Make this the title slide we use everywhere."*

The frame moves **out of** slide 3 onto the freeform canvas and gets `properties: { heading, kicker }`.
Slides reference it:

```js
{ id: "n1", type: "ref", ref: "master-title",
  props: { heading: "Q3 revenue", kicker: "Finance" } }
```

The move is not optional and the editor performs it as part of the action: **a ref target may not
live inside a role-bearing frame** (§7.6). Leaving it in slide 3 would make slide 3 export twice and
make deleting it break four other slides.

At `.pptx` export every reference is expanded into duplicated native shapes, and the export report
records `lowered` — the slides are no longer parameterised in PowerPoint, which the user should know
(§7.6, §10.5). It does not become `p:sldLayout`; a Canvas component can repeat and nest in ways a
slide's single layout relationship cannot express.

This is also the answer to "why isn't a preset just a component." A preset is immutable module data
and stamps a copy; this is a document node and stays live (§7.6 change 3).

### US-20 — One character in the wrong alphabet

> *"Add the Chinese name under the English one."*

The deck is set in Inter, which has no CJK coverage. Nothing renders a tofu box, and nothing silently
substitutes:

```json
{ "consequences": [ { "node": "s4-name-cn", "kind": "missing-glyph",
    "why": "Inter has no glyph for U+4E2D, U+6587 (2 of 2 characters in this run)",
    "instead": "Set this run in a face with CJK coverage" } ] }
```

CanvasKit exposes `unresolvedCodepoints()`, so this is measurable rather than guessed. Silent tofu is
the same failure class as §1.1 — a defect visible only after delivery — and the reported gap is how
the bundled face set grows (#31).

---

## 15. Defect register

Everything found by using the system, in one table. Canvas defects `D*`, host defects `H*`.

| ID | Severity | Defect | Evidence | Fix |
| --- | --- | --- | --- | --- |
| D1 | high | `$18.40` parsed as a variable named `18.40` | 3 nodes in `penkra`; `Variable $18.40 was not found` | §7.5 `${…}` grammar |
| D2 | **blocker** | No string interpolation — whole-string match only | `render-document.mjs:581` | §7.5 |
| D3 | high | `Get` 1000 cap applied to the visitor form, where nothing is returned | `script-runtime.mjs:167-169` | §12.2 bound bytes, not traversal |
| D4 | **blocker** | Unconditional O(document) inspect + double `JSON.stringify` per execution | `operations.mjs:104-130`; Atferd times out on `Print(1)` | §12.3 |
| D5 | ~~low~~ **closed** | ~~Unsupported icon preserved silently at author time~~ | `openpencil-render-document.test.mjs:219-238` compiles `phosphor push-pin-fill` cleanly; genuinely unsupported icons already emit an `icon` issue at `:549-555`, returned to writes by `document-review.mjs:3-7` | none — the mechanism §9.3 asks for already exists for icons. Reopen only with a reproducible case |
| D6 | low | `isVariableReference` and `isKnownVariableReference` disagree | `render-document.mjs:581` | subsumed by §7.5 |
| D7 | medium | `TakeScreenshot` composites N targets into 1 PNG | help text; US-9 | return N images |
| D8 | medium | Scripts cannot author root variables or axes | documented restriction | §7.5 change 2 |
| D9 | medium | No export operation at all | `penkra-app.json` — 9 ops | §10 |
| D10 | high | An unknown `Get` selector silently falls through to ID matching, so a typo returns nothing instead of an error | §22 | Validate selectors against a closed set; unknown selector is an error naming it |
| D11 | medium | The `Get` result cap is checked only *after* a full document walk, so the cap bounds the response and not the work | §22 | Bound the traversal, not the output — the same correction as D3, of which this is the sibling case |
| H1 | high | `threads create` resolves Connection by list order; user default is client-only | `ProviderTurnSelectionResolver.ts:184`; 3 threads lost to a quota error | §12.5 |
| H2 | high | `threads diagnose` unbounded — 126,325 chars overflowed caller context | observed | §12.2 spill |
| H3 | medium | Child threads orphaned when parent turn errors | 2 subagents `working` under an `error` parent | cascade interrupt |
| H4 | low | `isSelf` undocumented and fully derivable | `threadSummary.ts:96` | delete the field |
| H5 | medium | `folders list` space-blind — 4 folders titled "Main", no space id | observed | add space id + archived |
| H6 | low | Manual over-states the provider-subagent rule | `penkra --help` | §12.4 wording |
| H7 | — | `parentThreadId` governs 6 behaviours incl. provider-session ownership | §12.5 | design decision, not a bug |
| H8 | — | *Not* a defect: agents can archive; they cannot delete, correctly | verified 3× | none |
| H9 | medium | Gateway-created threads not appearing in the sidebar despite passing every filter | observed; filters ruled out | needs live repro |
| H10 | high | **A thread message longer than 20,000 characters cannot be read in full, by anyone.** `threads read` clamps `messageChars` to `READ_THREAD_MAX_MESSAGE_CHARS = 20_000` (`threadSummary.ts:103-104`), silently — the schema description documents the 1,500 default and never mentions the ceiling. `cursor` paginates *between* messages, not *within* one, so there is no way to fetch the remainder | Hit live: the Decks review message was ~45,500 chars and returned truncated at 20,000 with no way to retrieve the rest. Recovered only because the agent had also written the review to a file | Two parts: (1) document the clamp in the schema and return `truncated: true` with the true length instead of clamping silently; (2) add a **within-message cursor** — `messageOffset` — so a long message is readable in pages. Until then, a sub-agent returning a long analysis must write it to a file, which is a workaround for a host defect and should not be architecture |
| H11 | high | Retained caller-owned App tabs cannot be observed semantically while their pane is hidden, despite the tabs manual saying semantic observation and element actions can address a retained tab when another tab is visible; no focus/activate operation exists | A caller-owned `ready` Canvas tab and a caller-owned `ready` Explorer control tab each returned only the bare document accessibility node while hidden; visibility, not ownership or App code, is the common condition | Align the manual with the actual visibility contract or expose a safe focus/activate operation; until then UI QA requires the user to keep the caller Thread's App pane frontmost |

**D10 and D11 were found in §22 while measuring the `descendants` census and never reached this
register in revision 3.** D11 is the same defect as D3 seen from the other side: D3 applies a cap
where nothing is returned, D11 applies it after the cost has already been paid. Both are fixed by the
same rule — *bound the traversal, not the output* — and both land in Stage 1.

**Ordering rationale.** D2 and D4 are blockers because they make the flagship use case
inexpressible and the largest document unopenable, respectively. Everything else is queued behind
them.

**H10 is the one that generalises.** Every other host defect here cost time; H10 causes *silent data
loss in an agent-to-agent channel*, which is the channel this entire architecture depends on for
delegated research. It belongs in platform guidance alongside §12.1 and §12.2: a host that truncates
must say so and must offer a way through.

---

## 16. Migration

Named, versioned, run server-side and atomically per document. **Not agent operations** — `migrate`
was briefly modelled as one and that was wrong.

An earlier draft called these "clean cuts run once at deploy, with no `version` field to branch on."
That is unsafe for a CRDT document that can be open in a stale tab while the deploy rolls (§6). Each
migration below **raises `canvasSchemaVersion`**, and the write handshake of §6 quiesces the document
before the pass so a stale session cannot write into a half-migrated document.

#### Determinism, honestly

Revision 3 declared every migration deterministic and then described three that are not: M4 needs
per-case judgement between adding a property and cloning, M10
quarantines non-deterministic scripts, and M11 must decide whether an unassociated note annotates a
slide. Declaring a property the data violates is the defect this revision exists to remove.

**The resolution is a two-phase migration, and the ambiguity moves entirely into phase one.**

**Phase 1 — the manifest.** For every document containing an ambiguous case, a manifest is produced
that records the decision for each case explicitly: this override becomes property `tone`; that one
becomes a clone; this note attaches to `slide-3`; that script's recorded inputs are these. The
manifest is a reviewable artifact, diffable, and stored with the migration.

**Phase 2 — the pass.** The client reads the original once and creates a migrated copy from the
reviewed manifest. **Phase 2 is fully deterministic**, because every judgement was made in phase 1.
The copy must round-trip its canonical projection and assets before the original is renamed as
superseded. The original content remains untouched and recoverable. A document whose manifest is
missing or incomplete is not migrated; it is listed, and the pass continues.

**Phase 1 is the QA agent's job, and it has the tools for it.** The agent has a code REPL and computer
use: it can execute against every real document, enumerate every ambiguous case, run the migration
both ways, render before and after, image-diff the results, and research anything it does not know.
It produces the manifest *and the evidence for each entry* — a render diff, a census count, a
reproduction. A case the agent cannot settle from evidence is escalated with the diff attached rather
than guessed. This is what makes "reviewed" a real gate instead of a rubber stamp, and it is why the
whole migration can stay atomic.

**So the property that actually holds is:** migrations are *deterministic given their manifest* and
copy-atomic: the successor is not published until its projection and assets verify. Everything below
states which phase-1 work it needs.

| # | Migration | Scope | Risk |
| --- | --- | --- | --- |
| M1 | `$name` → `${name}` on variable-able properties | **1,747 current matches** in Canvas document `092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9` at sequence 1434 (1,688 direct fields, 59 inside `descendants`) | low — regex `^\$([A-Za-z][\w-]*)$`; currency strings match nothing and are correctly skipped |
| M2 | Assign `module` to every existing document | 15 documents | low — inferred: 16:9 frames → `deck`, phone-shaped frames → **`mobile`**, else `web`; confirmed with the user, not guessed. The field is `module`, not `type` (§6), and `ios` is a *role* assigned by M7, never a module |
| M3 | `reusable: true` → dropped | `penkra` only | none — there is no component status at all (§7.6) |
| M4 | `descendants` → materialised into properties or a clone | Five measured Canvas documents, including Atferd `64b13c04-b4c7-4bf5-9c37-2069044b1d55` with 2,146 affected refs / 6,046 descendant entries; exact IDs and counts are in `research/migration-corpus-2026-09-04.md` | **medium.** Each override becomes either a new component property or a visually equivalent materialised clone. Per-case judgement; enumerate first (Q10) |
| M5 | Delete `slot` | every occurrence | none — mechanical and non-lossy; the sole consumer drew excluded Pencil editor chrome |
| M6 | Uniform text style → one paragraph range + named style | all documents | low, mechanical. Ranges must satisfy §7.2's partition rule, which is what makes this checkable |
| M7 | Assign `role` to top-level frames in a typed document | all documents | low — `slide` / `page` / `route` / `ios` / `android`. There is no `screen` role |
| M8 | Add empty `flows: []` at root | all documents | none |
| M9 | Client `stickyConnectionByProvider` → server-side default | host | low, once §19-Q6 is decided |
| M10 | `script` nodes → their resolved output nodes | **0 in the 15-document Canvas corpus** | The earlier 25-node count came from unrelated `.pen` design files. The migration remains defined for imported legacy data, but the live corpus needs an empty manifest. |
| M11 | `note` nodes → `text` nodes with `notesFor` where they annotate a slide, plain `text` otherwise | **0 in the 15-document Canvas corpus** | The migration remains defined for imported legacy data; the live corpus needs an empty manifest. |
| M12 | `context` nodes → `text` on the freeform canvas | census first | low |
| M13 | `prompt` nodes → `text` on the freeform canvas | census first | low |
| M14 | root `themes` → `axes` | all documents with themes | low — a rename plus the mode list |
| M15 | node `theme: "dark"` → `modes: { theme: "dark" }` | all documents with themes | low |
| M16 | variables `{type, value}` → `{ tokenType: type, cascade: [{ value }, { value, when }] }` | all documents | **medium** — the shipped shape is `{type, value}` with a sibling conditional list (`openpencil-render-document.mjs:83-97`). `tokenType` (`color`, `dimension`, `number`, `string`, `fontFamily`, `duration`) preserves the old `type`; `cascade` is the only conditional value container and is what the DTCG boundary (§7.5) reads |
| M17 | cascade key `theme` → `when: { appearance: … }` | all documents with themes | low |
| M18 | `left`/`right` → `start`/`end` on layout, padding and alignment properties | **measure before writing** | low, mechanical, but **scope it honestly.** Three distinct property families use these words: logical alignment (`align: "left"`), padding/margin edges, and absolute position (`x`). Decision #32 covers the first two. **`x` stays `x`** — an absolute canvas coordinate is not a writing-direction concept, and mirroring it would break every existing document's geometry |

**M4, M10 and M11 need a phase-1 manifest.** Everything else is mechanical and runs unattended.
M11 is on that list because "does this floating note annotate a slide" is an inference, and §8.2
forbids the exporter from making it geometrically — so it must be decided once, recorded, and then
applied deterministically.

**A correction carried in the table.** An earlier draft said M18 migrates "1,682 references." It does
not: 1,682 is M1's variable-reference count, which was copied into an unrelated row. Nobody has
counted the `left`/`right` occurrences, and `openpencil-render-document.mjs:33` shows the current
source uses both. The count is a Stage 3 measurement, not a number this document may assert.

---

## 17. Sequenced build plan

**Full scope is authorized.** Every module, every exporter, the component migration and the rich-text
core all ship. This section orders them so that each stage's gate is satisfiable using only stages
before it — which revision 3's ordering was not. Its Stage 3 named the Stage 5 IR, Stage 5 required
the Stage 7 axis evaluator, Stage 8 gated on the Stage 10 HTML exporter, Stage 6 was blocked by two
open questions no earlier stage resolved, and Stage 2's totality gate was impossible against its own
data. This is the dependency-sound replacement.

**Every stage's gate is a QA gate, and QA is the agent's.** The implementing agent has a code REPL
and computer use, and is expected to *run* the gate rather than reason about it: generate the
artifact, open it, diff it, measure it, and research the format when the answer is not in hand. No
stage closes on an argument that it should work.

### Stage 1 — Canvas unblock

D4 (unconditional O(document) inspect and double `JSON.stringify` per execution), D3 and D11 (the
`Get` cap bounding output instead of traversal), D10 (silent selector fallthrough).

**Gate:** `Print(1)` returns on Atferd, the largest document; a visitor-form `Get` traverses it
without a cap; an unknown selector errors naming itself.

*Revision 3 bundled six host-platform defects into this stage under one gate that tested exactly one
of them. The host work — H1 spills, H10's within-message cursor, Connection defaults, `isSelf`,
folder metadata, the sidebar repro — is real, is recorded in §15, and runs as its own workstream in a
different repository. It is not on the Canvas critical path and does not gate it.*

### Stage 2 — Research gates

Four unknowns that later stages assume answers to. Each closes with a measurement or a spike, not a
position.

- **Q17 — can the controller obtain font bytes?** Fonts live in browser IndexedDB; the Node
  controller cannot read them. Measure what the controller can actually reach.
- **Q18 — may the controller write to an arbitrary absolute path?** The manifest declares
  `account-data` and `network-fetch` and no filesystem permission, while the code already opens
  absolute paths (§25.2). Measure, do not infer from the manifest.
- **The version/write handshake spike** — session version declaration, server-side rejection of a
  stale writer, and quiesce-during-migration, proven against a live Yjs document with two clients.
- **The OOXML package-injection seam** — one fixture combining a PptxGenJS slide with a directly
  authored gradient, effect and grouped shape, reopened and round-tripped. This chooses *how* raw
  OOXML gets in: mutate PptxGenJS's ZIP, fork its serializers, or construct parts independently.
  Relationship IDs, content types and regeneration boundaries all fall out of that choice.
- **The mobile toolchain fixtures** — a pinned Xcode/SDK project and a pinned Gradle/AGP/Kotlin/
  Compose project, into which emitted source is copied and compiled. Canvas emits loose source and
  never owns a build (§23.1); the *test suite* owns these projects. This also supplies the version
  matrix §24.4 needs.

**Gate:** each question has a recorded answer with the command or artifact that produced it.

### Stage 3 — Fork and interpolation

Import OpenPencil source, reconstruct the 46 patches, pin dependencies, stand up CI, behaviour tests
and the build switch. Ship `${…}` interpolation (D1, D2, D6) and M1.

**Gate:** the forked build renders the whole corpus byte-identically to the vendored bundle; the
three `$18.40` nodes render as text; a multi-reference string resolves.

### Stage 4 — The schema and the base resolver

The keystone stage, and the one revision 3 had no equivalent of.

- **One canonical machine-readable schema** (§9.2) — root, every node variant, nested
  fill/stroke/effect/mark/paragraph objects, cascades, role and module constraints, accessibility
  fields, the property type algebra (§7.6), the import record, the flow schema.
- **Validators and the capability-path inventory are generated from it**, never hand-written.
- **The base resolver:** modules and roles, the variables/axes evaluator, the condition AST, ref
  expansion, the consequence channel.
- **The version protocol** from Stage 2's spike, in production.
- **Migrations M2–M3, M5–M8, M14–M18**, plus phase-1 manifests for M4, M10 and M11.

**No migration runs until the new resolver renders the migrated form correctly.** Revision 3 ran the
axis migrations here and built the evaluator five stages later, which would have moved every document
into a representation the shipped renderer cannot resolve.

**Gate:** the corpus round-trips through validation; every migrated document renders identically to
its pre-migration render; the deck capability table passes totality against the generated inventory.
*Only the deck table* — print, web and mobile tables cannot be complete before their exporter stages
have measured anything, and requiring all four here is the gate revision 3 made impossible.

### Stage 5 — Rich text core

Marks, the range invariants, the partition rule, empty-text behaviour, the normalisation pass, editor
geometry, and `flattenMarks(content, marks)` — a target-independent primitive consumed immediately by
SkParagraph construction and later by the IR. It is not "in the IR"; the IR does not exist yet.

Accessibility fields land here with the text they describe: `description`, decorative state, document
and run language, heading level, landmark role, link purpose. Document tree order is the reading
order; there is no separate `readingOrder` field.

**Character-level collaborative storage ships in this stage.** Strings are stored atomically today,
so marks-based rich text on top of that means two people editing one text block clobber each other.
Shipping that and calling it temporary would contradict presenting real-time collaboration as a
foundation, and every later stage would build on the wrong storage. The clean long-term shape — a
per-character CRDT representation for `content`, with marks as ranges over it — is built once, here.

**Gate:** two clients type into the same paragraph concurrently and both edits survive with correct
mark boundaries; different-type overlapping marks round-trip; same-type writes clip; typing at each
mark boundary behaves per §25.6; an
empty text node accepts its first character; the accessibility fields validate and survive a
round-trip.

### Stage 6 — Components and migration

The typed interface, the AST conditions, namespaces, cross-document imports, and M4/M10/M11 driven
by their Stage 4 manifests. M5 is an unconditional field deletion.

**Gate:** all 15 Canvas documents are registered by exact ID, including `penkra`
(`092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9`, 464 affected refs) and Atferd
(`64b13c04-b4c7-4bf5-9c37-2069044b1d55`, 2,146). Every measured document with legacy
`descendants` migrates into a verified copy with no remaining `descendants`; the original content is
untouched and retained under an explicit superseded title. The full census and five non-empty M4
counts are in `research/migration-corpus-2026-09-04.md`. No production migration is part of this gate.

*A product fact this ordering exposes: because the flagship deck contains no refs, deck export does
not depend on this stage. Components come first because the model should be settled before four
exporters are written against it — a deliberate choice, not a dependency.*

### Stage 7 — The exporter IR

Both projections (§10.3): `resolved` for static targets, `semantic` for source targets. The scene
graph with parent, z-order, clips and isolation. Derived raster ppi and pixel dimensions. Units and
the sRGB output intent. Capability verdicts applied, raster scoping evaluated, consequences finished.

**Gate:** the IR for a corpus slide reconstructs the exact render tree; a `semantic` projection
retains grid tracks and unresolved axis variants; raster scoping picks the leaf for a mesh-filled
rectangle and widens correctly for a backdrop blur.

**Settled input:** effect outsets and role density policies are the cited constants in §10.3 and
`research/export-constants-and-flow-prior-art.md`. The IR records every variant's scale, PPI, final
pixel dimensions, sRGB colour space and alpha convention. Allocation failure or any silent
downscale fails export.

### Stage 8 — Deck export

PPTX, using Stage 2's chosen injection seam. Font embedding per §25.3. Flow lowering is a forward
feature: the IR emits `flows: []`, every flow capability row remains null/unverified with the note
"deferred by decision," and this stage emits neither `p:transition` nor flow hyperlinks. Every other
`unverified` entry in §24.1 is resolved only by generating a file and measuring it: effects against
their OOXML attributes, blend over nontrivial backdrops, lists with markers and hanging indents.

**Gate:** the flagship deck exports, opens in PowerPoint, and is editable; Q20's Skia-vs-PowerPoint
divergence is *measured* on the real decks and recorded as the reflow tolerance (no number is written
into this document before that measurement); the embedded-font package reopens on a machine without
the font installed.

### Stage 9 — Layout exposure

`wrap`, min/max constraints, and grid — exposure work, since the vendored fork already computes it
(§7.4, §21.1).

**Gate:** a grid resolves to correct geometry on canvas and exports as native PPTX shapes. HTML is
*not* in this gate; semantic grid output is Stage 11's, and requiring it here required an exporter
three stages away.

### Stage 10 — Print export

PDF, the four profile tables as base-plus-delta with the deltas actually written (§24.2), the bundled
sRGB output intent, bleed and fold handling.

**Gate:** a file is generated and validated with veraPDF against each profile; §24.2's profile
`unverified` rows are resolved only by that run; an A4 trim measures 210 × 297 mm. For uniform bleed
`b` in points, `MediaBox = CropBox = BleedBox = [0,0,w+2b,h+2b]`,
`TrimBox = [b,b,b+w,b+h]`, and `ArtBox` is absent. Fold marks appear only in the top and bottom
bleed bands. PDF/X specifies no standard bleed amount; presets declare it, with 9 pt / about 3 mm as
the documented typical trade allowance, not a conformance constant.

### Stage 11 — Web export

HTML and CSS from the `semantic` projection.

**Gate:** compilation is not the gate. The emitted source is asserted to *use* the expected
constructs — `display: grid` with the document's tracks, media queries from viewport modes,
`prefers-color-scheme` from appearance modes, `:hover` from interaction modes — and the DOM and
accessibility tree are asserted at three viewport widths. A screenshot diff can pass on
absolutely-positioned output that is entirely non-adaptive, which is exactly the failure this gate
exists to catch.

### Stage 12 — SwiftUI export

**Gate:** emitted source compiles in the pinned Xcode fixture from Stage 2, and UI/accessibility
snapshots pass at two device sizes and two dynamic-type sizes.

### Stage 13 — Compose export

**Gate:** emitted source assembles in the pinned Gradle/Kotlin/Compose fixture from Stage 2, with the
same snapshot and accessibility assertions.

### Stage 14 — PNG and SVG export

`documents.export-image`, the SVG writer, and the SVG property table (§8.1). Last because nothing
depends on it. The initial operation landed in `cfd5e98`, eleven stages before this scheduled gate;
Stage 14 has now been reached locally. Requested-scale PNG and SVG artifacts were generated, and the
SVG table is total across the generated 142-path inventory, with unsupported constructs explicitly
`raster` or `ignore` rather than inferred native.

**Gate:** a subtree exports to PNG at a requested scale and to SVG; the SVG table declares a verdict
for every path in the generated inventory; US-8 passes.

### The critical path

Stages 1 → 8 retire §1.1: the flagship deck exports as an editable `.pptx` with measured tolerance,
with schools templated from bindings and layout re-run per binding set.

Stage 6 sits inside that path by choice rather than necessity (see its note). Stages 9–14 are
additive and could be reordered by product priority without breaking any gate before them.


## 18. Decision log

Every settled decision, and every reversal, so nothing is relitigated by accident.

### Settled

| # | Decision |
| --- | --- |
| 1 | **One module per document, one target per export role.** Derived formats are library conversions, not second exporters. (Was "one document = one native target", which is false for `mobile` — §8.1) |
| 2 | Format is never an export parameter — the **role** implies it. The sole exception is `documents.export-image`, where PNG-vs-SVG *is* the request (§8.1) |
| 3 | Strategy C: superset model + per-target capability tables (§3) |
| 4 | Web emits real HTML/CSS; agents wrap into frameworks with repo context |
| 5 | Three verdicts: `native` / `raster` / `ignore`. `ignore` carries a consequence when something meaningful was lost (§9.1) |
| 6 | Raster scope = smallest self-contained subtree (§9.4) |
| 7 | One app, modular type boundary — makes the Decks split reversible |
| 8 | Documents app (Word/MD/rich text) separate; TeX separate again |
| 9 | Four modules: `deck`, `print`, `web`, `mobile`. Five roles: `slide`, `page`, `route`, `ios`, `android`. One role → one output kind (§8.1) |
| 10 | `role` marks export units only; everything else on canvas is freeform |
| 11 | Constraints advisory everywhere, reported on role-bearing frames |
| 12 | Rich text = marks over one `content` string |
| 13 | Axes unify themes, states, variants, breakpoints; `when` accepts props |
| 14 | Axis modes carry target metadata (`minWidth` → media query) |
| 15 | Paragraph styles are named, not inline |
| 16 | `${name}` delimited interpolation; migrate 1682 refs |
| 17 | Typed component properties are the only interface |
| 18 | DTCG at the boundary, not in the core |
| 19 | `flows` reserved at root now, even when empty |
| 20 | Long operations get a job surface, not a longer timeout |
| 21 | Spills bound returned bytes; traversal stays unbounded |
| 22 | Fork the OpenPencil engine — *"we're owning this end to end"* |
| 23 | No role families. Each role declares its own rules — easier to extend, and the grouping did not hold (§8.2) |
| 24 | Sizes are named, adaptive modes — not copies. Same space → size mode; different intent → separate frame (§8.2) |
| 25 | Agents get `provider`/`model`/`effort` on thread creation — never `connectionId` (§12.5) |
| 26 | `image` is not a module. PNG/SVG output is a function every `raster` verdict calls (§8.1) |
| 27 | `spread` is not a role. Facing pages are a `page` at double width with a fold guide |
| 28 | `folds` is a canvas guide plus optional printed fold marks. **Export never cuts at a fold** — the shop does imposition |
| 29 | Exports are written to a filesystem path by the host controller; the operation returns the path. Not a spill |
| 30 | Fonts embed by default in both PDF and PPTX. Restricted faces (SF Pro, Helvetica Neue) are fetched, cached and embedded like any other — **conditional on local developer use, with redistribution responsibility on the user** |
| 31 | Missing glyph coverage is a reported consequence, never silent tofu; the reported gap is how the bundled face set grows |
| 32 | Layout uses `start`/`end`, not `left`/`right`. A naming choice that is free now and expensive after M-16 migrates 1,682 references |
| 33 | `script` is not a node type in the new model. Pen scripts resolve to their output nodes at import — via M10, which is lossy and quarantines non-deterministic scripts |
| 34 | **`native` means expressible in the target, not pixel-identical.** The residual difference is a `reflow-risk` consequence, a measured tolerance rather than a verdict. Closes review finding 38 and settles 41 (§9.1) |
| 35 | **We keep editable text and accept measured rendering tolerance.** We do not insert hard line breaks to fake fidelity, and we do not rasterize text that merely re-measures. Outlining is dropped — same trade as raster, more machinery, and CanvasKit 0.40.0 has no glyph-to-path API anyway (§9.5) |
| 36 | **Consequences use `kind`, not `verdict`, with one closed vocabulary:** `raster`, `ignore`, `reflow-risk`, `overflow`, `resolution`, `missing-glyph`, `contrast`. A verdict is a property of the table; a consequence is a property of this node now. `native` never emits one. `why` always present; `instead` only when a real alternative exists (§9.3) |
| 37 | **`export: "live" \| "image"` on any node — author intent, not a remedy.** Content vs design. `"image"` rasterizes deliberately and suppresses both `raster` and `reflow-risk` (§9.5) |
| 38 | **There is no component status.** Any node may declare `properties`; any node may be a ref target. Component-ness is neither declared nor observed. Closes review finding 46 (§7.6) |
| 39 | **A `ref` target may not live inside a role-bearing frame.** Enforced both directions. Refs are acyclic. PPTX export always inlines them as duplicated native shapes (§7.6) |
| 40 | **Presets are module data and stamp a copy** carrying literal `role` and `size`. Not user-editable, so a live ref to them would buy nothing. A team's own reusable slide is a component, not a preset (§7.6, §8.2) |
| 41 | **One semantic export IR** carrying resolved geometry plus source semantics and provenance. No exporter walks the document. Closes review finding 40 (§10.3) |
| 42 | **The `version` field is kept**, plus a minimum-client gate. A CRDT that can be edited by a stale tab cannot be migrated by a deploy-time clean cut. Closes review finding 50 (§6) |
| 43 | **The serialized root field is `module`, not `type`.** `type` is the node field; reusing it at the root was a collision (§6) |
| 44 | **Layout compiles away — it never carries a verdict.** Yoga resolves geometry before export and resolved coordinates are what PPTX stores. Deletes US-2 and most `raster` entries in the deck table (§7.4) |
| 45 | **The capability table must be total.** Every schema property path has an entry in every module's table; unknown is a CI failure, not an export surprise (§9.2) |
| 46 | **Raster scope is the smallest isolated *compositing* subtree**, not the smallest geometrically non-overlapping one (§9.4) |
| 47 | **Speaker notes carry `notesFor`.** Geometric adjacency was a heuristic in the one document that promises none (§8.2) |
| 48 | **Flow triggers carry a source node** for every kind but `advance`. A frame-to-frame edge cannot say which button was clicked (§7.7) |
| 49 | **Conditions are a serialisable AST with a closed operator set**, not expression strings. No grammar to write, no evaluator to sandbox, type-checked at write time (§7.6) |
| 50 | **Export selects axis modes** via `modes` on the request. A static target cannot switch appearance with the reader's OS, so `appearance: native` in the deck and print tables was an unfounded assertion (§7.3) |
| 51 | **Canonical unit is px at 96dpi**, with fixed total conversions to EMU, PDF points, dp and physical inches. **Canonical colour is sRGB**, and CMYK/spot are *removed* from the print table until a colour-space model exists (§10.3) |
| 52 | **Cardinality is frames → bundle, not frames → file.** Directory output, derived filenames, error-on-collision, content-addressed assets, one self-contained file per helper (§10.2) |
| 53 | **PNG, SVG and raster-subtree are three things, not one.** SVG is vector serialisation with its own writer and its own capability table (§8.1) |
| 54 | **PDF profile is an export parameter that tightens the capability table** — not a post-process, not a fifth module (§10.1) |

### Reversed

| Was | Now | Why |
| --- | --- | --- |
| `forbid` verdict tier | eliminated | Almost nothing is truly impossible; allow with a consequence |
| Root `sequence` array | export takes explicit ordered frames | Duplicated information that would go stale |
| Speaker notes as non-visual `note` nodes | visible text outside the frame | They are content, like frame titles |
| `preset: "16:9"` at creation | only `type` | Presets are module data, not creation parameters |
| Cross-type transfer with a mapping report | dropped entirely | Agents rebuild; a half-fidelity converter is worse |
| `descendants` per-instance overrides | dropped | Competes with the component interface; each justification failed |
| `reusable: true` flag | component-ness observed | A step the primary author would forget |
| `migrate` as an agent operation | a deploy-time migration | Never was an agent's job |
| `effects` (plural) | `effect` (singular) | Wrong reading of the model |
| `print` and `web` both use `page` | `page` vs `route` | Hid a real structural difference. (This row previously read "`page`/`spread` vs `route`", contradicting decision #27 — `spread` is not a role, it is a `page` at double width with a fold guide) |
| "Components are copied" | `ref` is a genuine reference, resolved at render | Plain misreading of `node-reference.mjs` |
| "`slot` is a third mechanism" | Pencil editor chrome, deleted by M5 | False alarm; no document-content semantics |
| "No Connection default exists as data" | it exists, client-side only | Bad grep (§12.5 CORRECTION) |
| "Agents cannot archive threads" | they can; they cannot delete | Verified 3× |
| `substitute` verdict | eliminated | Every example collapsed: raster of a video *is* its poster frame; `table`→`List` was simply wrong |
| `table`, `video`, `lottie` in the capability tables | removed | **They are not node types.** Invented while writing tables |
| Two role families | none | the `image` pseudo-module needed family `none` — the tell that it was not a taxonomy |
| `ios` and `android` as separate modules | one `mobile` module, two roles | They share a document, library and tokens; they differ in output |
| `layout.wrap` raster on SwiftUI | `native` | SwiftUI's `Layout` protocol (iOS 16+); flow layout is its canonical example |
| Real-time collaboration deferred | **already built** | The document model is Yjs; `collaboration/` and `collaboration-status.mjs` exist |
| Undo needs designing | **already built** | `Y.UndoManager`, 500ms capture; agent ops emit forward + inverse and throw without a durable inverse |
| Fonts unsolved | rendering solved | `font-runtime.mjs`: Google + Fontsource via host fetch, IndexedDB face cache |
| Assets unsolved | solved | Content-addressed: `path` + `sha256` + `size`, read via `api.readAsset` |
| "Document too large" limit | dropped | An invented ceiling. The real issues were loading/traversal and were fixed as rendering work |
| Four verdicts | three, everywhere | The three-verdict decision had not propagated: P4 still said "substitution", Stage 2 said "the four verdicts", axis tables used `unavailable`, and print diagnostics used `verdict: "resolution"` and `verdict: "overflow"` — values that were never verdicts |
| `native` = "a live, editable object" | `native` = expressible in the target | Failed downward on PDF and source targets, and failed upward on PPTX text, where it would have rasterized every deck |
| `layout.grid` / `layout.wrap` are `raster` for PPTX | `native` — layout compiles away | The single highest-value correction in the review. Yoga resolves geometry before export; resolved coordinates are exactly what PPTX stores |
| Component-ness is observed from refs | **no component status; refs are aliases and `properties` is an interface** | Made a visible artboard silently become a definition; left cycles and lifecycle undefined; the React/Vue analogy was wrong — those declare explicitly |
| Presets stamp because someone might edit the iPhone preset | presets stamp because a live ref to immutable data buys nothing | Presets are module data and are not user-editable, so the original argument described an impossible event |
| No `version` field | **two fields — `canvasSchemaVersion` (ours) and `version` (OpenPencil's) — plus a server-side write handshake** | The document model is a CRDT; a stale tab can write concurrently with the deploy that "cleanly cut". Revision 3 fixed this with one field and an open-time gate, both wrong: the field is OpenPencil's, and a refusal to open does not stop an already-connected tab |
| "The current parser requires `version`" | it does not | `parsePenFile` accepts a missing version, `null`, `"bogus"` and `"3.0"`. Measured, not read |
| `type` at the document root | `module` | Collided with the node-level `type` field |
| ~~`slot` carries document semantics~~ **(claim deleted)** | **editor chrome — M5 deletes it non-lossily** | Its only renderer consumer was the excluded `drawPencilSlotOutline` overlay |
| Undo is "one Cmd-Z per agent operation" | UI undo and durable operation undo are two different systems | The UI `Y.UndoManager` tracks `LOCAL_ORIGIN`/`ENGINE_ORIGIN`, not `REMOTE_ORIGIN` — agent edits arrive as remote updates and never enter the UI undo stack at all |
| Yjs means collaborative rich text is solved | the document model is a CRDT; **rich text is not** | Strings and arrays are stored as atomic JSON, not `Y.Text`/`Y.Array` (`pen-yjs-model.mjs:417-423`), and text edits commit the whole `content` property — last-writer-wins, not character-level merge |
| Fonts are solved | *rendering* through web providers is solved | `font-runtime.mjs:13-18` wires Google and Fontsource only. SF Pro, Helvetica Neue, Segoe UI and purchased faces are a separate acquisition problem, and embedding is a third |
| PPTX export can embed the faces we hold in IndexedDB | the controller cannot reach browser IndexedDB | `documents.export` runs host-side; the font cache is created through browser `indexedDB` (`font-runtime.mjs:50-75`). The controller needs its own path to the exact face bytes |
| "The manifest proves Canvas cannot write files" | the manifest proves nothing either way | The Node controller already opens absolute paths with `node:fs/promises` (`image-materialization.mjs:111-139`). The write policy must be tested, not inferred |
| Spilling removes the execution ceiling | it bounds the outer tool response only | 16 MiB in/out, 64 MiB heap, 1,000 prints and 10,000 touched IDs all live inside QuickJS |
| "A deck never loads grid machinery" | not true of the shipped bundle | One 96,164-line engine bundle contains Yoga Grid and every document loads it. Either build real chunk boundaries or stop citing bundle size as a reason for modules |
| The fork costs "no new build infrastructure beyond `bun build`" | it is a stage of its own (Stage 3) | Our own fork research lists workspace ownership, lockfiles, CI, release tooling, notices and an upstream-diff workflow |
| CanvasKit 0.42.0 as the baseline | the app ships **0.40.0** | `package.json:14`. The APIs reasoned about do exist in 0.40.0's types, but the version claim was wrong and 0.40.0 has no glyph-to-path binding |
| D5 (unsupported icon silently preserved) | **closed** | `phosphor push-pin-fill` compiles cleanly in current tests; genuinely unsupported icons already emit an issue that reaches writes |
| `to: -1` meaning "to the end" | removed; write the length | One unspecified magic value in a numeric field |
| Speaker notes found by adjacency | `notesFor` | A heuristic, in the document that says "no heuristics, ever" |
| `visible: "$props.icon != null"` | a condition AST | An expression string needs a grammar, a type checker and a sandbox; the obvious implementation is `eval` |
| Roles are "1 frame → 1 file" | **N frames → 1 bundle**, for every role | Web output is HTML + CSS + assets; SwiftUI output needs helper files |
| `color.cmyk` / `color.spot` native in print | **removed from the table** | Asserted with no colour-space, ICC or output-intent model behind them |
| PptxGenJS is sufficient on its own | direct OOXML from day one of deck export, through a seam chosen in Stage 2 | No public API for general gradients, nested groups, blur, glow, soft edge or effect graphs — and the flagship deck has a gradient |
| Six ranges in the examples | all validated against their strings | Five were off by one to four units; one split a word and left a character in no paragraph |
| An `image` node exists, 38 of them | **there is no image node; images are `fill.image`** | `VISUAL_NODE_TYPES` has none; the 38 is a count of image *fill records* relabelled as nodes |
| `p:sldLayout` is a role-less propertied frame | **refs always inline** | A slide has one layout relationship; refs nest, repeat, target any node and carry per-instance props |
| Five DrawingML effects map natively | two exist in Canvas, both `unverified` | Canvas has `shadow`, `blur`, `background_blur`. Inner shadow, glow and soft edge were capability entries for properties with no schema |
| Five blend modes map natively | **`raster` for every value until measured** | `a:blend` is an effect-DAG primitive, not a per-shape blend property; shared value names are not a mapping |
| SwiftUI and Compose background blur are native | **`raster`** | Both blur the view's own contents, not the backdrop |
| A4 is `595×842`, a deck is `1920×1080` | **A4 is `794×1123`, a deck is `1280×720` with a declared physical size** | Under the document's own 96-dpi canon the old numbers made A4 6.2×8.8 in and a slide 20 in wide |
| `"scale": 2` on a raster | derived ppi and final pixel dimensions | A 2× bitmap means nothing in common across print, PPTX, CSS and @3x |
| "Marks ending at or before `i` are untouched" | endpoint stickiness is declared per mark | The same section then required typing at the end of bold to inherit bold |
| Migrations are all deterministic | **deterministic given a phase-1 manifest** | Four of them required judgement, in a section declaring none did |
| The four tables are total | **illustrative until the schema exists** | The rule held against none of them; three carry 8–13 property rows |

---

## 19. Open questions

| # | Question | Blocks | Status |
| --- | --- | --- | --- |
| Q1 | Exact PPTX capability boundary | Stage 8 capability table | **ANSWERED — §21.2** |
| Q2 | Yoga wrap/min-max/grid cost | Stage 9 estimate | **ANSWERED — §21.1** |
| Q3 | CanvasKit `TextStyle` per-run properties; bullets | Stage 5 estimate | **ANSWERED — §21.3** |
| Q4 | Fork strategy and engine seam prior art | Stage 3 | **ANSWERED — §21.4** |
| Q5 | Best `.pptx` writer | Stage 8 | **ANSWERED — PptxGenJS 4.0.1, §21.2** |
| Q6 | Connection default scope | H1 fix, M9 | **ANSWERED — per Space × provider (§12.5)** |
| Q7 | Should child threads become peers? | H7 | **ANSWERED — yes, drop the special-casing (§12.6)** |
| Q13 | Yoga-grid fork: dependency or owned? | Stage 3 | **ANSWERED — own both forks (§23.3)** |
| Q14 | Marks are UTF-16 offsets (§21.3). Does the agent-facing API expose UTF-16 or grapheme indices? | Stage 5 | open |
| Q15 | Paragraph rebuild cost per keystroke — CanvasKit has no incremental range mutation (§21.3) | Stage 5 editor | open |
| Q16 | **Is ICU conformant, not merely present?** Answered in part: against the shipped 0.40.0 WASM, `ParagraphBuilder.RequiresClientICU()` returns `false` and the binary carries ICU 74 data — `icudt74l`, bidi, break iterators, CJK/Thai/Lao/Khmer break engines. What remains is a **conformance corpus** through the exact packaged WASM: Arabic shaping and bidi, emoji grapheme clusters, CJK/Thai line breaks | Stage 3 build assertion | **narrowed** — no longer "is it there" |
| Q17 | ~~How does the host-side controller obtain exact font face bytes?~~ | Stage 2 | **CLOSED — bundled or document-owned font assets.** The controller cannot read browser IndexedDB; the installed export fixture embedded the reachable Inter assets. |
| Q18 | ~~What may the installed controller actually write, and where?~~ | Stage 2 | **CLOSED — approved absolute destinations are writable.** The controller-process gate wrote an arbitrary temporary destination; the manifest alone was not evidence. |
| Q19 | **Colour space model.** Do we add a colour space to fills, an ICC profile to documents and an output intent to export — or stay sRGB-only and drop CMYK/spot permanently? | post-Stage 10 | open — deliberately deferred; v1 is sRGB with one bundled output intent (§10.3) |
| Q20 | **What is the measured Skia-vs-PowerPoint reflow divergence** on the real decks? Until this number exists, no tolerance threshold may be written | Stage 8 gate | open — deliberately unanswered |
| Q21 | ~~Does the UI `Y.UndoManager` need to track `documentFields`?~~ | Stage 4 | **CLOSED — yes.** The UI undo scope is `[model.nodes, model.documentFields]`; root axes, variables and flows are covered by the same local transaction history |
| Q22 | ~~Concurrent rich-text editing~~ | Stage 5 | **CLOSED — character-level collaborative storage ships in Stage 5** (§17). The clean long-term shape, chosen over an explicit LWW regression |
| Q23 | ~~Do modules require per-module dynamic chunks to justify the split?~~ | Stage 4 | **CLOSED — no.** Module separation is semantic and bundle size was dropped as a justification. The build has a real lazy exporter boundary without claiming a chunk per module. |
| Q8 | ~~Spill threshold and TTL~~ | host workstream | **MOVED — not Canvas architecture.** Host transport policy belongs to its owning implementation and active plan, not this specification. |
| Q9 | ~~Does `role` belong on `group`, or `frame` only?~~ | Stage 4 | **CLOSED — frame only.** §8.2 defines roles as export-unit frames; validation rejects `role` on every other node type |
| Q10 | ~~Enumerate every `descendants` entry in the Canvas corpus before M4~~ | Stage 4 manifest | **CLOSED — §22.** Four documents are affected; all 545 affected refs have explicit sequence-fenced manifest entries |
| Q11 | Do `ios`/`android` emit source, or a project? | Stage 12–13 | **CLOSED — source, by decision #4 (§23.1)** |
| Q12 | `flows` conditional edges vs linear advance in v1 | Stage 8 | **WITHDRAWN — invented scope (§23.2)** |

---

## 20. Deferred

Explicitly not in scope, recorded so they are not mistaken for oversights.

- **Import.** `.pen`, `.fig`, `.sketch`. Lossy translation with a consequences report. Must not
  shape the model (§10.7) — `descendants` was dropped *despite* helping round-trips.
- **Present mode.** Reads the same ordered frame list as export (§10.3). No new concepts.
- **Real-time collaboration — partly built, not finished.** The document model is a CRDT
  (`collaboration/pen-yjs-model.mjs`), so listing it as wholly deferred was wrong. But strings and
  arrays are stored as **atomic JSON values, not `Y.Text`/`Y.Array`**, and a text edit commits the
  whole `content` property — so concurrent edits to text, marks, paragraphs, flows and axis modes are
  last-writer-wins, not merged. **Collaborative rich text is deferred and is real work** (Q22).
- **Animation** beyond `flows` transitions. Lottie would be an import target if it ever exists; it is
  not a node type and not an authoring surface. (This entry previously called it a `substitute`
  target — a verdict that no longer exists.)
- **The clean deck generator**, once Stage 8 lands.
- **Penkra Admin platform decisions.**
- **Deck follow-ups:** `[SCHOOL NAME]` vs `[BUSINESS]` placeholder divergence; `06-deck-v2.md`
  specifies 20 slides while Canvas holds 19; frame layer names are misnumbered.
- **Former planning-note amendment:** Skills are "bundled and discoverable from help," not fetched.

---

## 21. Research findings

Three deep-research passes, run as a Penkra Thread on GPT-5.6-Sol. Full documents in
`research/`: `yoga-skia-capabilities.md` (312 lines), `pptx-capabilities.md` (287),
`openpencil-fork-analysis.md` (311). **Two findings overturn cost estimates in this plan.**

### 21.1 Layout — grid is already ours

**Yoga 3.2.1 implements everything §7.4 wanted except grid:**

| Property | Status | API |
| --- | --- | --- |
| `flexWrap` | native | `YGNodeStyleSetFlexWrap` / `setFlexWrap` — no-wrap, wrap, wrap-reverse |
| `minWidth` / `maxWidth` / `minHeight` / `maxHeight` | native | point **and percent** setters |
| `aspectRatio` | native | `YGNodeStyleSetAspectRatio` |
| `gap` / `rowGap` / `columnGap` | native | keyed by `YGGutterAll/Row/Column`, incl. percent |
| percentages | native | flex-basis, offsets, margin, padding, gap, width/height, min/max |
| `boxSizing` | native | `BorderBox` / `ContentBox` |
| absolute / relative / static position | native | `YGNodeStyleSetPositionType` |

So §4.3's guess was right: **all exposure work.** Note Yoga's percentages are a bounded layout
feature, not a general CSS unit system — §7.4's rejection of `calc()` and viewport units stands.

**Grid — the reversal.** Released Yoga 3.2.1 has no grid. Upstream `main` merged
*"CSS Grid 1/9: Grid style types and public API"* ([`07524851`](https://github.com/facebook/yoga/commit/07524851f54b53af647fb3801d03a95334d6e1ee), 2026-03-05) — types and setters only. *"CSS Grid 2/9: Grid layout algorithm"* is
**still an open PR**. Neither released Yoga nor upstream `main` can compute a grid.

**But OpenPencil forked Yoga to add one**, and aliases `yoga-layout` →
`@open-pencil/yoga-layout@3.3.0-grid.3` (published 2026-04-13) in both its root and core manifests,
with a `packages/core/src/layout/grid.ts` adapter that sets `Display.Grid`, maps template tracks,
and reads computed boxes back through the same seam.

**Verified against our own bundle** — `vendor/open-pencil/engine.mjs`:

```
45  GridTrack          21  gridTemplateRows     16  gridTemplateColumns
16  gridRowGap         16  gridColumnGap        11  gridRows / gridColumns
 7  minmax             3   Display.Grid          1  DISPLAY_GRID
 2  gridRowsSizing / gridColumnsSizing / gridRowAnchor / gridColumnAnchor
 1  gridRowSpan / gridColumnSpan
```

plus `flexWrap`, `minWidth`×35, `maxWidth`×82, `aspectRatio`, `rowGap`, `columnGap`.

**Grid is already compiled into the engine we ship.** Layout was scoped as the single largest
piece of engine work in this plan — implementing track sizing, auto-placement, `fr` distribution,
spanning contributions and intrinsic cycles on top of a flex-only engine. That work is done and
vendored. What remains is model plumbing: schema, editor controls, and each module's `layout`
lowering entry. **Layout drops from "real engine work" to the same tier as wrap.**

**And it does not need a PPTX `raster` verdict.** Revision 3 ended this section, and §21.2, by saying
grid must rasterize for PowerPoint — in the same document whose §7.4 and §24.1 say layout compiles
away. Stock released Yoga has no grid; the pinned OpenPencil fork we ship does; layout resolves to
geometry before the exporter runs, and a resolved rectangle is exactly what PPTX stores.

Prior art for the pattern: Rive's C++ runtime owns Yoga nodes plus `GridTrackList` adapters; Taffy
is a separate Rust engine implementing both flex and grid natively.

### 21.2 PPTX — the flagship deck is entirely expressible

**Native**, with the exact element that carries it:

| Feature | OOXML |
| --- | --- |
| Preset shapes, connectors | `p:sp/p:spPr/a:prstGeom`, `p:cxnSp` |
| Arbitrary vector paths | `a:custGeom/a:pathLst` — `moveTo`, `lnTo`, `arcTo`, `quadBezTo`, `cubicBezTo`, `close` |
| **Character-range marks** | `a:p` paragraphs → `a:r` runs, each with its own `a:rPr`. **Runs are the native unit — §7.2 flattens straight onto it** |
| **Bullets and numbering** | `a:pPr` children `a:buChar`, `a:buAutoNum`, `a:buBlip`; nesting via `lvl` + indents |
| Tables | `a:tbl` in `p:graphicFrame` — merges, borders, per-cell fill |
| Charts | `p:graphicFrame` → `c:chart r:id`, separate part |
| Pictures | `p:pic/p:blipFill`; crop `a:srcRect`, `a:stretch/a:fillRect`, tile |
| Linear gradients | `a:gradFill/a:gsLst` + `a:lin` |
| Radial gradients | `a:gradFill/a:path` with `path="circle"` — **no separate radial element** |
| Shadow, glow, blur, soft edge | `a:effectLst` / `a:effectDag` |
| Groups, rotation, flips | `p:grpSp`, `a:xfrm` with `rot`/`flipH`/`flipV` |
| Masters, layouts, placeholders | `p:sldMaster` → `p:sldLayout` → `p:sld`, matched by `p:ph` |
| Theme colours and fonts | `a:clrScheme`, `a:fontScheme`; refs `a:schemeClr`, `+mj-lt`/`+mn-lt` |
| **Speaker notes** | notes-slide part rooted at `p:notes` — **US-5 exports natively** |
| Transitions | `p:transition` (+ `p14:`/`p15:` for later types) |
| Animations | `p:timing/p:tnLst`, `p:bldLst` |
| Video / audio | `a:videoFile`, `a:audioFile`, `a:wavAudioFile` + media parts |
| Hyperlinks | `a:hlinkClick`, incl. `action="ppaction://hlinksldjump"` |
| Alt text | `p:cNvPr` `name` / `title` / `descr` |

**Absent — the complete list:**
1. **Mesh / freeform gradients.** No element exists in `CT_GradientFillProperties`.
2. **Masks, SVG filters, arbitrary blend stacks.**
3. **Arbitrary 3×3 / skew transforms** — `a:xfrm` is offset, extent, rotation, flips only.
4. **Any layout or constraint model.** PPTX stores resolved EMU coordinates. No flex, no grid,
   no responsive anything.

Point 4 is the important one, and it points the opposite way from how revision 3 read it. PowerPoint
having no layout engine is precisely why grid does **not** need to rasterize: Yoga has already
resolved every child rectangle before the exporter runs, and resolved EMU coordinates are exactly
what PPTX stores. It **confirms §7.4's rule that layout resolves to absolute geometry at export**.
What is lost is the *authoring* abstraction, not the pixels — and that loss is recorded as `lowered`
in the export report, not as a `raster` verdict.

**Cross-referencing §4.8:** the Trusted Partners deck is 271 text, 305 frame, 218 rect, 10 icon,
**zero effects, zero blend modes, one gradient**. Every node type is native. The capability table for
`deck` will report `raster` on **nothing** in that document. §1.1's flatten-to-images outcome was
never necessary.

**Writer: PptxGenJS 4.0.1** (Node, MIT). Broadest generation surface — editable shapes, custom
geometry, run text, tables, charts, masters via `defineSlideMaster`, `addNotes`, media, links,
`altText`. python-pptx 1.0.2 has better group shapes and linear gradients but weaker master
creation, media and accessibility. **Neither exposes transitions, timing animations, the full
DrawingML effect set, or effect-graph blends** — those need direct OOXML part manipulation, which is
the fallback for `flows` (§7.7) when we get there.

**And OpenPencil core already depends on `pptxgenjs@^4.0.1`** — the export adapter is a consumer of
the resolved scene graph, not a renderer feature, and upstream has already proven the two coexist.

### 21.3 Skia — marks are nearly free, lists are not

Baseline as researched: `canvaskit-wasm@0.42.0`. **The app actually ships 0.40.0** (`package.json:14`)
— pinning one of the two is a Stage 3 task. The APIs cited below were re-checked against the
installed 0.40.0 type definitions and do exist there; only the version label was wrong. What 0.40.0
does **not** have is any glyph-to-path binding (`MakeFromCmds`, `MakeFromSVGString`,
`MakeFromVerbsPointsWeights` and friends are the only path factories; `Font` exposes
`getGlyphBounds`, `getGlyphIDs`, `getGlyphIntercepts` and no `getPath`), which is why outlining text
is dropped rather than deferred (§9.5).

**Every mark type in §13.4 maps to a `TextStyle` field:**

| §7.2 mark | CanvasKit |
| --- | --- |
| `fill` | `color` / `foregroundColor` |
| `weight`, `italic` | `fontStyle: {weight, width, slant}` |
| `letterSpacing`, `wordSpacing` | `letterSpacing`, `wordSpacing` |
| `underline`, `strikethrough` | `decoration` bitmask + `decorationColor`/`Style`/`Thickness` |
| shadow | `shadows: [{color, offset, blurRadius}]` — multiple per run |
| font features / variable axes | `fontFeatures`, `fontVariations` |
| `link` | **no Skia equivalent** — model/interaction only, rendered as a `fill` + `decoration` |

Not exposed: `baselineShift` (so superscript/subscript marks need separate work), direct
`setTypeface`, decoration mode, and native incremental range mutation.

**Three findings that change §7.2 and the Stage 5 editor:**

1. **Overlapping marks must be flattened before building, not only before export.**
   `pushStyle`/`addText`/`pop` is a stack — SkParagraph has no overlap concept. §7.2's claim that
   flattening is purely an export concern was too strong. It is a *layout-time* normalisation, run
   once per layout rather than per keystroke, so the model argument survives intact — but it is
   real work in the render path.
2. **No list or bullet model whatsoever.** No list container, item, marker style, counter,
   hanging-indent object or marker callback exists anywhere in SkParagraph. §7.2's paragraph-level
   list decision is right, but markers must be drawn by hand — via prepended marker runs, via
   `addPlaceholder` reserving space, or as separate paragraphs. Hanging markers and stable
   multi-line body alignment force the second or third. **PPTX exports bullets natively (§21.2)
   while Skia renders none — asymmetric, and the cost sits on our side.**
3. **No incremental range mutation in CanvasKit.** The paragraph is rebuilt after every text or
   style edit. Editor performance is a real design constraint (Q15).

**Editor geometry is fully available**, which is what makes Stage 5 tractable:
`getGlyphPositionAtCoordinate`, `getClosestGlyphInfoAtCoordinate`, `getGlyphInfoAt`,
`getRectsForRange` (with `Tight`/`Max`/strut height styles and bidi direction tags),
`getWordBoundary`, `getLineMetrics`, `getLineNumberAt`, `getShapedLines`, `unresolvedCodepoints`.

**Indices are UTF-16**, matching JavaScript string indexing — so mark offsets should be UTF-16
offsets. But grapheme clusters must stay indivisible as caret units, so the editor needs its own
grapheme layer above the offsets (Q14).

Also available and worth noting: `ParagraphStyle` carries `maxLines`, `ellipsis`,
`didExceedMaxLines()`, `strutStyle` and `textHeightBehavior` — the machinery for §8.2's
"overflow is an error" rule on paginated roles.

### 21.4 The fork — MIT, and four honest options

OpenPencil is **MIT licensed** at root and per package. No obstacle to any ownership form.

**Its existing seams**, which are better than assumed:
- **Scene graph:** `SceneGraph` + `SceneNode`
- **Layout:** `computeLayout` / `computeAllLayouts`, building a **disposable Yoga tree** per pass,
  plus a `TextMeasurer` hook
- **Renderer:** `SkiaRenderer.renderSceneToCanvas` → `renderNode` → per-domain functions
- **Editor:** `createEditor` / `provideEditor`

`computeAllLayouts(graph, scope?)` is the seam that matters: **the grid adapter can change
underneath it without the signature moving.** That is upstream's own pattern, and it is what makes
§21.1 cheap.

**Cross-project seam comparison:**

| Project | Licence | Model seam | Layout seam | Renderer seam |
| --- | --- | --- | --- | --- |
| OpenPencil | MIT | `SceneGraph`/`SceneNode` | `computeAllLayouts` + disposable Yoga tree | `SkiaRenderer.renderSceneToCanvas` |
| Excalidraw | MIT | `ExcalidrawElement[]` | per-feature geometry, no layout engine | `ShapeCache.generateElementShape` → `renderElement` |
| tldraw | **tldraw licence — not MIT; production use needs a commercial licence** | `Store<TLRecord>`, `StoreSchema` | shape/editor specific | `ShapeUtil.component` + `getGeometry` |
| Penpot | MPL-2.0 | shared shape records | flex/grid engines in CLJS **and** Rust | upload ABI → Rust `ShapesPool` → Skia |
| Motion Canvas | MIT | signal-backed `Node` tree | `Layout` ↔ browser flexbox DOM | `Node.render/draw` |
| Rive | MIT | generated `Core` / `Artboard` | `LayoutNodeProvider` / `LayoutParticipant` around Yoga | `Drawable::draw(Renderer*)` — **the cleanest backend-neutral interface of the set** |

The pattern **model → layout adapter → resolved scene → renderer interface** is universal; only the
seam *level* differs. Two cautions worth carrying: tldraw's licence rules it out as a code source,
and Penpot's duplicated flex/grid implementations in two languages are a standing synchronisation
cost — an argument for one implementation behind one seam.

**Four ownership forms:**

| Form | Source of truth | Upstream sync | Cost |
| --- | --- | --- | --- |
| **Patched build artifact** *(today)* | patched `engine.mjs` + prose provenance | rebuild, then **manually reconstruct 46 behaviours** | worst — no merge tooling, no types, no tests over the divergence |
| **Machine-applicable patch stack** | upstream checkout + ordered `.patch` files | rebase/replay; resolve rejected hunks | modest; keeps provenance exact |
| **Private hard fork** | fork branch commits in the real packages | merge / rebase / cherry-pick | owns build+release infra |
| **Extracted independent engine** | Canvas-owned contracts, selectively imported code | explicit ports | highest; full independence |

All four require understanding the divergence equally. They differ in **provenance granularity,
merge tooling, type and test coverage over our changes, and how much build infrastructure we own.**

Today's form is the only one with *no* merge tooling — 46 invasive behaviours reconstructed by hand
on every bump. Given decision #22 (*"we're owning this end to end"*), the honest next step is the
patch stack as an immediate improvement, with the hard fork as the destination. Recorded as Q13,
since §21.1 changes the calculus: if grid already ships, the pressure to fork *for capability* drops
sharply, and forking becomes about maintainability rather than features.

### 21.5 What this changes

| Was | Now |
| --- | --- |
| Grid = the largest engine cost in the plan | Already compiled in; exposure work (§21.1) |
| Fork urgency driven by missing capability | Driven by maintainability — the capability is already there |
| Mark flattening is an export concern | Also a layout-time normalisation (§21.3) |
| Bullets are "just paragraph metadata" | Native in PPTX, entirely absent in Skia — we draw them |
| Deck export fidelity unknown | Trusted Partners is 100% native; zero rasterization needed (§21.2) |
| Writer choice open | PptxGenJS 4.0.1, already an OpenPencil dependency |

---

## 22. Q10 resolved — the `descendants` census

The detailed classification below was measured live against `penkra`
(`092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9`). A later complete per-type census found three additional
documents with legacy descendants: `09c0a937-3e64-478c-a7ff-4daa836bc169` has 52 refs, 51 affected
refs and 177 descendant entries; `7928b2a5-7106-4008-a7a8-e477aeed4ca7` and
`e620f165-b7b9-4404-8b79-e8ce7654b96c` each have 16 refs, 15 affected refs and 36 descendant entries.
The four reviewed M4 manifests are stored under
`penkra-apps/canvas/compatibility/migration-manifests/` and are fenced to the exact source sequence.
**M4 is not mechanical and not small.**

```
refs total ................. 749
refs with descendants ...... 464   (62%)
distinct descendant paths .. 523
path shape ................. direct 1392 / nested 1275
override entries ........... 2667
```

Overridden properties, by frequency:

| Property | Count | What it actually is |
| --- | --- | --- |
| `theme` | **1470** | **Not an override — an axis selection (§7.3)** |
| `content` | 539 | should be a typed `string` property |
| `enabled` | 290 | should be a typed `boolean` property |
| `width` / `height` | 268 / 201 | instance geometry |
| `x` / `y` | 146 / 145 | instance placement |
| `icon` | 110 | should be a typed `icon` property |
| `fill` | 99 | tone/variant, or a typed property |
| `type` / `id` / `name` | 67 each | **structural identity mutation** |
| `geometry` / `viewBox` | 56 each | vector path replacement |
| `layout`, `justifyContent`, `alignItems`, `gap`, `padding` | 172 total | layout overrides |
| `fontWeight`, `fontSize`, `fontFamily`, `textGrowth` | 65 total | typography |
| `children` | **36** | **entire subtree replacement** |
| `library` | 33 | descendant repointed at a different library |
| `ref` / `descendants` | 13 / 9 | **nested refs carrying their own overrides** |
| others (`stroke`, `cornerRadius`, `opacity`, `rotation`, `clip`, `context`, …) | ~50 | styling |

### What this tells us

**1. 55% of all overrides are `theme` — and `theme` is an axis, not an override.** The single
largest use of `descendants` is doing the job §7.3 assigns to axis modes. That is a strong
independent confirmation of the axis design: the model lacked axes, so users reached for the only
per-instance mechanism available.

**2. ~35% are typed properties waiting to be declared.** `content` 539, `enabled` 290, `icon` 110.
These map cleanly onto §7.6's `properties` block. This is exactly the interface the component
should have exposed.

**3. ~29% is geometry** (`x`, `y`, `width`, `height` = 760). Most of this belongs on the **`ref`
node itself**, not on a descendant — an instance has a position; that was never an override.

**4. ~237 entries are structural, not stylistic.** `type`/`id`/`name` at 67 each, `children` at 36,
`library` at 33. Overriding a descendant's *type* and *identity* is not customisation — it is a
different component wearing another's name. **These are clones in disguise**, and P5 says they
become real clones.

**5. Nine instances override `descendants` on a nested `ref`.** Overrides of overrides. This is the
compounding-complexity argument for §7.6's removal, stated in data.

### Revised M4 migration strategy

| Class | Entries | Approach | Automatable |
| --- | --- | --- | --- |
| `theme` | 1470 | → axis mode selection on the instance | **yes, mechanical** |
| `content` / `enabled` / `icon` | 939 | → typed component properties; name per component | semi — needs a naming pass |
| geometry (`x`,`y`,`width`,`height`) | 760 | → move onto the `ref` node | **yes, mechanical** |
| styling / layout / typography | ~290 | → typed properties or axis modes, case by case | semi |
| structural (`type`,`id`,`name`,`children`,`library`) | ~237 | → **clone the component** | **no — needs review** |
| nested `ref`/`descendants` | 22 | → flatten, then re-classify | **no — needs review** |

So M4 splits: **~2,230 of 2,667 entries (84%) are mechanical or semi-mechanical**, and **~259 need
human review**. That is a tractable number, and it is the real Stage 6 estimate (components). Q10 closed.

### Two more defects found while measuring

**D10 — an unrecognised selector silently matches nothing.** `script-runtime.mjs:98-102`:

```js
if (selector.startsWith("#"))    return entry.node.id === selector.slice(1);
if (selector.startsWith("type:")) return entry.node.type === selector.slice(5);
if (selector.startsWith("name:")) return entry.node.name === selector.slice(5);
if (selector.includes("/"))       return entry.path.join("/") === selector;
return entry.node.id === selector;                 // ← silent fallthrough
```

`Get("ref", …)` returns **0 matches, no error** — it falls through to an ID comparison. The correct
form is `type:ref`. A bare word that is neither a known prefix nor any node's id is almost certainly
a mistake and should say so. This cost a full round trip during this very census.

**D11 — the `Get` cap is checked *after* the full walk.** `script-runtime.mjs:165-171`:

```js
const matches = __entries(selector);      // walks and filters the ENTIRE document
if (matches.length > limit) throw new Error("Get matched " + matches.length + " …");
```

The traversal has already happened when the error is thrown. The cap therefore saves nothing — not
time, not memory during the walk — and in the visitor form there is no payload to protect. It is a
pure obstruction. Confirms and sharpens D3: **the fix is to drop the cap on the visitor form
entirely and bound only the returned array.**

Observed live: `Get("*", visitor)` on `penkra` throws *"matched 2620 nodes"* while returning nothing.

---

## 23. Three questions closed

### 23.1 Q11 — platform targets emit source, not projects (closed by consistency)

The question was what lands on disk for `ios` / `android`: loose source files, a package manifest,
or a buildable project. It looked like a product decision. It is not — **decision #4 already
answers it.** Web emits real HTML/CSS and the agent wraps it into a framework using repo context.
The platform targets are the same shape:

- `ios` emits **SwiftUI source**. `android` emits **Compose source**.
- The agent integrates it into the actual app, which it can read.
- **Canvas never owns a build.** No `Package.swift`, no `.xcodeproj`, no Gradle config, no
  deployment target, no signing.

Emitting a project would make Canvas responsible for build settings, toolchain versions and signing
— permanent surface area, in exchange for output that fits no real repository. The agent already has
the context Canvas lacks.

**This should have been derived rather than asked.** Recorded because the failure mode — presenting
a settled consequence as an open decision — wastes the user's attention, which is the scarcest
input to this document.

### 23.2 Q12 — `flows` scope withdrawn

A flow is an edge between two frames, with a trigger that names the source node where the target has
one (§7.7): a button that navigates to a screen, or a slide transition.
"Linear advance" is slides in order; "conditional edges" would mean *if logged in go here, else
there* — statechart evaluation inside the document model.

**Deferred by decision.** Research found no shared action or transition algebra across Figma,
Sketch, Adobe XD, PresentationML, HTML navigation, SwiftUI and Compose. Their published vocabularies
are recorded in `research/export-constants-and-flow-prior-art.md`; none is promoted into Canvas by
inference. Preview/present may still traverse the selected frame list, but it does not consume flows.

**Confirmed rule: a flow connects two frames of the same role, in the same document.**
`slide` → `slide`. `route` → `route`. `ios` → `ios`. Never `slide` → `route`, never across documents.

**This no longer derives from role families**, which were deleted (#23) — it is a rule each role
states directly, and §7.7 now carries the full validation list including the `source` node that makes
"a button navigates to a screen" expressible at all.

The entire lowering feature stays deferred: triggers, actions, transitions, hyperlinks and
statechart evaluation. The structural argument holds regardless:

> A tree cannot express an edge between two arbitrary nodes. Adding a root-level collection later is
> the most expensive migration in the system (§16). Reserving `flows: []` now costs nothing.

So: **reserve the key at the root and keep the already-validated edge records as forward data.** The
exporter IR emits `flows: []`; every target's flow rows are null/unverified with an explicit
"deferred by decision" reason. No preview or exporter consumes the authored records.

**The reserved schema is not an exporter contract.** §7.7 remains the validation definition for
stored forward data. Its current trigger names do not authorize target lowering, and `transition`
appears in no emitted contract. A later feature must settle the shared action and transition
vocabulary before clearing any flow capability row.

### 23.3 Q13 — one fork, owned, and it is a build stage of its own

**Decided: hard fork, vendored, built by us. No external pointer.** Periodic manual diffs against
upstream, never a live dependency. This follows decision #22.

The question conflated two separate artifacts with very different costs.

**Fork A — the OpenPencil TypeScript engine.**

Current form is the worst of §21.4's four: a 96,164-line generated bundle whose 46 invasive
behaviours are reconstructed **by hand** on every upstream bump, documented in prose in
`PROVENANCE.json`. No merge tooling, no type coverage over our divergence, no tests asserting the
patched behaviour, no way to see what we changed except by reading a 3.4 MB artifact.

Target form:

| | |
| --- | --- |
| Base | upstream source at pinned commit `4a5e7d55`, in our repo |
| Divergence | each of the 46 behaviours as a **real commit** with a real message and a test |
| Build | ours — `bun build` from the six packages, output checked against `engineSha256` |
| Upstream sync | scheduled manual fetch and diff; cherry-pick what we want, ignore the rest |
| Seam | keep `computeAllLayouts(graph, scope?)` and the 13 exports stable (§21.4) |

MIT licence permits all of this (§21.4); notices retained.

**Fork B — Yoga with CSS Grid. CORRECTED: this is a library. Depend on it.**

An earlier draft proposed vendoring Yoga's C++ and owning an emscripten build. That was wrong, and
it inverted the principle that actually decides this:

> **Own what encodes our design decisions. Depend on what is a general-purpose commodity.**

Yoga is a box-layout calculator. It takes styles and returns rectangles. It knows nothing about
Canvas, has no opinion about our model, and would be identical if our product were something else
entirely. Same for Skia/CanvasKit — a rasterizer. These are **agnostic libraries**, and vendoring a
C++ toolchain to own a flexbox calculator buys nothing but a build system to maintain.

The OpenPencil engine is the opposite: its scene graph, its layout adapter, its renderer and its
editor **encode our design model**. It is not agnostic and never will be. That is why Fork A is
owned outright.

So: `@open-pencil/yoga-layout@3.3.0-grid.3` stays a **pinned dependency**, like any library.
Track the upstream nine-part grid series; when 2/9 lands, move to stock `yoga-layout`. No fork,
no toolchain, no exit plan needed — this was never our destiny to own.

**The test to apply to anything else that comes up:** would this code exist, unchanged, in a
product that was not Canvas? If yes, it is a library — pin it. If it embeds our model, own it.

Under that test: Yoga, CanvasKit, PptxGenJS → dependencies. OpenPencil scene graph, layout adapter,
renderer, editor → ours.

**So there is only one fork:** Fork A, the OpenPencil TypeScript engine. Yoga stays a pinned
dependency — including the `@open-pencil/yoga-layout@3.3.0-grid.3` build that gives us grid (§21.1).

**Owning one fork instead of two does not make it free**, and revision 3's conclusion here — "no new
build infrastructure beyond what `bun build` already does" — contradicted its own build plan and its
own research on the same page. `research/openpencil-fork-analysis.md:151-175` lists what a hard fork
actually requires: workspace ownership, lockfiles, CI, release tooling, licence notices, and a
standing upstream-diff workflow. Reconstructing 46 invasive patches against imported source is the
work, not the bundling. That is why it is **Stage 3 of §17**, with its own gate, rather than a line
item inside another stage.

### 23.4 A process note

Two of the three questions above were not the user's to answer: Q11 was settled by an existing
decision, Q12 was scope I introduced without prompting. Both were presented as open. The correct
default is to derive what is derivable, withdraw what was invented, and reserve the user's attention
for decisions that genuinely change the outcome — like Q13, which did.

---

## 24. The four modules, in full

§9 gives one capability table as an example. This section writes all four. Verdicts are `native` /
`raster` / `ignore` (§9.1); everything else about an entry lives in the sibling fields of §9.2's
entry grammar. PPTX verdicts are grounded in §21.2, Skia-side notes in §21.3.

> **These four tables are ILLUSTRATIVE, not total.** They show the shape, the grammar and the
> interesting rows. They are not the release artifact, and they do not yet satisfy §9.2's totality
> rule — the second-pass audit checked and the rule holds against none of them. Missing from all
> four are properties this document's own examples use: `fill.image`, stroke and its subproperties,
> opacity, clip, corner radius, flips, `textGrowth`, `content`, font family/size/style, line height,
> letter spacing, alignment, italic/underline/strike, paragraph spacing and indent, `export`,
> `description`, `visible`, `notesFor`, and everything icon- and path-specific. The print, web and
> mobile tables carry 8–13 property rows each.
>
> **The total tables are generated against the Stage 4 schema inventory** and completed in each
> module's own exporter stage (§17). Declaring totality while shipping partial tables is what
> revision 3 did, and it is worse than declaring nothing.

**A note on how earlier drafts of this section went wrong, twice.** The first contained six modules,
four verdicts, and capability entries for `table`, `video` and `lottie` — **none of which are node
types that exist**. The `substitute` verdict was then justified almost entirely by examples using
those invented types.

The second draft fixed that and made the opposite error: it wrote confident verdicts for things
nobody had checked. `layout.grid` was `raster` for PPTX (wrong — layout compiles away),
`effect.blur` was `raster` (wrong — `a:blur` exists), blend was "no blend model" (wrong — five
values exist), CMYK and spot colour were `native` (with no colour model in the schema at all), and
`frame` — the role-bearing export unit — was **missing from every table**.

**And the third draft — revision 3 — made a third version of the same error**, which is why the
rule above now sits at the top of this section. It invented an `image` node and marked it native in
all four tables; it wrote `effect.shadow.inner`, `.glow` and `.softEdge` entries for properties with
no schema behind them; it read five OOXML blend tokens as a general blend property; it marked
SwiftUI and Compose *background* blur native when both APIs blur the view's own contents; and it
declared all four tables total when none of them was.

The failures all have one shape and it is worth naming: **writing a table entry is easy, and an entry
for a thing that does not exist looks exactly like an entry for a thing that does.** Three mechanisms
now stand against it:

1. **§9.2's totality check**, generated from a machine-readable schema, so a path cannot be a table
   key unless it is a real schema path;
2. **`status: "unverified"`**, a build-blocking admission that gates the module's exporter stage;
3. **`verdict: null`**, the honest unknown, which cannot ship at all.

None of them would have caught the mesh-gradient row by reasoning. Only generating the file does —
which is why every §17 gate is a *run*, not an argument.

### 24.1 `deck` → `.pptx`

Full table in §9. The entries that matter, all grounded in §21.2 / `pptx-capabilities.md`:

| Property | Verdict | Why |
| --- | --- | --- |
| `layout.grid`, `layout.wrap` | **not in the table** | Layout compiles away (§7.4). An earlier draft marked both `raster`, which was the highest-value error in the plan |
| `frame` | `native` | `a:grpSp` when it needs its own transform or isolates compositing; otherwise its children are inlined at resolved coordinates. **`frame` was missing from every node table** — the role-bearing export unit and nearly every container |
| `fill.gradient.linear`, `.radial` | `native` | `a:gradFill` with `a:lin` / `a:path` |
| `fill.gradient.angular` | `raster` | DrawingML has no conic/angular gradient element — and Canvas renders angular today (§4.9), so this row had to exist |
| `fill.gradient.mesh` | `raster` | Absent from OOXML |
| `effect.blur`, `effect.shadow` | `native`, **`unverified`** | `a:effectLst` genuinely admits `a:blur`, `a:outerShdw`, `a:innerShdw`, `a:glow` and `a:softEdge`. Canvas has only `shadow`, `blur` and `background_blur` (`openpencil-engine.mjs:296-303`), so the other three had no schema to map from and are removed. For the two that exist, the element existing is not proof that radius, spread, offset, colour and visibility all map — that is a Stage 8 measurement. **PptxGenJS exposes none of this** — direct OOXML |
| `effect.backgroundBlur` | `raster` | No backdrop concept |
| `blendMode` | `raster`, every value | `ST_BlendMode` does contain exactly `over`, `mult`, `screen`, `darken`, `lighten`. But `a:blend` is a primitive **inside an effect DAG**, not a general per-shape blend property, and Canvas blend lives on fill/stroke/effect objects and composites against the backdrop. Shared value names are not a demonstrated mapping. Becomes `native` per value only when a generated `.pptx` over a nontrivial backdrop image-diffs against Skia inside tolerance (Stage 8) |
| `transform.rotate` | `native` | `a:xfrm` `rot` |
| `transform.skew` | `raster` | `a:xfrm` has rotation and flips, no skew |
| `text.marks.weight` | `{ verdict: native, requires: concrete-face }` | `a:rPr` has `b` (a flag), not a numeric axis. The exporter must resolve a concrete face; failing that is a consequence and a fallback |
| `text.marks.fontVariation`, `.openTypeFeatures` | `raster` | Numeric variable-font axes and arbitrary feature settings do not map to `a:rPr` |
| `text.marks.wordSpacing` | `raster` | No general run property |
| `text.marks.fill` | **by value** — `solid: native`, `*: raster` | `a:solidFill` on the run. DrawingML's character fill is narrower than a CanvasKit foreground paint, so a shader or gradient paint rasterizes. A flat `native` here was too broad, and the prose beneath it already said so |
| every other run property | **to be enumerated in Stage 8** | `pptx-capabilities.md:70-103` lists typeface families, size, bold, italic, capitalization, baseline, kerning, spacing, language, RTL, outline, highlight, underline form and fill, hyperlinks, fills and effects. Revision 3's table covered five of them and called itself complete |
| `text.paragraphs.list` | `native` | `a:buChar` / `a:buAutoNum` — but Skia has **no list model**, so the canvas draws markers itself (§21.3). Free to export, paid for on canvas |
| `axes.appearance` | `select-at-export` | A lowering rule, in the module's `axes` block, not a property verdict. A `.pptx` cannot switch with the reader's OS (§7.3) |
| `ref` | `native`, lowered | **Always inlined** as duplicated shapes, recorded as `lowered` in the report (§9.1). Not a `p:sldLayout` — see §7.6 |

**Shape — one slide, one consequence:**

```js
{ id: "slide-7", type: "frame", role: "slide", size: "16:9", fill: "#0b1620",
  children: [
    { id: "s7-title", type: "text", start: 120, y: 100, width: 1200,
      content: "Where the time goes",                                   // 19
      paragraphs: [{ from: 0, to: 19, style: "slide-title" }] },        // native
    { id: "s7-grid", type: "frame", start: 120, y: 300, width: 1680, height: 600,
      layout: "grid", gridTemplateColumns: ["1fr","1fr","1fr"], gap: 24,
      children: [ /* 9 stat cards */ ] },                               // ALSO native
    { id: "s7-wash", type: "rectangle", start: 0, y: 0, width: 1280, height: 720,
      fill: { gradient: "mesh", points: [ /* … */ ] } } ] }             // raster
```

```json
{ "ok": true, "consequences": [
  { "node": "s7-wash", "kind": "raster",
    "why": "OOXML has no mesh gradient element",
    "instead": "Use a multi-stop linear gradient to stay editable" },
  { "node": "s7-title", "kind": "reflow-risk",
    "why": "PowerPoint re-measures Canela Deck at open time; line count may differ" } ] }
```

`s7-title` and **all nine cards in the grid** stay live shapes. Only the mesh wash becomes a picture,
scoped by §9.4. This example is the corrected version of one that previously rasterized the grid and
kept the mesh gradient out of it entirely — exactly backwards.

**One presentation, one slide size.** Every frame in a deck export must resolve to the same size;
PowerPoint stores slide size on the presentation (§8.2).

**Stories.** US-1 (forty decks), US-16 (mesh → raster with a remedy), US-17 (`export: "image"`),
US-5 (speaker notes, via `notesFor`), US-8 (one slide → PNG), US-9 (nineteen review images),
US-19 (a reusable title-slide component inlined as duplicated native shapes).

**DECK-1 — the deck that needs nothing.** The Trusted Partners deck: 804 nodes, 271 text, 305 frame,
218 rectangle, 10 icon, zero effects, zero blend modes, one gradient (§4.8). Every one `native`
(§21.2). **Zero `raster` consequences.** The document that motivated this architecture needs none of
the escape hatches — and the machinery exists partly to *prove* that, which is exactly what nobody
could do in §1.1.

It will still carry `reflow-risk` on its text nodes, because PowerPoint re-measures. That is the
honest version of the claim, and how large the risk actually is gets measured at the Stage 8 gate,
not asserted here.

**The writer.** PptxGenJS 4.0.1 for structure, **direct OOXML from day one** for gradients, nested
groups and the whole `a:effectLst` family, none of which it exposes
(`pptx-capabilities.md:232-255`).

### 24.2 `print` → `.pdf`

> **SUPERSEDED by DEC1/DEC3 (§0.4) — PDF is an extraction format; the `page` capability table dissolves.**

```js
export default {
  target: `pdf`,
  roles: { page: { height: `fixed`, ordered: true, cardinality: `N:1`, sizes: `@sizes` } },
  axes: { appearance: `select-at-export`, interaction: `ignore`, viewport: `ignore` },
  profiles: [`PDF/A-3`, `PDF/X-4`, `PDF/UA-1`, `none`],   // an export parameter (§10.1)
  sizes: {
    A4:{w:794,h:1123,bleed:12,physical:{w:210,h:297,unit:`mm`}},
    A3:{w:1123,h:1587,bleed:12,physical:{w:297,h:420,unit:`mm`}},
    A5:{w:559,h:794,bleed:12,physical:{w:148,h:210,unit:`mm`}},
    Letter:{w:816,h:1056,bleed:12,physical:{w:8.5,h:11,unit:`in`}},
    Legal:{w:816,h:1344,bleed:12,physical:{w:8.5,h:14,unit:`in`}},
    Tabloid:{w:1056,h:1632,bleed:12,physical:{w:11,h:17,unit:`in`}},
    "poster-A1":{w:2245,h:3175,bleed:19,physical:{w:594,h:841,unit:`mm`}},
    "poster-A0":{w:3175,h:4494,bleed:19,physical:{w:841,h:1189,unit:`mm`}},
    "business-card":{w:331,h:189,bleed:12,safeMargin:12,physical:{w:88,h:50,unit:`mm`}},
    "banner-3x1":{w:2880,h:960,bleed:0},
    "tri-fold":{w:2381,h:1123,bleed:12,folds:[794,1588]},
    "spread-A4":{w:1588,h:1123,bleed:12,folds:[794]}
  },
  layout: { "*": `resolve-to-geometry` },
  color:  { space: `sRGB`, outputIntent: `sRGB IEC61966-2.1` },   // bundled, not selectable (§10.3)
  nodes: { frame:`native`, text:`native`, rectangle:`native`, ellipse:`native`, polygon:`native`,
           line:`native`, path:`native`, icon:`native`, group:`native`, ref:`native` },
  properties: {
    "fill.image":`native`,
    "text.marks.link":`native`, "text.marks.baselineShift":`native`,
    "text.paragraphs.list":`native`,
    "fill.gradient.linear":`native`, "fill.gradient.radial":`native`,
    "fill.gradient.angular":`raster`,
    "fill.gradient.mesh":{ verdict: null, status: `unverified` },   // see PRINT-5
    "blendMode":{ verdict: `native`, status: `unverified` },
    "transform.skew":`native`,
    "clip.mask":{ verdict: null, status: `unverified` },            // see PRINT-5
    "effect.backgroundBlur":`raster`
    // color.cmyk and color.spot are REMOVED — see PRINT-6
  },
  profileDeltas: {
    "PDF/X-4": {
      require: [`embedded-fonts`, `bleed-box`, `trim-box`, `output-intent`],
      errors:  [`unembeddable-font`, `missing-bleed`],
      properties: { "effect.backgroundBlur":`raster` }
    },
    "PDF/UA-1": {
      require: [`description-on-every-non-decorative-node`, `reading-order`, `document-language`,
                `heading-levels`, `tagged-content`],
      errors:  [`missing-description`, `undefined-reading-order`],
      properties: { "text.paragraphs.list":`native` }
    },
    "PDF/A-3": {
      require: [`embedded-fonts`, `output-intent`, `no-external-references`],
      errors:  [`unembeddable-font`, `external-reference`],
      properties: { "blendMode":{ verdict: `raster`, status: `unverified` } }   // transparency constrained
    },
    "none": {}
  }
};
```

**The profile deltas are written, not asserted.** Revision 3 said the four profiles were four
capability tables implemented as base-plus-delta and then shipped no delta objects at all. Each delta
above carries three things: `require` (what the profile demands of the document), `errors` (what
becomes a hard export failure rather than a consequence — an operational error under P1), and
`properties` (verdicts the profile tightens). **Totality validation runs on the merged table for each
profile**, not on the base alone.

`{ verdict: null, status: "unverified" }` is the honest unknown of §9.2, not a fourth verdict. It is
build-blocking for this module: the print table cannot ship until each is resolved to `native` or
`raster` by generating a file and validating it with veraPDF (Stage 10). It exists because the
alternative — writing `native` and finding out later — is the failure mode this section was created
to stop.

**`print` and `deck` share a role shape and disagree on nearly every property.** Mesh gradients,
blend modes and skew are all native here and all raster there. Structure and expressiveness are
independent — which is why the role rules and the capability table are two mechanisms, not one.

**PRINT-1 — content that does not fit.** Adding three paragraphs to a full A4 page reports:

```json
{ "consequences": [ { "node": "p4-body", "kind": "overflow",
    "why": "Content exceeds the A4 text frame by 212pt; a page has a fixed height",
    "instead": "Reduce to ~1,850 characters, or add a page" } ] }
```

Measured with `didExceedMaxLines()` (§21.3). A `route` never reports this — its height is content.

**PRINT-2 — image resolution.** The one check unique to print. An asset 800px wide, placed 8 inches
wide, prints at 100dpi where print wants 300. Invisible on screen, visibly soft on paper — this is
the "why does my printed flyer look worse than my screen" failure. Pure arithmetic at export time
against the asset's pixel dimensions, and it catches a mistake nobody sees until the print run is
paid for.

**PRINT-3 — the profile tightens the same table, and it is an export parameter.** `PDF/X-4` requires
embedded fonts, a defined bleed/trim box and a declared output intent. It does **not** "force CMYK" —
that claim was too broad; PDF/X-4 supports colour-managed workflows and permits ICC-based colour, and
device CMYK is one option rather than the requirement. `PDF/UA-1` makes `description` and reading
order mandatory rather than advisory. `PDF/A-3` constrains embedding and transparency differently
again.

Because their requirements differ, **the four profiles are four capability tables, not one** — the
module declares a base table plus the per-profile deltas written above, and export names the profile
(§10.1). Profiles are not a fifth module.

**PRINT-4 — the poster.** `role: "page"`, `size: "poster-A1"`. The entire difference from a flyer is
three numbers in the size table.

**PRINT-5 — two rows this document is not entitled to assert.** `fill.gradient.mesh` was written as
`native` on the reasoning that a PDF type 6/7 shading *is* a Coons patch — the same primitive Skia
draws. That is a good argument and it is still an argument: nobody has chosen the PDF writer, and
whether it exposes type 6/7 shadings at all is unknown. `clip.mask` is the same: soft masks exist in
PDF, and no mask schema exists in our model to map onto them. Both stay `unverified` until a file is
generated and inspected.

**PRINT-6 — CMYK and spot colour are removed.** They were listed `native` with **no model behind
them**: our colours are sRGB hex strings, fills have no colour space, documents have no ICC profile,
and the export request has no output intent. A capability table claiming a capability the schema
cannot express is exactly the unfounded assertion §24's own preamble warns about. PDF export writes
sRGB with a declared output intent. Restoring them is a model change (Q19), and a real one — print
buyers do ask for spot colours.

**PRINT-7 — validation is automated or it is nothing.** Every row above is checked by generating a
file: veraPDF for PDF/A and PDF/UA conformance, a PDF/X preflight for the print profile, and
structural assertions for embedded fonts and the tag tree.

### 24.3 `web` → `.html` + `.css`

```js
export default {
  projection: `semantic`,          // §10.3 — web consumes the unresolved projection
  roles: { route: { height: `fit_content`, ordered: false, cardinality: `N:1`,
                    sizes: { mobile:{w:390}, tablet:{w:834}, desktop:{w:1280} } } },
  axes: { appearance:`emit-conditional`,    // @media (prefers-color-scheme)
          interaction:`emit-conditional`,   // :hover, :focus-visible, :active
          viewport:`emit-conditional` },    // @media (min-width)
  layout: { "*": `emit-semantic` },  // web is the one target that emits the layout, not its result
  nodes: { frame:`native`, text:`native`, rectangle:`native`, ellipse:`native`, polygon:`native`,
           line:`native`, path:`native`, icon:`native`, group:`native`, ref:`native` },
  properties: {
    "fill.image":`native`,
    "text.paragraphs.list":`native`, "text.marks.baselineShift":`native`,
    "text.marks.fontVariation":`native`,              // font-variation-settings
    "effect.backgroundBlur":`native`,                 // backdrop-filter
    "fill.gradient.linear":`native`, "fill.gradient.radial":`native`,
    "fill.gradient.angular":`native`,                 // conic-gradient()
    "fill.gradient.mesh":`raster`,                    // no CSS mesh gradient
    "blendMode":`native`, "transform.skew":`native`, "clip.mask":`native`
  }
};
```

**The most permissive table of the four** — one `raster` entry. This is why strategy B (the model
*is* the DOM) was tempting and still wrong: HTML's expressiveness is a superset of PPTX's, so
deriving PPTX from it loses everything (§3).

**WEB-1 — an axis compiles to a media query.**

```js
gap: [ { value: 16 }, { value: 48, when: { viewport: "desktop" } } ]
```

```css
.hero { gap: 16px }
@media (min-width: 1280px) { .hero { gap: 48px } }
```

`minWidth` lives on the **mode**, not the node (§7.3) — the metadata that lets one axis mechanism
serve themes, states and breakpoints without three code paths.

**WEB-2 — hover is an axis, not a variant.** `fill: [{value:"#111"}, {value:"#2b2b2b", when:{interaction:"hover"}}]`
→ `.btn:hover`. Identical structure to WEB-1. On `deck`, `interaction` is `ignore` and the hover
value is dropped with a consequence.

**WEB-4 — web is the one target that keeps the layout, not the geometry.** Everywhere else, Yoga
resolves layout to coordinates and the exporter writes rectangles (§7.4). HTML/CSS has a real layout
engine, so emitting `display: grid` and `flex-wrap: wrap` is both possible and *better* — it is what
makes the output resize and reflow in a browser rather than being a fixed diagram. So the same
absence of `layout.*` from this table means the opposite of what it means for `deck`: not "it
compiles away" but "it survives intact."

This is the one place the IR's resolved geometry is not sufficient on its own, which is why §10.3
keeps `semantics` alongside `geometry` for every node rather than only for text.

**WEB-3 — the agent wraps it.** *"Add this to our Next.js app."* Canvas emits real HTML/CSS; the
agent reads the repo, sees the component conventions and routing, and converts. Canvas never learns
about frameworks (decision #4) — that knowledge lives in the repo, which the agent can read and
Canvas cannot.

### 24.4 `mobile` → SwiftUI / Compose

Two roles in one module, because they share a document, a component library and a token set, and
differ in output.

```js
export default {
  roles: {
    ios: { height:`fit_content`, ordered:false, cardinality:`N:1`, target:`swiftui`,
           designSystem:`apple-hig`,
           sizes: { phone:{w:393,h:852}, "phone-max":{w:440,h:956}, tablet:{w:834,h:1210} } },
    android: { height:`fit_content`, ordered:false, cardinality:`N:1`, target:`compose`,
               designSystem:`material-3`,
               sizes: { phone:{w:412,h:915}, "phone-max":{w:448,h:998}, tablet:{w:800,h:1280} } }
  },
  projection: `semantic`,
  // The toolchain matrix — every `requires` below names a key from here, never a bare OS level.
  toolchain: {
    ios:     { minOS: `16.0`, xcode: `16.2`, swift: `6.0` },
    android: { minSdk: 24, compileSdk: 35, kotlin: `2.0`, composeBom: `2025.06.00` }
  },
  axes: { appearance:`emit-conditional`, interaction:`emit-conditional`,
          viewport:`ignore` },   // size classes, not arbitrary breakpoints — see MOB-2
  layout: { "*": `emit-semantic` },
  nodes: { frame:`native`, text:`native`, rectangle:`native`, ellipse:`native`, polygon:`native`,
           line:`native`, path:`native`, icon:`native`, group:`native`, ref:`native` },
  properties: {
    "fill.image":`native`,
    "layout.grid":   { ios:      { verdict:`native`, approximation:`uniform and fractional tracks only; minmax(), auto-fill/fit, named lines, dense packing and arbitrary spans do not translate`, status:`unverified` },
                       android:  { verdict:`native`, approximation:`LazyVerticalGrid fixed/adaptive columns and spans only`, status:`unverified` } },  // MOB-5
    "layout.wrap":   { ios: { verdict:`native`, helper:`FlowLayout.swift`, requires:`ios.minOS>=16.0` },
                       android: `native` },   // MOB-1
    "text.marks.fill":`native`,  // AttributedString / AnnotatedString
    "text.paragraphs.list": { verdict:`native`, helper:`ListMarkers`, status:`unverified` },  // MOB-7
    "fill.gradient.linear":`native`, "fill.gradient.radial":`native`,
    "fill.gradient.angular": { ios:`native`, android:`native` },        // AngularGradient / sweep
    "fill.gradient.mesh": { ios: { verdict:`native`, requires:`ios.minOS>=18.0` }, android:`raster` },
    "effect.blur":           `native`,   // .blur / RenderEffect — blurs the view's own contents
    "effect.backgroundBlur": `raster`,   // MOB-8 — neither platform has a general backdrop filter
    "blendMode":     { "*": { verdict:`raster` } },   // MOB-9
    "transform.skew":{ ios:`native`, android:{ verdict: null, status:`unverified` } },  // MOB-10
    "clip.mask":     { "*": { verdict: null, status:`unverified` } }    // MOB-9
  }
};
```

**No qualifier occupies the verdict slot.** Revision 3 wrote `native-sdk:18`, `native-helper` and
`native-approx` as if they were verdicts, in a document declaring the set closed at three. They are
now `requires`, `helper` and `approximation` — sibling fields of §9.2's entry grammar — and the
verdict stays `native`. `approximation` being present is what emits the consequence, so nothing is
lost and the "`native` never produces a consequence" rule survives intact.

**Preconditions name a toolchain key, not an OS level.** Revision 3 declared only `minimumSDK`, but
the relevant APIs are versioned on several independent axes: Compose `GraphicsLayer.blendMode` is
gated on the Compose artifact version rather than on Android `minSdk`, and SwiftUI features are gated
on Xcode and Swift as well as on iOS. The `toolchain` block above is the single source those
preconditions reference, and it is also what the Stage 2 fixture projects are pinned to — so the
declaration and the thing that tests it cannot drift.

**Sizes here are the clearest case of the adaptive rule (§8.2).** `phone` → `phone-max` is one frame
seen with more room, so you can check whether the design breathes. `ios` → `android` is two frames,
because the design intent differs.

**MOB-1 — `layout.wrap` on SwiftUI is `native-helper`, not raster.** An earlier draft called it
`raster` because `HStack` does not wrap. SwiftUI's `Layout` protocol (iOS 16+) lets us emit a
`FlowLayout` struct, and a wrapping flow layout is its canonical example. Compose has `FlowRow`
outright.

The answer to the question this raised — what shape does an emitted runtime take — is settled in
§10.2: **one self-contained file per helper, in `_canvas/`, byte-identical across exports, listed in
the report.** Not a package, because a package implies versioning and a dependency the user's build
must resolve, and emitting source exists precisely to avoid that.

**MOB-2 — `viewport` is `ignore` by product decision, not by impossibility.** Apple has
compact/regular size classes and Android has window size classes, and neither is an arbitrary
`min-width: 1024`. But an arbitrary threshold *can* be expressed — `GeometryReader` and container
size on SwiftUI, `BoxWithConstraints` on Compose — so "no honest translation" was overstated. What is
true is that emitting pixel thresholds into a platform that thinks in size classes produces code a
platform engineer would not write, and we would rather drop the mode with a consequence naming what
it meant than emit that. **That is a position, and it is recorded as one**, reversible if the SwiftUI
and Compose output ever wants it.

**MOB-5 — grid carries a written approximation, per role.** SwiftUI `Grid`/`LazyVGrid` and Compose
`LazyVerticalGrid` are real grids, and neither implements the full CSS Grid track and span algorithm.
Compose's lazy grids do fixed and adaptive columns with spans; SwiftUI's `Grid` does row/column
layout, not track sizing. Revision 3 marked both `native-approx` and left the supported subset
undefined, which leaves the exporter to invent the cutoff. The `approximation` string is now the
subset, per role, and it is a Stage 12/13 gate to prove each one.

**MOB-3 — `AnnotatedString` validates the mark model.** Compose's text type is ranges of style over
one string — structurally identical to §7.2. ProseMirror, Portable Text, OOXML runs, `AttributedString`
and `AnnotatedString` all converge on it independently.

**MOB-4 — the audit found a mobile document nobody could declare.** `Penut Mobile`: 461 frames, 342
rectangles, 165 ellipses, 253 icons, frames at 393×852 (§4.8). Those are iPhone screens, and the
model had no way to say so, so nothing could be checked. **M2 assigns `module: "mobile"`; M7 assigns
`role: "ios"` to the qualifying frames.** Two migrations, because `ios` is a role and never a module
— an earlier draft had M2 assigning `ios` as a document type, contradicting decision #9 in the same
document.

**MOB-7 — lists are not free just because the string type has ranges.** `AttributedString` and
`AnnotatedString` validate the *mark* model (MOB-3) and nothing more. Markers, hanging indents and
counters still require emitted layout logic on both platforms, exactly as they do on SkParagraph
(§21.3, `yoga-skia-capabilities.md:278-288`). So the entry carries a helper and stays `unverified`
until the emitted output is snapshot-tested.

**MOB-8 — background blur is `raster` on both platforms.** Revision 3 marked SwiftUI background blur
`native` and Android `native` at API 31, and both readings are wrong in the same way. Android's
`RenderEffect` and Compose's `BlurEffect` apply to the **contents** of the render node or graphics
layer, not to the pixels behind it — the API documentation says exactly that. SwiftUI's `.blur`
likewise blurs the view itself; system materials are a fixed set of appearances, not an
arbitrary-radius backdrop filter. Foreground blur is native and is now its own row. Backdrop blur —
which samples what is behind the node — has no general equivalent, so it rasterizes until a
target-specific implementation reproduces sampled-background semantics in a golden test.

**MOB-9 — blend and mask are per-value and currently unproven.** The deck table correctly treats
blend as value-dependent; revision 3's mobile table collapsed every blend value and both platforms
into one `native`, and did the same for masks. SwiftUI has `mask` and `blendMode`; Compose exposes
blend and path clipping through specific drawing and layer APIs with offscreen-compositing and
library-version semantics. None of that establishes that every Canvas blend value and mask form maps.
Both are `raster`/unknown until the values are enumerated and tested per role.

**MOB-10 — skew is native on SwiftUI.** Revision 3 gave one flat `transform.skew: raster` for both
roles. SwiftUI's `transformEffect` applies a `CGAffineTransform`, and `projectionEffect` takes a
`ProjectionTransform` — skew is expressible. Compose can apply transforms through custom drawing and
graphics layers, but the source-level mapping needs a test, so it stays unknown rather than being
forced to match iOS. This is exactly what the per-role entry form exists for.

**MOB-6 — the size numbers are data, and they are placeholders.** 393×852 and 412×915 were invented
in an earlier draft and presented as fact. They are plausible current device sizes and they are *not*
verified against Apple's and Google's published metrics, which is a research task before the tables
ship, not a design question. What is architecture here is that sizes are **named module data**
(§8.2), so correcting a number is a data edit affecting every document that names it.

### 24.5 What the four tables demonstrate

1. **Role rules and capability are independent.** `deck` and `print` share a role shape and disagree
   on nearly every property. Neither dimension predicts the other.
2. **`raster` is never a per-exporter code path.** It is a call into the PNG renderer (§8.1). Four
   tables, one implementation.
3. **A property verdict can vary by role within a module** — `fill.gradient.mesh` is native on `ios`
   and raster on `android`. The table format has to allow that, which the `{ios, android}` form does,
   and it is why consequences are evaluated against the containing role rather than the document
   (§9.3).
4. **A verdict can vary by *value*, not just by property** — `blendMode` is `native` for five OOXML
   values and `raster` for everything else. A per-property verdict would have to round that down to
   `raster` and lose five capabilities the format has.
5. **An absence must never be readable.** Revision 3 observed that `layout.*` was missing from the
   deck table because it compiles away and missing from the web table because it survives intact —
   two opposite meanings for the same silence — and then concluded that totality *requires* the
   absence. It requires the opposite. Every module now carries an explicit `layout` block:
   `resolve-to-geometry` for deck and print, `emit-semantic` for web and mobile. Nothing is inferred
   from an omission anywhere in this document.
6. **The flagship deck needs none of it.** DECK-1: every node native, zero `raster` consequences —
   with a measured reflow tolerance, not a fidelity guarantee.


---

## 25. The foundations audit

A pass over what the plan had never covered, and what reading the implementation corrected.

### 25.1 Four the plan wrongly listed as gaps — and how far each is actually solved

**This subsection was itself over-corrected.** Having found four things already built, an earlier
draft declared all four *solved*. Two are; two are foundations with real work left on top. The
corrected reading is in the third column.

| | Where | What it already does |
| --- | --- | --- |
| **Fonts (rendering)** | `font-runtime.mjs` | `fontManager` wired to Google Fonts and Fontsource through the host's validated `network.fetch`, with an IndexedDB cache of the face bytes. **Partial** — only those two providers (`:13-18`). SF Pro, Helvetica Neue, Segoe UI and purchased faces are a separate acquisition problem, and embedding is a third (§25.3) |
| **Assets** | `document-assets.mjs`, `image-materialization.mjs` | Content-addressed store: descriptors carry `path`, `sha256`, `size`; a node's image **fill record** references an asset by `url` (there is no image node — §7.1); fetched via `api.readAsset(documentId, descriptor)`. **Solved**, and §10.2's bundle contract reuses the `sha256` directly |
| **Undo** | `document-model.mjs` | Two systems, and the plan conflated them. **Solved for agent operations:** `createDocumentOperationUpdates` clones the doc, applies the operation and emits forward + inverse updates, throwing without a durable inverse; `documents.undo` replays the inverse. **Not what the UI does:** the UI `Y.UndoManager` tracks `LOCAL_ORIGIN` and `ENGINE_ORIGIN` and **not `REMOTE_ORIGIN`** (`:24-28`), and agent edits reach the editor as *remote* updates — so they never enter the UI undo stack at all |
| **Collaboration** | `collaboration/pen-yjs-model.mjs` | The document model is a **CRDT** — listing real-time collaboration as wholly deferred in §20 was wrong. **But not for rich text:** strings and arrays are stored as atomic JSON, not `Y.Text`/`Y.Array` (`:417-423`), and a text edit commits the whole `content` property (`openpencil-engine.mjs:423-437`). Concurrent edits to text, marks, paragraphs, flows and axis modes are last-writer-wins |

**The undo correction matters for a claim the plan made.** It said granularity is "one Cmd-Z per agent
operation, already implemented." What is implemented is a durable inverse per operation, which is a
different and more useful thing — a user cannot currently press Cmd-Z to undo what an agent did.
Whether they should be able to is a product question; whether the plan may claim they already can is
not. The UI manager also tracks `model.nodes` only, so root variables, axes and flows would not be
covered even if remote origins were added (Q21).

### 25.2 Where the export file goes — the shape is settled, the permission is not

The shape is settled and is decision #29: the controller runs host-side, writes the file to an
absolute path, and the operation returns the path (and a report, §10.5); the agent reads or moves it
from there. **The spill mechanism is not involved** — spills bound *tool response bytes*, and a 4MB
deck should never be in a tool response.

**What is not established is what the controller may write, and the plan asserted it was.** The
manifest declares exactly `account-data` and `network-fetch` and no filesystem permission — from
which an earlier draft concluded Canvas cannot write a `.pptx` anywhere. The manifest does not
support that conclusion in either direction:

- The Node controller **already opens arbitrary absolute image paths** with `node:fs/promises`
  (`image-materialization.mjs:1-3, 111-139`).
- The browser export path uses a **user-selected directory handle** (`pen-file-access.mjs:76-99`),
  which is a different permission model again.

So there are already two file-access paths in the app that the manifest does not describe. Whether
the installed controller may *write* to an arbitrary path is a question to be answered by testing the
installed controller (Q18), not by reading a permission list. It blocks `destination` and therefore
blocks Stage 8.

### 25.3 Fonts — what is left

Rendering is solved (§25.1). Two things remain.

**Embedding, and it is not "we already hold the bytes".** PDF must subset-embed; PDF/X mandates it.
PPTX should embed, because a deck that references a font by name reflows on a recipient's machine —
the single most common way a "pixel-perfect" deck breaks in the wild.

An earlier draft said we can do this because the face bytes are already in IndexedDB. **The exporter
cannot reach them.** `documents.export` runs host-side in the controller; the font cache is created
through *browser* `indexedDB` (`font-runtime.mjs:50-75`). Different process, different storage. The
controller needs its own path to the exact bytes — font assets in the document store, a host font
service, or its own cache (Q17) — and "exact" matters, because the cached web faces are likely
**WOFF2 subsets**, which are not valid PowerPoint font parts.

PPTX embedding is also more than naming a face, and revision 3 named the parts without specifying
any of them. The **font-package mini-spec**, written before Stage 8 is estimated:

| Question | What must be decided and written |
| --- | --- |
| Parts | `ppt/fonts/font1.fntdata` naming, and the `p:embeddedFontLst` / `p:embeddedFont` entries in `presentation.xml` that reference them |
| Relationships | the relationship type and content-type overrides for each part |
| Formats | which of regular/bold/italic/boldItalic slots are populated, and what happens when a family has none |
| Obfuscation | Office's font obfuscation/keying scheme, and whether the reader we target requires it |
| Source format | TTF/OTF only. **WOFF2 must be converted**, because the cached web faces are WOFF2 subsets and are not valid PowerPoint font parts |
| Subsetting | which subsetter, and whether a subset breaks PowerPoint's own editing (a subset containing only the glyphs used cannot render a character the user then types) |
| Variable fonts | whether an instance is baked at a named weight, and which |
| Cache | who owns the converted/subsetted bytes, and where |
| Licence failure | what happens when OS/2 `fsType` forbids embedding — a consequence and a name-only reference, never a silent embed |

The last row matters because §10.5's export report already promises `subset: true`; a report cannot
promise what no spec defines.

**Until a minimal deck is generated, unzipped, structurally asserted and reopened on a machine
without the font, decision #30 is an unsupported assertion** — that verification is the Stage 8 gate,
and it is the precise measurement, not a proxy for it.

**Restricted faces.** SF Pro is the system font of iOS and cannot be omitted from a tool that designs
for iOS. Helvetica Neue, Segoe UI and purchased foundry faces are the same class. Decision #30 fetches,
caches and embeds them like any other face. **This is the one decision in the plan whose correctness
depends on the deployment model rather than on the code** — it rests on local developer use with
redistribution responsibility on the user, and it would need revisiting if Canvas ever became a
hosted or shared product.

**Coverage.** A Latin-font deck containing one CJK character or emoji draws a tofu box unless a second
face is loaded. Silent tofu is precisely the failure class §1 exists to eliminate, so missing coverage
is a consequence, and the reported gap is how the bundled face set grows (#31).

### 25.4 Text direction — research, with one decision

Bidi ordering, Arabic shaping and CJK line breaking are standard, ICU-handled, and need no product
decision — follow the conventions. Marks are unaffected: logical order is the correct storage, and a
mark spanning a direction boundary paints as two visual runs while remaining one range.

**One piece is architectural and is decided now: `start`/`end` instead of `left`/`right` (#32).** It
is not an RTL feature, it is a naming choice. An RTL document mirrors — navigation on the right, back
arrows reversed, padding flipped — and with `left`/`right` that is hand-flipped and wrong somewhere.
Free today; not free later. **It is M18, and the reference count is unmeasured** — revision 3 said
"M-16 migrates 1,682 references" in two places, and 1,682 is M1's variable-reference count copied
into the wrong row. M16 is the variable-shape migration. The `left`/`right` count is a Stage 3
measurement (§16).

**Already verified, and the question has moved.** ICU is present in the shipped WASM: against
canvaskit-wasm **0.40.0**, `ParagraphBuilder.RequiresClientICU()` returns `false`, and the binary
carries ICU 74 data and symbols — `icudt74l`, bidi, break iterators, and CJK/Thai/Lao/Khmer break
engines. The worry that a tree-shaken bundle had dropped it was reasonable and is resolved.

What remains is **conformance, not presence** (Q16): a corpus rendered through the exact packaged
WASM covering Arabic shaping and bidi, emoji grapheme clusters, and CJK/Thai line breaking. "ICU is
linked" and "our text lays out correctly in Arabic" are different claims and only the first is
established.

### 25.5 Accessibility

Four bullets was not enough — it left out most of what PDF/UA and semantic HTML actually require, and
one item that our own asset model forces. The full set, all of it **model** work that lands in Stage 5
with the text model rather than as a late pass. **Each is a declared field with a shape, an owner and
a lowering**, because a list of requirements is not an implementable schema — which is all revision 3
had here:

| Field | Where it lives | Shape |
| --- | --- | --- |
| `description` | any node | string, or `null` |
| `decorative` | any node | boolean, default `false` |
| `lang` | root, and as a mark type | BCP-47 tag |
| `headingLevel` | paragraph style | integer 1–6, or `null` |
| `landmark` | frame | one of `nav`, `main`, `header`, `footer`, `aside`, `region`, or `null` |
| `linkName` | a `link` mark | string, defaulting to the marked text |

Rules: **`description` and `decorative` are mutually exclusive** — a decorative node with a
description is a write-time error. **Document tree order is reading order.** Refs are expanded at
their position in that tree. There is no separate ordering field to repair, inherit or lower.
**Every field lowers per target**, and each module's table declares how (§9.2's `relationships`
domain).

- **`description`** on images and icons — alt text. Required by PDF/UA, useful in HTML and both
  mobile targets.
- **Decorative state**, explicitly. A background texture with no `description` is indistinguishable
  from a meaningful image someone forgot to describe. PDF/UA needs `Artifact`, HTML needs `alt=""`,
  and both need the author to have *said so*. A missing `description` is a `PDF/UA-1` error; a
  declared decorative flag is not.
- **Image-fill alt text lives on the owning shape.** Our images are **always** fills, never nodes
  (§7.1), so `description` lives on the shape that carries the fill.
- **Heading levels** on paragraph styles (#15). One field gives HTML real `<h1>`/`<h2>` and PDF a tag
  tree. Cheap only if decided with the style vocabulary rather than after.
- **Language**, at document and run level. Screen readers switch voice on it; PDF/UA requires it;
  a mark-level `lang` is the same mechanism as any other mark.
- **Landmark / group semantics** — nav, main, header — for HTML and the PDF tag tree.
- **Link purpose.** A link's accessible name is not always its visible text. Binds to §7.7's flow
  `source` nodes.
- **Contrast** as an advisory `contrast` consequence (§9.3).
- **Table headers and cell associations** — *if* `table` is ever agreed into the vocabulary (§7.1).
  Recorded so it is not rediscovered late; not scheduled, because the node type does not exist.

### 25.6 Marks under `Insert` / `Delete` / `Move`

The remaining core-model hole. Fully specifiable.

**Insert `n` characters at offset `i`.** Four cases, disjoint and exhaustive, stated by comparison
rather than by "at or before" — which is how revision 3 contradicted itself, saying marks ending at
`i` are untouched and then requiring typing at the end of bold to inherit bold:

| Case | Result |
| --- | --- |
| `to < i` | untouched |
| `from > i` | both endpoints shift by `n` |
| `from < i < to` (interior) | `to` shifts by `n`; `from` untouched |
| `to == i` (left boundary) | inclusive: extend `to`; non-inclusive: unchanged |
| `from == i` (right boundary) | inclusive: extend `to`; non-inclusive: shift both endpoints |

**Inclusivity is one boolean per mark type**, matching ProseMirror, not two independent boundary
flags. It defaults to `true`. `link` and `lang` are `inclusive: false`; all formatting marks are
inclusive. Both directions are tested at both boundaries.

**Delete `[a, b)`.** Clip every overlapping mark to the surviving range, drop marks that become
empty, and **merge adjacent marks that become contiguous and identical** — without the merge step the
model accumulates fragments forever.

**Move.** Marks live on the node and travel with it. The real cases are *splitting* a text node
(marks divide at the split, both sides clip) and *merging* two (offsets in the second shift by the
first's length, then run the adjacency merge).

Paragraphs use their partition rule rather than mark inclusivity. Pressing Enter splits one
paragraph and both resulting paragraphs keep that paragraph's style. Deleting a newline merges two
paragraphs and keeps the **second** paragraph's style, because the newline terminates the first.
There is no `next` style field. And §21.3's finding binds here: different-type overlapping marks must
be flattened before the paragraph is *built*, not only before export, so every operation ends with a
normalization pass.

### 25.7 Export fidelity — a build concern, not architecture

Verifying a design is done by looking at rendered frames, which agents can do. The residual is narrow:
an agent looking at our render verifies *the design*, not the `.pptx`. Checking the artifact itself
means LibreOffice headless or a human, because our renderer draws our model and cannot read OOXML
back. That is build-time QA and reaches no user. Its design consequence is now a settled part of the
architecture: the exporter emits an inspectable intermediate — the IR of §10.3 — rather than writing
a zip in one pass.

**But "LibreOffice headless plus an agent looking at frames" is far too weak for what this document
promises.** It cannot establish PowerPoint fidelity, and looking at a picture verifies none of the
things that actually matter: whether the text is editable, whether the font is embedded, whether the
notes arrived, whether the profile conforms. The golden-corpus
requirement, per target:

| Check | How |
| --- | --- |
| Object structure | unzip the artifact, assert on the shape XML — runs present, no unexpected pictures |
| Editability | assert text lives in `a:t` runs, not in a picture |
| Rendering | PowerPoint **and** LibreOffice, image-diffed against the canvas render |
| Font absence | reopen on a machine without the face installed; nothing may substitute |
| Notes, links, alt text | structural assertions per artifact, not visual inspection |
| Reflow tolerance | line-break positions diffed Skia vs PowerPoint — the Q20 measurement |
| PDF | veraPDF for A/UA, a PDF/X preflight |
| Web | browser matrix, rendered diff |
| Mobile | emitted source compiles inside the **pinned fixture projects** — an Xcode/SDK project and a Gradle/AGP/Kotlin/Compose project owned by the test suite, built in Stage 2. Canvas emits loose source and never owns a build (§23.1), so `swiftc` and Gradle need a host project that the *tests* supply |

#### Compilation is not fidelity

Every check above verifies the artifact. For `web`, `ios` and `android` the artifact is **source**,
and source that compiles can still be entirely wrong: absolutely-positioned, non-adaptive, with no
accessibility tree and no responsive behaviour. A fixed-viewport screenshot diff passes on exactly
that output. So the source targets get a second class of check, and it is a gate, not an extra:

| Check | How |
| --- | --- |
| Semantic constructs | assert the emitted source *uses* the expected constructs — `display: grid` with the document's tracks, `@media (min-width:)` from viewport modes, `prefers-color-scheme` from appearance modes, `:hover` from interaction modes, `Grid`/`LazyVerticalGrid` and `FlowLayout`/`FlowRow` on mobile |
| Responsive behaviour | render at three viewport widths and assert layout changes as the axis says it should |
| Accessibility tree | DOM accessibility tree on web; UI accessibility snapshots on both mobile fixtures — labels and roles in document tree order |
| Platform adaptation | dark mode, and dynamic-type / font-scale at two sizes |
| Component bindings | a component with three prop combinations produces three distinct, correct outputs |
| Interaction flows | a `tap` flow emits a real navigation, not a dead element |

The corpus is the Trusted Partners deck plus one document per module, and it gates Stages 8 and
10–14, not a nice-to-have.

### 25.8 Dropped from this list

**"Document too large."** An invented ceiling. The real problems were loading and traversal, already
addressed as rendering optimizations. D4's O(document) tax stays on the register because it is a
measured inefficiency, not a hypothetical limit.

---

## 26. Review disposition — first pass

`research/architecture-review-1.md` — 60 findings from a full read of revision 2, run as a Penkra Thread. Five
were `[DECISION]`; the rest objective. **All 60 are dispositioned below.** Nothing is carried as
"noted".

> **Historical section.** These dispositions describe what revision 3 changed, and their stage
> numbers refer to **revision 3's stage map**, which §17 has since replaced. Twenty-eight of them did
> not survive the second-pass audit; §27 says which and what revision 4 did about it. Read §27 for
> the current state, and this section only for provenance.

The headline result is worth stating plainly: **the architecture survived and the specification did
not.** No principle, no strategy, no module boundary and no core mechanism was overturned. What
failed was propagation — decisions made in one section and never carried into the other six — plus
capability verdicts asserted without checking, and a build order whose stages depended on later
stages. That is a much better failure than the alternative, and it is also the more insidious one,
because a plan that is right in outline and wrong in detail reads as finished.

### A — Internal inconsistencies

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Four verdicts survive after the three-verdict decision | **Fixed.** P4, Stage 2, axis tables and print diagnostics all corrected. The root cause was one field doing two jobs — split into `verdict` (table) and `kind` (consequence), §9.3, #36 |
| 2 | Deleted role families and `screen` still drive rules | **Fixed** in §8.3, M7, §17, §23.2. No behaviour derives from families anywhere |
| 3 | Migration treats `ios` as a document type | **Fixed.** M2 assigns `mobile`; M7 assigns `ios` (§16, MOB-4) |
| 4 | `type` vs `module` competing root names | **Fixed** — `module`, everywhere, #43 |
| 5 | "One document = one native target" false for `mobile` | **Fixed** — decision 1 restated as one module per document, one target per export role |
| 6 | Unagreed node types return in Stage 8 | **Fixed.** `table`, `video`, `lottie` appear in no stage |
| 7 | `spread` in a reversal's "Now" state | **Fixed** — the row reads `page` vs `route` |
| 8 | `start`/`end` has not propagated; cites a nonexistent migration | **Fixed and scoped.** M18 names the three property families and rules `x` **out**. The "1,682 references" figure was M1's count copied into the wrong row and is withdrawn — the real count is a Stage 1 measurement |

### B — Claims contradicted by code or research

| # | Finding | Disposition |
| --- | --- | --- |
| 9 | Variable schema incompatible with the shipped one | **Fixed** — M14–M17, one per change (§7.3, §16) |
| 10 | Rich-text examples contain invalid ranges | **Fixed.** All seven corrected and verified against their strings; §7.2 now states the `[from,to)` invariants, the paragraph partition rule and the sentinel ban |
| 11 | CanvasKit is 0.40.0, not 0.42.0 | **Fixed** in §21.3; pinning is a Stage 1 task. Also killed outlining (§9.5) |
| 12 | ICU is already answered by the shipped binary | **Fixed** — §25.4 records ICU 74 present, `RequiresClientICU()` false; Q16 narrowed to a conformance corpus |
| 13 | D5 already fixed | **Closed** in the register with the evidence |
| 14 | `slot` was mistaken for document content | **Corrected by revision 4 implementation review** — its sole consumer was editor chrome; M5 deletes it non-lossily (§7.6, §16) |
| 15 | Undo is not one Cmd-Z per agent operation | **Fixed** — §25.1 separates UI undo from durable operation undo; Q21 opened |
| 16 | Yjs does not solve rich-text collaboration | **Fixed** — §25.1 and §20 corrected; Q22 opened |
| 17 | Fonts only partially solved | **Fixed** — §25.1 and §25.3 separate provider rendering from acquisition, embedding and licensing |
| 18 | The controller cannot reach the browser IndexedDB font cache | **Fixed** — §25.3; Q17 opened; blocks Stage 6 |
| 19 | The filesystem conclusion is not established by the manifest | **Fixed** — §25.2 rewritten; Q18 opened |
| 20 | The D4 fix is not a small structural-sharing change | **Fixed** — Stage 0 restates it as a runtime-protocol change to be benchmarked |
| 21 | "Spill removes the ceiling" is false | **Fixed** — §12.2 lists what remains inside QuickJS |
| 22 | The "deck never loads grid machinery" argument contradicts the bundle | **Fixed** — §5 withdraws bundle size as a justification; Q23 opened |
| 23 | Hard-fork cost understated | **Fixed** — it is now Stage 1, costed against our own fork research |

### C — Capability-table defects

| # | Finding | Disposition |
| --- | --- | --- |
| 24 | Grid and wrap wrongly `raster` for PPTX | **Fixed, and it was the most valuable finding in the review.** Layout compiles away (§7.4, #44). Deleted US-2, rewrote the §24.1 example, removed the entries from three tables |
| 25 | `frame` missing from every node table | **Fixed** — added to all four with its emission rule |
| 26 | No default or completeness rule | **Fixed** — §9.2 makes the table total and enforces it in CI, #45 |
| 27 | `ref: native` violates the native definition | **Fixed** by redefining `native` as expressible, plus an explicit `lowered` record in the export report (§9.1, §10.5) |
| 28 | Deck effect rows contradict OOXML | **Fixed** — all five effect types listed with the note that PptxGenJS exposes none of them |
| 29 | Blend verdict too coarse; explanation false | **Fixed** — `blendMode` is now verdict-by-value over the five OOXML blends |
| 30 | Angular/conic gradient absent | **Fixed** — added as `raster` for deck, `native` for web and mobile |
| 31 | PPTX text needs per-property verdicts | **Fixed** — weight, variable axes, feature settings, word spacing and run fills all enumerated |
| 32 | `appearance` is not generically native | **Fixed** — `select-at-export`, with `modes` on the export request (§7.3, #50) |
| 33 | Document-type-keyed consequences fail for mobile | **Fixed** — consequences key on the containing role, resolved through refs (§9.3) |
| 34 | One PPTX cannot hold per-slide sizes | **Fixed** — `uniformSize`, checked at export (§8.2, §24.1) |
| 35 | Print table has unverified capabilities and schema inventions | **Fixed** — mesh and mask marked `unverified` (a build-blocking marker, not a verdict); CMYK and spot **removed**; PDF/X-4 CMYK claim corrected; profiles split into per-profile tables |
| 36 | Export cannot select a PDF profile | **Fixed** — `profile` on the request, tightening the table (§10.1, #54) |
| 37 | Mobile verdicts ignore platform/API boundaries | **Fixed** — `minimumSDK` declared; `native-sdk:N`, `native-helper`, `native-approx` qualifiers; MOB-2 restated as a product position rather than an impossibility |
| 38 | `native` does not work across PDF and source targets — **[DECISION]** | **Closed by the user:** `native` = expressible; losses reported as tolerances (#34). Fork 1 of the two offered, with the hiding-losses objection answered by the `kind` vocabulary and the `lowered` record |
| 39 | The raster-scope rule is not compositing-correct | **Fixed** — §9.4 rewritten around isolated compositing contexts, with a required test corpus |

### D — Missing architecture

| # | Finding | Disposition |
| --- | --- | --- |
| 40 | No exporter IR — **[DECISION]** | **Closed by the user as objective:** build the semantic IR (§10.3, #41). It is now Stage 5 |
| 41 | Editability and exact fidelity mutually unresolved — **[DECISION]** | **Closed by the user:** keep editable text, accept measured tolerance (#35). No hard line breaks, no outlining. The measurement itself is Q20 and a Stage 6 gate — deliberately unanswered |
| 42 | PptxGenJS cannot satisfy the deck table alone | **Fixed** — direct OOXML from day one of Stage 6 |
| 43 | Speaker-note adjacency is an undefined heuristic | **Fixed** — `notesFor` (§8.2, #47) |
| 44 | Flows cannot represent click targets | **Fixed** — `trigger.source` plus a full validation list (§7.7, #48) |
| 45 | Component expressions, cycles and namespaces undesigned | **Fixed** — condition AST with a closed operator set, cycle prohibition, and the library/document namespace rule (§7.6, #49) |
| 46 | Observed component-ness — **[DECISION]** | **Closed by the user:** there is no component status at all (#38). Nearest to fork 3 — refs are aliases and promote nothing — plus the structural rule that a ref target may not live in a role-bearing frame (#39) |
| 47 | Unit and colour systems missing | **Fixed** — px at 96dpi canonical with total conversions; sRGB canonical; CMYK/spot removed pending a colour model (§10.3, #51, Q19) |
| 48 | Font embedding not designed or verified | **Fixed as a gate** — §25.3 states what PPTX embedding actually requires and marks #30 unsupported until a deck is generated, unzipped and reopened without the face |
| 49 | Accessibility needs more than four bullets | **Fixed** — §25.5 expanded to ten items including decorative state and image-*fill* alt text; lands in Stage 3 with the text model |
| 50 | Versionless migrations unsafe with offline CRDT clients — **[DECISION]** | **Closed by the user:** keep `version` plus a minimum-client gate (#42). Forks 1 and 3 combined; §16 migrations are named, deterministic, server-side and atomic |
| 51 | Removing `script`/`note`/`context`/`prompt` has no migration | **Fixed** — M10–M13, with non-deterministic scripts quarantined rather than auto-migrated |
| 52 | PNG/SVG conflates two exporters | **Fixed** — three distinct things named; SVG gets its own writer and table; `documents.export-image` (§8.1, #53) |
| 53 | Source-output cardinality inconsistent | **Fixed** — frames → **bundle**, with a directory contract (§10.2, #52) |

### E — Sequencing and cost

| # | Finding | Disposition |
| --- | --- | --- |
| 54 | Stage 3 cannot retire the flagship defect before Stage 4 | **Fixed** — rich text is now Stage 3, before deck export |
| 55 | Stage 2's gate depends on Stage 7 | **Fixed** — the gate uses a mesh gradient, a property that exists today. Grid's engine rejection is removed in Stage 8 |
| 56 | Stage 3 duplicates or secretly depends on Stage 6 | **Fixed** — components and migration are Stage 4, before export |
| 57 | The hard fork has no build stage | **Fixed** — Stage 1 |
| 58 | Stage 4 assigns work to a PDF exporter that does not exist | **Fixed** — run flattening is shared and lives in the IR |
| 59 | Stage 8 is several independent programs | **Fixed** — split into Stages 9–12, one exporter each, with a validator and version matrix per stage |
| 60 | The fidelity QA plan is too weak | **Fixed** — §25.7 carries the golden-corpus matrix as a gate on Stages 6 and 9–12 |

### What the review did not change

Worth recording, because it bounds how much of this document moved:

- Strategy C, and the rejection of A and B.
- All seven principles, one wording fix aside.
- The four modules, five roles, and one-role-one-output-kind.
- Marks over one `content` string; axes unifying themes, states, variants and breakpoints.
- `${…}` interpolation; named paragraph styles; DTCG at the boundary.
- The job surface, spills as a concept, and the fork decision itself.
- Sizes as adaptive modes; `folds` as a guide; export never cutting.

### Two process notes

**The review was delegated to the thread that did the original research**, not to a fresh one and not
to a provider subagent — which is why it could cite `openpencil-engine.mjs` line numbers rather than
paraphrasing the plan back. Reviews of a plan by something that has only read the plan find
inconsistencies; reviews by something that has read the code find false claims. Forty-two of these
sixty are the second kind.

**The review message could not be read in full through the host** — it was ~45,500 characters against
a silent 20,000-character clamp with no within-message cursor. It survived only because the reviewing
agent had also written it to `research/architecture-review-1.md`. That is **H10**, and it is in the defect
register rather than being worked around quietly.

---

## 27. Review disposition — second pass

`research/architecture-review-2.md` — 60 findings from a fresh adversarial read of revision 3 by the same
thread, which was asked to test §26's claims rather than accept them. Eight were `[DECISION]`; the
rest objective. **All 60 are dispositioned below.**

**The result, plainly: twenty-eight of §26's dispositions did not survive.** Some were partial fixes
declared complete; some were fixed in one section and left standing in three others; several replaced
an old wrong claim with a new ungrounded one. The dominant failure class was the same as the first
round — propagation — but the second-worst was new and more serious: **revision 3 invented mechanisms
to close gaps.** An `image` node that does not exist. Three effect properties with no schema. Five
verdict-shaped tokens in a field declared closed at three. A slide-layout equivalence that OOXML does
not support. A totality rule with nothing to enumerate.

Revision 4's answer to all of it is the same move: **delete the invention, keep the gap visible.**
That is why this revision removes more than it adds in the capability tables, and why every remaining
unknown is now either `unverified` or `verdict: null` rather than a confident guess.

### The eight decisions, as settled

| # | Decision | Settled as |
| --- | --- | --- |
| 1 | Capability-entry grammar | **Exactly three verdicts.** Everything else moves to sibling fields — `status`, `requires`, `helper`, `approximation` (§9.2) |
| 2 | Version identity and stale-client protocol | **Two fields** — `canvasSchemaVersion` is ours, `version` stays OpenPencil's — plus a **server-side write handshake** that rejects stale sessions and quiesces during migration (§6) |
| 3 | Ambiguous migrations | **Two-phase.** A reviewed manifest resolves every judgement first; the server pass is then fully deterministic and atomic. The QA agent produces the manifest with evidence (§16) |
| 4 | PPTX reusable structure | **Refs always inline.** No `p:sldLayout` mapping (§7.6) |
| 5 | Canonical units | **px at 96 dpi, one unit, everywhere.** Presets corrected to be physically right; a role that has a physical size declares it (§10.3) |
| 6 | Binding-derived filenames | **Reject unsafe and colliding values; fail on an existing destination.** Never sanitize silently, never suffix (§10.4) |
| 7 | Print colour | **sRGB only in v1**, with one bundled `sRGB IEC61966-2.1` output intent. An arbitrary provider's PDF/X requirement is a stated limitation (§10.3) |
| 8 | Rich-text collaboration | **Character-level collaborative storage ships with rich text**, in Stage 5. The clean long-term shape, chosen over an explicit LWW regression (§17, Q22 closed) |

### A — §26 dispositions that did not survive

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | The fidelity decision never reached P1/P2 | **Fixed.** P1 now separates design-time capability from operational export failures; P2 separates raster (identical) from native (expressible, measured) — §2 |
| 2 | Three verdicts false in the serialized grammar — **[DECISION]** | **Settled: three verdicts, orthogonal metadata.** §9.2's entry grammar; every table rewritten to it |
| 3 | Axes use a fourth vocabulary | **Fixed.** Axis handling is a **lowering rule** — `select-at-export` / `emit-conditional` / `ignore` — in the module's own `axes` block, never a property verdict (§7.3) |
| 4 | An `image` node was invented and reported as existing | **Fixed by deletion.** No image node; images are `fill.image`. Removed from §7.1 and all four tables; the "38" was a fill-record count (§7.1) |
| 5 | "All ranges fixed" still false | **Fixed.** The partition example is `[0,42)` + `[42,380)`; `to: "$boundLength"` is gone and **bound content carries no ranges** (§7.2) |
| 6 | Three incompatible flow contracts | **Fixed.** One schema: `trigger` is always an object, four day-one kinds, and `transition` is removed from every example and table until a deck stage designs it (§7.7, §23.2) |
| 7 | Reversal table still asserts observed component status | **Fixed** — the row now reads "no component status; refs are aliases and `properties` is an interface" (§18) |
| 8 | Reversal table still calls `slot` inert | **Superseded** — source tracing established that it is excluded editor chrome, so M5 is a mechanical deletion (§18) |
| 9 | The 1,682/M16 error survives twice | **Fixed** — decision 32 and §25.4 both point at M18, and the number is gone |
| 10 | Hard-fork cost contradicted by §23.3 | **Fixed.** §23.3 renamed, Yoga confirmed a pinned dependency, and the "no new build infrastructure" conclusion deleted; the fork is Stage 3 with its own gate |
| 11 | The grid correction never reached §21 | **Fixed** — §7.4, §21.1 and §21.2 all now say the pinned fork computes grid and layout compiles to geometry for PPTX |
| 12 | Stage numbers not propagated | **Fixed** — §17 rebuilt, every live reference renumbered, and §26 marked historical rather than rewritten row by row |
| 13 | D10/D11 never reached the register | **Fixed** — both added to §15, scheduled in Stage 1, with D11 named as D3's sibling |
| 14 | Bundle correction never reached the role table | **Fixed** — the column is "Frames → bundle", uniform `N → 1`, with a second column for files inside (§8.2) |
| 15 | SVG writer and table promised, never scheduled | **Fixed** — Stage 14 builds `documents.export-image`, the SVG writer and the SVG table |
| 16 | Accessibility got a checklist, not a model | **Fixed** — seven declared fields with shape, owner, exclusivity, ref behaviour and per-target lowering; in Stage 5's gate (§25.5) |
| 17 | Version conflates two formats; no stale-writer gate — **[DECISION]** | **Settled** — see decision 2 above. The false "the parser requires `version`" claim is withdrawn and recorded in §18 |
| 18 | Migrations are not deterministic — **[DECISION]** | **Settled** — see decision 3 above (§16) |

### B — Capability and grounding defects

| # | Finding | Disposition |
| --- | --- | --- |
| 19 | Totality holds against no table | **Fixed by honesty.** §24 is labelled **illustrative**; the total tables are generated against the Stage 4 inventory and completed per exporter stage |
| 20 | No schema to enumerate from | **Fixed** — Stage 4 produces one canonical machine-readable schema and *generates* both validators and the capability inventory |
| 21 | "Layout never carries a verdict" vs table contents | **Fixed** — every module declares an explicit `layout` lowering block. An absence is never readable anywhere (§9, §24.5) |
| 22 | Five DrawingML effects ≠ five Canvas properties | **Fixed** — inner shadow, glow and soft edge removed; `effect.blur` and `effect.shadow` marked `unverified` pending a parameter-level mapping test |
| 23 | Blend tokens are real; the mapping is not | **Fixed** — `blendMode` is `raster` for every value on deck, `unverified` on print, `raster` on mobile, until a generated file image-diffs inside tolerance |
| 24 | `p:sldLayout` ≢ a role-less propertied frame — **[DECISION]** | **Settled: refs always inline** (§7.6) |
| 25 | The deck text table is not per-property or per-value | **Fixed** — `text.marks.fill` is by value; the full run-property enumeration is a named Stage 8 task rather than an omission |
| 26 | Print profile deltas asserted, never written | **Fixed** — all four deltas written with `require`, `errors` and `properties`, and totality validates the merged table per profile (§24.2) |
| 27 | Constants exact, unit contract contradicts every preset — **[DECISION]** | **Settled** — see decision 5. A4 is 794×1123, decks 1280×720, and every preset carries `physical` |
| 28 | Mobile background blur misidentified | **Fixed** — foreground `effect.blur` is native; `effect.backgroundBlur` is `raster` on both platforms (MOB-8) |
| 29 | Mobile skew is native on SwiftUI | **Fixed** — per-role: iOS `native`, Android unknown pending a test (MOB-10) |
| 30 | List/grid overclaimed; versioned on the wrong axis | **Fixed** — a `toolchain` matrix replaces bare `minimumSDK`; grid carries a written per-role `approximation`; lists carry a helper and stay `unverified` (MOB-5, MOB-7) |
| 31 | Generic mobile blend and mask violate the by-value rule | **Fixed** — both unknown pending per-role enumeration and compositing tests (MOB-9) |
| 32 | The asset audit calls fill records "image nodes" | **Fixed** — §25.1 says image fill record |
| 33 | ICU disposition holds; make it a build check | **Adopted** — the `RequiresClientICU() === false` assertion and the ICU data-symbol check are a Stage 3 build assertion, so an upgrade cannot silently swap builds |

### C — IR and implementation seams

| # | Finding | Disposition |
| --- | --- | --- |
| 34 | The IR resolves away the axes web must emit | **Fixed** — two projections, `resolved` and `semantic`, one contract (§10.3) |
| 35 | The IR resolves away layout web and mobile need | **Fixed** — `semantic` preserves the normalized layout tree, tracks, sizing modes and constraints alongside a geometry snapshot |
| 36 | The IR cannot implement its own raster rule | **Fixed** — every node carries `parent`, `z`, `clip` and `isolation`; `rasters` carries pixel dimensions, ppi, colour space, alpha and effect outsets |
| 37 | The isolation rule widens ordinary leaves | **Fixed** — start at the offending draw, widen only for a real crossing pixel dependency. Context creation is a technique, not a prerequisite (§9.4) |
| 38 | The component interface is not a type system | **Fixed** — seven types, required/default/optional precedence, exact assignment compatibility, enum evolution, no cascades in props, and a fixed resolution order (§7.6) |
| 39 | Cross-document reference identity absent | **Fixed** — the `imports` record, `alias:nodeId` qualified refs, pin policy, acyclicity, asset ownership and load-time failure (§7.6) |
| 40 | Flow instance addressing unstable | **Fixed** — a typed instance path `{path: [...], node}`, validated after expansion, with cascading invalidation and structural duplicate equality (§7.7) |
| 41 | Font embedding has no implementation contract | **Fixed** — a nine-row font-package mini-spec covering parts, relationships, obfuscation, WOFF2 conversion, subsetting, variable instancing, cache ownership and licence failure (§25.3) |
| 42 | "PptxGenJS plus direct OOXML" is not a design | **Fixed** — the package-injection seam is chosen in Stage 2 with a round-tripped fixture |
| 43 | Destination templating unsafe — **[DECISION]** | **Settled** — see decision 6 (§10.4) |
| 44 | Raster scale absent from the IR | **Fixed** — ppi and final pixel dimensions derived per target, with effect outsets and colour space (§10.3) |
| 45 | PDF output intent unsupplyable — **[DECISION]** | **Settled** — see decision 7 (§10.3) |
| 46 | Mark insertion contradicts its own boundary rule | **Fixed** — five disjoint cases and declared per-mark-type stickiness, tested at both boundaries (§25.6) |
| 47 | No empty-text state | **Fixed** — empty content has zero paragraphs and takes styling from the node; `from < to` stays universally true (§7.2) |
| 48 | Root and relationship constructs outside totality | **Fixed** — totality spans five domains: `root`, `roles`, `nodes`, `properties`, `relationships` (§9.2) |

### D — Sequencing

Findings 49–59 are all **fixed by the §17 rebuild**, which adopts finding 60's dependency-sound order.
Specifically: Stage 0 split so only the Canvas unblock is on the critical path (49); axis migrations
moved to the stage that builds the evaluator (50); the totality gate reduced to the deck table plus
shape validation (51); `flattenMarks` named as a Stage 5 primitive rather than "in the IR" (52);
accessibility and collaborative storage put inside Stage 5's tasks and gate (53); Stage 6 gated on
`penkra` rather than the vacuous Trusted Partners check (54); the IR moved after the resolver (55);
Q17/Q18 and the OOXML seam resolved in a Stage 2 research gate, with deck flows shipping in Stage 8
(56); layout gated on canvas and PPTX only (57); mobile compile gates given pinned fixture projects
owned by the test suite (58); and the golden corpus given semantic-source, responsive and
accessibility-tree assertions (59).

**Finding 60 is adopted as §17.** The product fact it exposes is recorded there: because Trusted
Partners contains no refs, deck export does not depend on the component migration. Components come
first by choice — the model should be settled before four exporters are written against it — and that
choice is now stated as one.

### What the second pass did not change

- The two projections aside, no principle, strategy, module boundary or core mechanism.
- Marks over one `content` string. Axes unifying themes, states, variants and breakpoints.
- Three verdicts, one consequence channel, one closed `kind` vocabulary.
- The four modules, five roles, one-role-one-output-kind, and the bundle contract.
- The fork decision, and Yoga staying a pinned dependency.
- Every finding in §26 that the second pass re-tested and confirmed.

### The verified claims worth keeping

Recorded so they are not relitigated: CanvasKit is `0.40.0` and carries ICU 74 without requiring
client ICU; released stock Yoga has no grid while the vendored fork does; `a:effectLst` has the five
named elements and `ST_BlendMode` the five named tokens (only the Canvas mappings were unproved);
`1 px @96dpi = 9,525 EMU = 0.75 pt`; PPTX slide size is presentation-wide, so the uniform-size check
is right; Yjs stores strings atomically, and durable operation undo is a different system from UI
undo; the controller cannot read browser IndexedDB font bytes, and the manifest establishes nothing
about write policy either way.

### One process note

**Two adversarial passes by the same thread found different classes of defect.** The first found
inconsistency and unfounded assertion. The second, having been told to test the dispositions rather
than accept them, found that a third of the *repairs* had introduced new inventions — which is a
failure mode a first pass structurally cannot see. A plan that has been reviewed once reads as
finished; that is precisely when it is worth reviewing again.

---

## 28. Clean-cut correction after implementation

The product has no external users, installed legacy clients, or legacy compatibility contract.
Consequently the version and reviewed-manifest architecture above did not earn its place and has
been removed from the implementation. This section is the current disposition; earlier version,
handshake, manifest, census, and sequencing passages remain only as historical rationale.

- `canvasSchemaVersion` does not exist. There is no minimum-client gate, write handshake, migration
  quiesce protocol, stale-session disconnect, or reserved replacement.
- Opening a document only returns its projection. It never detects, initiates, redirects, or locks a
  migration.
- Migration is a deliberate one-shot run for one document. It reads the original once, applies the
  M1–M18 best-effort transforms, validates a new copy, transfers assets, verifies the copied
  projection, writes one prose Markdown report beside the run, and then renames the untouched
  original as superseded. A failed copy goes to recoverable Trash.
- All fifteen current Canvas documents are in scope for that deliberate pipeline. They are processed
  one at a time; this scope statement is not a census, registration requirement, or open-path gate.
- There are no reviewed manifests, manifest registry, evidence schema, source-sequence pin, corpus
  registration requirement, or census gate. An ambiguous case takes the reasonable transform and is
  recorded under dropped, approximated, or inferred behavior in the prose report; it does not block.
- Rich-text and rendering paths inspect the exact structure they consume (`marks`, `paragraphs`,
  `axes`) rather than consulting a general model-version classifier.
- `expectedSequence` remains on ordinary mutating operations as a collaboration-control primitive;
  it is unrelated to migration versioning.

The exporter constants were resolved independently from this clean cut. The evidence and formulas
are recorded in `research/export-constants-and-flow-prior-art.md`: CanvasKit outsets follow the
engine's sigma=`radius/2` convention and Skia's three-sigma kernel support; raster PPI is declared per
role; PDF media, crop, bleed, and trim boxes derive from declared print geometry. Canvas policy sets
commercial-print rasters to 300 PPI and the default bleed to 9 points (the conventional rounded
3 mm allowance); neither value is an ISO PDF/X or PDF/A conformance requirement. Flow vocabulary is
research-only: by the 2026-09-04 product decision, Canvas exports static designs, exporter IR emits
an empty `flows` array, and all 36 flow capability rows are `ignore`.

---

## 29. Pencil file-compatibility deletion

The 2026-09-04 product decision is that Canvas does not maintain Pencil file compatibility. Pencil
import, drag/drop import, `.pen` download, parser exposure, format fixtures, differential oracles,
and format-preservation claims are deleted. Breaking Pencil files is acceptable and expected.

This does not reverse engine ownership. Canvas still owns the OpenPencil-derived scene graph,
layout adapter, renderer, editor integration, and CanvasKit runtime. The engine seam now accepts an
already-materialized Canvas object through `createCanvasSceneGraph`; it does not expose
`parsePenFile`. The canonical Canvas schema no longer carries OpenPencil's format marker. Existing
Canvas migrations are unaffected because they read stored Canvas projections and Yjs state, not
Pencil files.

Two follow-up design topics are recorded but deliberately not implemented. First, `role` remains
the identity of an export-bearing frame (`slide`, `page`, `route`, `ios`, `android`), while `target`
would name an artifact writer (`pptx`, `pdf`, `html`, `swift`, `kotlin`, `svg`) and capability tables
would be keyed by target. Second, SVG subtree export needs a target-oriented IR entry point that
accepts a roleless visual node, resolves layout and modes, uses the SVG capability table, derives
its viewBox from subtree visual bounds, and supplies an SVG-target raster policy for unsupported
descendants. It must not invent a frame role or physical size.

The roleless SVG boundary has two precise qualifications. The root may be any visual node, not only
a frame, and coordinates must be rebased to descendant visual bounds including computed effect
outsets. SVG does not need role-derived physical dimensions or page/deck semantics. It does still
need resolved geometry plus retained node text/accessibility semantics, and a request scale or
SVG-target sampling policy whenever an unsupported descendant is rasterized; role PPI is not used.
