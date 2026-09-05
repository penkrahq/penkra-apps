# CANVAS-ARCHITECTURE second-pass adversarial review

> Historical review of revision 3. Revision 4 records the dispositions; this file is supporting
> evidence, not an active plan or an independent list of unfinished work.

**Reviewed:** `CANVAS-ARCHITECTURE.md`, revision 3, 3,697 lines; `research/architecture-review-1.md`; the three research files; and the shipped Canvas implementation named in the request.

**Bottom line:** the rewrite is materially better, but it is still not implementation-ready. I retested all 60 dispositions in §26. Twenty-eight are not fully sustained: some are only partially fixed, some are contradicted by later sections, and several “Fixed” rows replace the old problem with a new ungrounded assertion. The dominant failure class is still propagation. The most serious new defects are:

- §9.2’s totality rule is not true of any of the four tables and cannot yet be implemented because there is no machine-readable schema to enumerate.
- §10.3’s IR resolves away exactly the axes and layout semantics the web/mobile emitters need.
- §17 still contains gates that depend on later stages: Stage 3 names a Stage 5 IR, Stage 5 requires the Stage 7 axis evaluator, and Stage 8 requires the Stage 10 HTML exporter.
- The canonical-unit rule makes the document’s A4 examples 25% too small and its 1920-wide “16:9” deck 20 inches wide.
- The PowerPoint-layout and blend-mode claims overread OOXML. The enum/elements exist; the claimed general mappings do not.
- The minimum-client gate is a statement, not a protocol. It does not stop a stale tab that was already connected from submitting old-schema Yjs updates after migration.

I did not edit `CANVAS-ARCHITECTURE.md`.

## A. §26 dispositions that do not survive the fresh read

1. **The settled fidelity decision never reached the principles — §§2, 9.1, 14, 18, 26; findings 38/41 — [OBJECTIVE].**

P2 still says “Visual fidelity is absolute. What you see is what you get. Always” and P1 says export cannot fail or need an incompatibility report ([CANVAS-ARCHITECTURE.md:65-69](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:65)). The settled decision is the opposite for editable PPTX text: PowerPoint reflows it, and the difference is merely reported ([lines 1054-1079](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1054), [lines 1941-1951](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1941)). Export can also fail on mixed slide sizes, filename collisions, unavailable fonts, filesystem permission and PDF-profile requirements ([lines 917-920](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:917), [lines 1290-1294](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1290), [lines 1315-1326](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1315)). §26 says finding 41 is closed and the principles survived ([lines 3647-3649](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3647), [lines 3674-3684](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3674)); it did not.

Resolution: amend P1/P2 to distinguish design-time capability validation, operational export failures, raster pixel fidelity, and native-target tolerance. No new product decision is needed; decision 35 already chose editable text plus measured tolerance.

2. **The three-verdict claim is false in the serialized table grammar — §§9.1-9.2, 24.2, 24.4, 26; findings 1/26/37 — [DECISION].**

The declared closed set is `native | raster | ignore` ([lines 1046-1052](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1046)). Actual table cells also contain `native-if-face-exists`, `unverified`, `native-sdk:18`, `native-helper`, and `native-approx` ([lines 1034-1040](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1034), [lines 3134-3144](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3134), [lines 3290-3313](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3290)). Saying they are “not verdicts” does not make that true when they occupy the verdict value slot. `native-approx` also emits a consequence, contradicting “native never produces a consequence” ([lines 1181-1186](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1181), [lines 3308-3313](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3308)).

Forks:

- Keep exactly three verdicts and make an entry an object such as `{verdict, status, requires, helper, approximation}`; unresolved entries have `verdict: null, status: "unverified"` and cannot ship.
- Admit that the policy has more than three outcome states and define those states directly.

The first preserves the settled vocabulary but requires a real entry schema. The second is simpler to execute but reverses decision 5.

3. **Axes still use a fourth, contradictory policy vocabulary — §§7.3, 9, 24; finding 32 — [OBJECTIVE].**

§7.3 says axes are governed by “the same three verdicts” and immediately says a deck gets `appearance: native` ([lines 568-570](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:568)). The deck and print tables use `select-at-export`, which is not one of the three ([lines 1010-1012](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1010), [lines 3120-3123](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3120)). The later explanation correctly says static artifacts resolve axes at export ([lines 572-584](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:572)).

Resolution: stop calling axis handling a property verdict, or model `select-at-export` as a lowering rule separate from the three visual-property verdicts. Replace the stale `appearance: native` sentence.

4. **An `image` node was invented and then reported as existing — §§4.2, 7.1, 24, 25.1; unfounded-assertion recurrence — [OBJECTIVE].**

The grounded implementation section correctly says there is no image node; images are fills ([lines 136-140](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:136)). §7.1 nevertheless adds `image` to the universal vocabulary and says 38 exist today ([lines 415-424](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:415)). All four tables then declare the invented node native ([lines 1013-1017](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1013), [lines 3131-3133](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3131)). In code, `VISUAL_NODE_TYPES` has no `image` ([openpencil-engine.mjs:13-29](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-engine.mjs:13)); image objects are recursively found inside fills ([image-materialization.mjs:88-96](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/image-materialization.mjs:88)). The “38” count is a fill-object count relabelled as a node count.

Resolution: either remove `image` from the node vocabulary/tables and capability-check `fill.image`, or explicitly agree a new image node, specify it, migrate image fills, and add it to the build plan. It cannot be described as existing.

5. **The “all ranges fixed” disposition is still false — §§7.2, 13.2, 18, 26; finding 10 — [OBJECTIVE].**

The paragraph-style example has `[0,42)` followed by `[43,380)`, leaving unit 42 uncovered despite the exact-partition rule ([lines 500-505](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:500), [lines 523-529](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:523)). The component example puts the string `"$boundLength"` in numeric `to`, despite the invariant `0 ≤ from < to ≤ length` and the sentinel ban ([lines 489-499](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:489), [lines 1803-1809](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1803)). Renaming the sentinel does not make it a number; the prose exemption at lines 1827-1830 contradicts the invariant instead of extending it.

Resolution: repair the partition example. For bound content, either omit ranges until binding resolution and synthesize the one full paragraph, or formally admit a symbolic range-bound type into the schema and validation phases.

6. **The flow contract has three mutually incompatible versions — §§7.7, 13.1, 23.2, 26; finding 44 — [OBJECTIVE].**

§7.7 defines `trigger: {kind, source?}` and gives committed `transition.kind` examples ([lines 798-808](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:798)). §13.1 reverts to `trigger: "advance"` ([lines 1751-1754](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1751)). §23.2 says the transition vocabulary is deferred and that the §13.1 entry is “not a committed vocabulary” ([lines 2941-2952](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2941)). §26 calls the flow model fixed.

Resolution: publish one v3 flow schema. If transitions are deferred, remove them from contract examples and tables. Make `trigger` uniformly an object and enumerate the day-one trigger kinds.

7. **The reversal table still asserts observed component status — §§7.6, 18, 26; finding 46 — [OBJECTIVE].**

The settled design says there is no component status at all ([lines 643-661](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:643), [lines 2451-2453](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2451)). The reversal table still says `reusable: true → component-ness observed` ([line 2480](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2480)).

Resolution: change the “Now” cell to “no component status; refs are aliases and `properties` is an interface.”

8. **The reversal table still calls `slot` inert — §§7.6, 16, 18, 26; finding 14 — [OBJECTIVE].**

§7.6, M5 and the later reversal correctly say `slot` is not inert and migration is lossy ([lines 787-791](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:787), [lines 2234-2237](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2234), [line 2505](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2505)). The same reversal table still says it is “inert Pencil-compat passthrough” ([line 2485](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2485)).

Resolution: delete the inert claim.

9. **The wrong M16/1,682 claim survives twice after being “withdrawn” — §§16, 18, 25.4, 26; finding 8 — [OBJECTIVE].**

M18 correctly says the `left/right` count is unmeasured and 1,682 belongs to M1 ([lines 2249-2256](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2249)). Decision 32 still says “M-16 migrates 1,682 references” ([line 2446](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2446)), and §25.4 repeats it ([lines 3473-3476](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3473)). M16 is the variable-shape migration, not start/end.

Resolution: point both to M18 and remove 1,682.

10. **The hard-fork cost disposition is contradicted by §23.3 — §§17, 18, 23.3, 26; findings 23/57 — [OBJECTIVE].**

Stage 1 correctly budgets source import, reconstruction of 46 patches, dependency pinning, CI, behavior tests and a build switch ([lines 2293-2298](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2293)). §23.3 is headed “own both forks,” then decides Yoga is not a fork, then concludes the remaining OpenPencil fork needs “no new build infrastructure beyond what `bun build` already does” ([lines 2954-2958](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2954), [lines 2980-3008](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2980)). That is the exact understatement §26 claims was fixed ([line 3620](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3620)); the fork research explicitly includes workspace ownership, lockfiles, CI, release tooling, notices, and upstream-diff workflow ([openpencil-fork-analysis.md:151-175](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/openpencil-fork-analysis.md:151)).

Resolution: keep Yoga as a pinned dependency if that is settled, rename §23.3, and delete the “no new build infrastructure” conclusion for the OpenPencil hard fork.

11. **The layout/grid correction did not propagate through its own research section — §§7.4, 17, 21.1-21.2, 26; findings 24/55 — [OBJECTIVE].**

§7.4 still says grid is real engine work ([lines 593-602](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:593)); Stage 8 says it is exposure-only because the vendored OpenPencil Yoga fork already computes it ([lines 2370-2375](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2370)). §21.1 then ends by saying grid needs a PPTX `raster` verdict ([lines 2623-2627](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2623)), and §21.2 repeats that PPTX must rasterize grid ([lines 2665-2667](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2665)). That directly contradicts decision 44 and §24.1.

The “already compiled” part is grounded: the vendored artifact contains `@open-pencil/yoga-layout@3.3.0-grid.3`, `Display.Grid`, grid track setters and an adapter that calls `setDisplay(Display.Grid)` ([engine.mjs:37780](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/vendor/open-pencil/engine.mjs:37780), [engine.mjs:39647-39657](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/vendor/open-pencil/engine.mjs:39647)). The stale conclusions are not.

Resolution: update §7.4 and the ends of §§21.1-21.2 to “stock Yoga has no released grid; the shipped pinned OpenPencil fork does; layout compiles to geometry for PPTX.”

12. **Stage numbers were not propagated — §§14, 19, 20, 21, 22, 26 — [OBJECTIVE].**

Examples:

- US-1 calls reflow measurement a Stage 3 gate; it is Stage 6 ([line 1951](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1951), [lines 2361-2363](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2361)).
- Q1/Q5 still block Stage 3 rather than Stage 6; Q2 says Stage 7 rather than 8; Q3 says Stage 4 rather than 3; Q4 says Stages 7–8 rather than Stage 1 ([lines 2528-2534](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2528)).
- Q10 is both open and Stage 6-blocking even though §22 says it is closed and M4 is Stage 4 ([lines 2549-2551](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2549), [lines 2854-2866](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2854)).
- The clean deck generator is said to follow Stage 3, before deck export exists ([line 2571](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2571)).
- §21.3 repeatedly calls rich-text editing Stage 4; it is Stage 3 ([lines 2709-2725](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2709)).
- §22 calls M4 “the real Stage 6 estimate”; it is Stage 4 ([line 2866](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2866)).

Resolution: do a mechanical pass over every `Stage N` reference after finalizing the revised stage map.

13. **D10 and D11 never reached the defect register or the build plan — §§15, 17, 22 — [OBJECTIVE].**

The register ends Canvas defects at D9 ([lines 2188-2199](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2188)). §22 defines D10 (unknown selectors silently fall through to ID matching) and D11 (the Get cap is checked only after a full walk) with code evidence ([lines 2868-2896](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2868)). Stage 0 addresses the cap but never D10.

Resolution: add D10/D11 to §15; explicitly schedule selector validation and make the D3/D11 relationship clear.

14. **The bundle correction did not reach the role table — §§8.2, 10.2, 18, 26; finding 53 — [OBJECTIVE].**

§10.2 correctly defines frames-to-bundle cardinality ([lines 1296-1304](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1296)). §8.2 still labels the column “Frames → files” and says route/iOS/Android are `1 → 1` ([lines 888-894](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:888)).

Resolution: rename that column and define whether `N` selected route frames produce one multi-route bundle or N bundles. §10.1 says each frame becomes its own file within “the bundle,” so the natural cardinality is `N frames → 1 bundle`, not `1:1`.

15. **The PNG/SVG disposition promises an SVG capability table and writer that do not exist in the plan — §§8.1, 17, 24, 26; finding 52 — [OBJECTIVE].**

§8.1 says SVG needs its own writer and capability table ([lines 858-870](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:858)). §24 contains only the four module tables, and no stage builds `documents.exportImage`, its SVG writer, or that table ([lines 3019-3040](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3019), [lines 2260-2397](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2260)). §26 marks the finding fixed ([line 3659](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3659)).

Resolution: add the SVG property table and a stage/gate for PNG and SVG file export, or explicitly defer both and remove US-8 from acceptance scope.

16. **The accessibility disposition added a checklist, not a model — §§6-7, 10.3, 17, 25.5, 26; finding 49 — [OBJECTIVE].**

The only new universal field actually shaped in §7.1 is `description` ([lines 443-447](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:443)). §25.5 additionally requires decorative state, document/run language, per-frame reading order, heading levels, landmarks, link purpose and focus order ([lines 3488-3514](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3488)). None has a schema shape or invariant. Stage 3 says those additions land there, but its task list does not include them ([lines 2316-2327](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2316), [lines 2392-2394](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2392)).

Resolution: define the fields, ownership, ordering semantics, ref behavior and per-target lowering, then put each into Stage 3’s gate. A list of requirements is not an implementable schema.

17. **The version disposition conflates OpenPencil’s format marker with Canvas schema versioning and still lacks a stale-writer gate — §§4.2, 6, 16, 25.1, 26; finding 50 — [DECISION].**

`blank-document.mjs` explicitly calls `version: "2.15"` a private OpenPencil serialization detail, not a caller-selected Canvas model version ([blank-document.mjs:3-7](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/blank-document.mjs:3)). The plan treats that same field as Canvas’s schema version and says the current parser requires it ([lines 391-404](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:391)). A direct measurement against the shipped `parsePenFile` accepts a missing version, `null`, `"bogus"`, and `"3.0"`; the “requires” claim is false.

More importantly, “an old client refuses to open” does not stop a tab that opened before migration. Yjs updates contain CRDT operations, not the client’s Canvas schema version; current reconciliation replays offline updates specifically because they may arrive after newer server state ([document-model.mjs:117-138](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/document-model.mjs:117)). The plan defines no session handshake, write-time version assertion, disconnect, or server rejection.

Forks:

- Separate `penFormatVersion` from `canvasSchemaVersion`, and require the latter on every mutation/session.
- Deliberately reuse one field, but then own compatibility with OpenPencil’s format semantics and validate it independently.

Either way, the server must quiesce/reject stale sessions around migration and require a client schema capability on subsequent writes. Without that protocol, finding 50 remains open.

18. **The migration section is not deterministic despite declaring that every migration is — §§6, 16, 17; findings 45/50/51 — [DECISION].**

M4 requires per-case judgement between adding a property and cloning; M5 requires visual before/after review; M10 quarantines nondeterministic scripts for a human; M11 must infer whether an unassociated note annotates a slide ([lines 2230-2249](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2230)). The section nevertheless says migrations are deterministic, server-side and atomic, and says only M4/M5/M10 need eyes ([lines 2221-2228](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2221), [line 2251](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2251)). M16 says token `type` moves to “a declared token type,” but the v3 variable examples have no place that stores that type ([lines 2245-2248](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2245), [lines 1736-1742](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1736)).

Forks:

- Make migrations deterministic by supplying a reviewed migration manifest for every ambiguous document before the atomic server pass.
- Treat M4/M5/M10/M11 as an interactive upgrade workflow rather than a migration.

The first preserves atomic deployment at the cost of a preflight project; the second is operationally honest but means some documents remain on v2 until resolved.

## B. Capability and grounding defects

19. **The §9.2 totality rule does not hold against any table — §§7, 9.2, 24, 26; finding 26 — [OBJECTIVE].**

The rule says every schema property path must appear in every module table ([lines 1116-1128](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1116)). The “full” tables omit even properties used in the document’s own examples: `fill.image`, image crop/mode, stroke and stroke subproperties, opacity, clip, corner radius, flips, text growth, content, font family/size/style, line height, letter spacing, text alignment/direction, mark italic/underline/strikethrough/shadow/language, paragraph spacing/indent/alignment, `export`, `description`, `visible`, `notesFor`, and all icon/path-specific properties. Print/web/mobile list only 8–13 property rows ([lines 3134-3145](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3134), [lines 3218-3228](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3218), [lines 3290-3300](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3290)).

Resolution: generate and publish the actual key set, then make all four tables cover it. Until that artifact exists, §24 must be labelled illustrative, not full.

20. **There is no schema from which the claimed totality check can enumerate paths — §§6-7, 9.2, 17 — [OBJECTIVE].**

§7 gives prose and examples, not a JSON Schema, TypeScript discriminated union, Zod schema, or equivalent. Current Yjs validation accepts any non-empty node `type` and arbitrary JSON properties ([pen-yjs-model.mjs:379-397](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/collaboration/pen-yjs-model.mjs:379)). There is therefore nothing mechanical for CI to enumerate or diff.

Resolution: Stage 2 needs a canonical, machine-readable schema covering root fields, every node variant, nested fill/stroke/effect/mark/paragraph objects, conditional cascades and role/module constraints. Generate both validators and capability-path inventory from it.

21. **“Layout never carries a verdict” and the table contents contradict each other — §§7.4, 9.2, 10.3, 24 — [OBJECTIVE].**

Deck/print omit layout because it compiles away; web omits it because it survives; mobile explicitly contains `layout.grid` and `layout.wrap` verdicts ([lines 3046-3049](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3046), [lines 3218-3221](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3218), [lines 3290-3293](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3290)). §24.5 correctly observes that an absence cannot be interpreted, then claims totality requires the absence ([lines 3379-3382](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3379)).

Resolution: separate authoring/layout-lowering capabilities from surviving visual-property verdicts. Each module still needs an explicit lowering entry such as `layout.grid: {kind:"resolve-to-geometry"}` or `{kind:"emit-semantic"}`; omission cannot mean two opposite things.

22. **The five DrawingML effect elements are real; the five generic native verdicts are not grounded in the Canvas model — §§9, 21.2, 24.1; finding 28 — [OBJECTIVE].**

The research is correct: `a:effectLst` admits `a:outerShdw`, `a:innerShdw`, `a:blur`, `a:glow`, and `a:softEdge`, with the exact attributes listed in [pptx-capabilities.md:164-176](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:164). But Canvas currently has only `shadow`, `blur`, and `background_blur` effect types ([openpencil-engine.mjs:296-303](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-engine.mjs:296)). No v3 schema introduces inner shadow, glow or soft edge. The table invents `effect.shadow.outer`, `.inner`, `.glow` and `.softEdge` paths ([lines 1024-1029](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1024)). It also never maps Canvas shadow `radius`, `spread`, offset, color, visibility and blend semantics to the OOXML parameters; existence of an element is not proof of total semantic coverage.

Resolution: remove nonexistent effect paths or add their schemas. For each real Canvas effect, map every subproperty and test generated XML/rendering. A property is flat `native` only if every permitted value maps.

23. **The five OOXML blend tokens are real; the Canvas blend verdict is still wrong — §§9, 21.2, 24.1; finding 29 — [OBJECTIVE].**

`ST_BlendMode` does contain exactly `over`, `mult`, `screen`, `darken`, and `lighten` ([pptx-capabilities.md:176-178](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:176)). The same source says `a:blend` is an effect-DAG primitive, not a general per-shape blend property. Canvas blend lives on fill/stroke/effect objects and composites the rendered object against its backdrop ([openpencil-engine.mjs:197-220](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-engine.mjs:197), [openpencil-engine.test.mjs:80-102](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-engine.test.mjs:80)). §24 jumps from shared names to “native” without demonstrating an equivalent effect graph or backdrop result ([lines 3053-3056](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3053)).

Resolution: generate one PPTX per blend value over nontrivial backdrops, inspect `effectDag`, and image-diff PowerPoint against Skia. Until that passes, those entries are `unverified`, not `native`.

24. **A `p:sldLayout` is not “a role-less propertied frame” and refs do not become layouts for free — §§7.6, 9.1, 13.2, 18, 24.1 — [DECISION].**

OOXML’s hierarchy is master → layout → slide. A layout provides layout-specific shapes and placeholders; slide overrides match mainly through `p:ph idx/type`. It is explicitly not a general component system ([pptx-capabilities.md:184-194](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:184), [pptx-capabilities.md:273-280](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:273)). A slide has one layout relationship; an arbitrary Canvas ref can appear multiple times, be nested, target any node, carry typed props, and vary independently. The equivalence claimed at lines 676-678 and 3064 is false.

Forks:

- Always lower refs to duplicated native shapes. Simple and correct; no reusable PowerPoint abstraction survives.
- Recognize a narrow slide-template subset: a whole-slide ref target used as the structural base of slides, with explicitly mapped placeholder props, may become a layout. All other refs inline.

The second preserves more PowerPoint reuse but adds a separate eligibility schema and tests. It cannot be inferred merely from “used by more than one slide.”

25. **The deck text table is still not per-property or per-value — §§7.2, 9.2, 24.1; finding 31 — [OBJECTIVE].**

The research enumerates run properties including typeface families, size, bold, italic, capitalization, baseline, kerning, spacing, language, RTL, outline, highlight, underline form/fill, hyperlinks, fills and effects ([pptx-capabilities.md:70-103](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/pptx-capabilities.md:70)). §24.1 covers only weight, variation/features, word spacing, fill and lists ([lines 3058-3062](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3058)). `text.marks.fill: native` is itself too broad: the prose admits only solid fill maps while a shader foreground rasterizes.

Resolution: enumerate every permitted mark and paragraph property and use per-value verdicts for fill/paint, underline styles, numbering kinds and any property whose domain crosses the OOXML boundary.

26. **The print profile deltas are asserted but not written — §§10.1, 24.2, 26; findings 35/36 — [OBJECTIVE].**

The module object has one partial base table and a profiles array ([lines 3117-3146](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3117)). Prose then says the four profiles are four capability tables implemented as base plus per-profile delta ([lines 3174-3183](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3174)); none of those delta objects exists. §26 says profiles were split into per-profile tables ([line 3637](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3637)).

Resolution: write the actual deltas, including which requirements are errors versus raster/ignore verdicts, and make totality validation run on the merged table for each profile.

27. **The conversion constants are exact; the chosen unit contract contradicts every physical-size example — §§8.2, 10.3, 13.5, 24.2; finding 47 — [DECISION].**

At 96 CSS px/in, `1 px = 9,525 EMU = 0.75 pt`; those constants are correct. Their application is not. The document calls A4 `595×842` and explicitly says those numbers are points ([lines 1887-1891](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1887), [lines 3123-3129](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3123)). Under canonical 96-dpi px, that exports as 446.25×631.5 pt—6.20×8.77 inches—not A4’s approximately 8.27×11.69 inches. Likewise 1920×1080 becomes a 20×11.25-inch slide, not the usual 13.333×7.5-inch 16:9 presentation. “iOS points and Android dp are px at the frame’s density” names a density field that no frame schema contains ([lines 1377-1382](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1377)).

Forks:

- Canonical physical inches/points with explicit logical/display scale.
- Canonical CSS px, but presets must use 96-dpi physical dimensions (A4 ≈ 794×1123) and deck presets need an explicit physical slide size independent of design resolution.
- Module-specific logical units carried explicitly into the IR.

The first is physically clean; the second preserves web intuition; the third preserves current numbers but makes cross-module copying/conversion more complex.

28. **Mobile background blur is misidentified as content blur — §24.4 — [OBJECTIVE].**

The table marks SwiftUI background blur native and Android native at API 31 ([lines 3297-3299](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3297)). Android `RenderEffect`/Compose `BlurEffect` applies to the contents/results of the render node or graphics layer, not pixels behind it; the official API says exactly that ([Android RenderEffect](https://developer.android.com/reference/kotlin/androidx/compose/ui/graphics/RenderEffect), [GraphicsLayer](https://developer.android.com/reference/kotlin/androidx/compose/ui/graphics/layer/GraphicsLayer)). SwiftUI `.blur` likewise blurs the view itself; system materials are not an arbitrary-radius general backdrop-filter equivalent ([Apple drawing and graphics](https://developer.apple.com/documentation/swiftui/drawing-and-graphics)).

Resolution: split foreground/layer blur from backdrop blur. Mark backdrop blur unverified/raster unless a target-specific implementation reproduces sampled-background semantics in a golden test.

29. **Mobile skew is marked raster even though SwiftUI exposes it natively — §24.4 — [OBJECTIVE].**

The mobile table gives one flat `transform.skew: raster` verdict ([line 3299](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3299)). SwiftUI’s `transformEffect` applies a `CGAffineTransform`, and Apple’s documentation explicitly includes skew via `ProjectionTransform` ([Apple transformEffect](https://developer.apple.com/documentation/swiftui/visualeffect/transformeffect%28_%3A%29-p663), [Apple projectionEffect](https://developer.apple.com/documentation/swiftui/view/projectioneffect%28_%3A%29)). Compose custom drawing/graphics layers can also apply transforms, but the exact source-level mapping needs a test.

Resolution: make this per-role; SwiftUI is native for affine skew. Measure/verify Compose separately instead of forcing both roles to the same verdict.

30. **Mobile list/grid capability is overclaimed and versioned on the wrong axis — §24.4; finding 37 — [OBJECTIVE].**

`AttributedString` and `AnnotatedString` validate character-range marks; they do not by themselves make `text.paragraphs.list` native. Markers, hanging indents and counters still require emitted layout logic, just as SkParagraph does ([yoga-skia-capabilities.md:278-288](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/yoga-skia-capabilities.md:278)). Compose `LazyVerticalGrid` supports fixed/adaptive columns and column spans, but it is not the plan’s general explicit-track Yoga grid ([Android lazy grids](https://developer.android.com/develop/ui/compose/lists)); SwiftUI `Grid` similarly has row/column layout, not CSS track sizing ([Apple GridLayout](https://developer.apple.com/documentation/swiftui/gridlayout)). Calling both `native-approx` without a machine-readable supported subset leaves the exporter to invent the cutoff.

The module declares only OS `minimumSDK` ([line 3284](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3284)), while relevant APIs are also versioned by Swift language/Xcode and Compose artifacts. For example Compose `GraphicsLayer.blendMode` is documented as added in Compose 1.7.0/1.9.0 depending surface, independent of Android minSdk ([Android GraphicsLayer](https://developer.android.com/reference/kotlin/androidx/compose/ui/graphics/layer/GraphicsLayer)).

Resolution: declare a toolchain/library matrix (`xcodeVersion`, SwiftUI SDK, Kotlin, Compose BOM/artifact version, `compileSdk`, `minSdk`) and an explicit supported-grid/list subset. Qualifiers must reference that matrix, not only OS level.

31. **Generic mobile `blendMode` and `clip.mask` verdicts violate the plan’s own by-value/per-role rule — §§9.2, 24.4 — [OBJECTIVE].**

The deck table correctly recognizes blend as value-dependent; mobile collapses every blend value and both platforms to `native`, and does the same for masks ([lines 3297-3300](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3297)). SwiftUI has `mask` and `blendMode`; Compose exposes blend and path clipping through specific drawing/layer APIs, with offscreen-compositing and library-version semantics ([Apple drawing and graphics](https://developer.apple.com/documentation/swiftui/drawing-and-graphics), [Android graphics modifiers](https://developer.android.com/develop/ui/compose/graphics/draw/modifiers)). That does not establish that every Canvas blend value/mask form maps.

Resolution: enumerate Canvas blend values and mask kinds, then give role/toolchain-specific entries and compositing tests.

32. **The asset audit again calls fill records “image nodes” — §§4.2, 25.1; finding 17/asset grounding — [OBJECTIVE].**

§25.1 says “image nodes reference an asset by `url`” ([line 3402](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3402)). The implementation traverses arbitrary nested objects and collects any object whose `type` is `image`; the render bridge obtains them from each node’s `fill` array ([document-assets.mjs:18-36](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/document-assets.mjs:18), [openpencil-engine.mjs:197-220](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-engine.mjs:197)).

Resolution: say “image fill records” until an image node actually exists.

33. **The ICU 74 disposition is supported, but its evidence should be recorded as a reproducible build check — §§19, 25.4, 26; finding 12 — [OBJECTIVE].**

This claim passed. Against the installed `canvaskit-wasm@0.40.0`, `ParagraphBuilder.RequiresClientICU()` returns `false`. The shipped WASM contains `icudt74l`, `BreakIterator`, `CjkBreakEngine`, and Thai/Lao/Khmer dictionary engines. The package version is pinned at [package.json:14](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/package.json:14), and the narrowed conformance question is correctly left open ([lines 3478-3486](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3478)).

Resolution: no architecture change. Add the `RequiresClientICU() === false` assertion and expected ICU data-symbol check to the Stage 1 build so an upgrade cannot silently swap to the client-ICU build.

## C. IR and implementation seams still under-specified

34. **The IR resolves away the axes the web exporter is required to emit — §§7.3, 10.3, 17, 24.3; finding 40 — [OBJECTIVE].**

The IR contract says axes and props are resolved against `modes` and “No conditional survives into an exporter” ([lines 1358-1364](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1358)). Web must emit appearance media queries, viewport media queries and interaction pseudo-selectors ([lines 3210-3214](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3210), [lines 3236-3252](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3236)). Resolved values cannot reconstruct the discarded cascades.

Resolution: the IR needs target-aware unresolved variants/conditions for semantic source targets, or two explicit levels: resolved visual IR for static artifacts and semantic source IR for web/mobile. “One IR” can still mean one contract with both projections; it cannot mean one fully resolved instance.

35. **The IR resolves away layout that web and mobile source must preserve — §§7.4, 10.3, 24.3-24.4 — [OBJECTIVE].**

IR responsibility 4 gives every node absolute geometry ([line 1364](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1364)). WEB-4 says emitting `display:grid` and wrapping flex is required for resize/reflow and that resolved geometry is insufficient ([lines 3254-3262](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3254)). Mobile source has the same issue: `FlowLayout`, `Grid`, size adaptation, fill/fit and min/max cannot be reconstructed from one absolute rectangle snapshot.

Resolution: preserve the normalized layout tree, track definitions, sizing modes, constraints and conditional variants alongside a resolved geometry snapshot. Define which target consumes which projection.

36. **The shown IR cannot implement its own compositing/raster responsibilities — §§9.4, 10.3 — [OBJECTIVE].**

The JSON example is a flat `nodes` array plus `rasters` containing only id, bounds, scale and reason ([lines 1338-1355](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1338)). Raster scoping requires parent/child structure, sibling z-order, clips, masks, group opacity, blend inputs, backdrop dependencies and expanded refs ([lines 1188-1214](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1188)). The example has none of that, nor bitmap bytes/asset identity/crop/alpha/color-space data needed by an exporter.

Resolution: define a tree or explicit parent/z-order graph, compositing-context/dependency edges, clip/effect stacks, raster asset references and target scale/color metadata in the IR schema.

37. **The “smallest isolated subtree” algorithm still widens ordinary rasterizable leaves unnecessarily — §9.4; finding 39 — [OBJECTIVE].**

The rule says a subtree is isolated only if it already forms a compositing context; if it does not, walk upward to one ([lines 1201-1211](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1201)). A plain rectangle with a mesh fill does not form such a context, yet it can be rasterized alone and placed at the same z-order with identical ordinary source-over composition. Walking upward may reach the slide and recreate the flattening failure the rule is meant to prevent.

Resolution: begin with the offending draw primitive/subtree and widen only for actual incoming/outgoing pixel dependencies (backdrop sampling, non-source-over blend, group opacity, masks/clips whose semantics cannot be emitted). Context creation is a technique, not a prerequisite.

38. **The component interface is not a type system yet — §§7.3, 7.6, 10.3, 17; finding 45 — [OBJECTIVE].**

The example introduces property types `string`, `enum`, `icon`, and `boolean`, `optional`, defaults, `bind` strings, conditional cascades inside props, and an AST with comparison operators ([lines 712-759](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:712)). It does not define numeric/color/node/style types, nullability, required/default precedence, enum evolution, assignment compatibility, whether a prop may itself be a cascade, coercion, error behavior, or binding of non-content properties. `$props.x` remains an expression-like mini-language even though conditions were moved to an AST.

Resolution: specify the complete property type algebra, binding AST/grammar, validation phases and resolution order relative to variables/axes before Stage 4.

39. **Library namespaces are described but cross-document reference/import identity is absent — §§6, 7.6, 10.3; finding 45 — [OBJECTIVE].**

The root shows `imports: {…}` only ([lines 367-380](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:367)). §7.6 says a library component resolves library variables/styles ([lines 761-771](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:761)) but never defines library IDs/versions, ref syntax, snapshot versus live linkage, import cycles, name collision rules, asset/font ownership, or what migration does to existing `library` descendant overrides.

Resolution: define the import record and qualified identifiers, resolution graph and cycle/version policy. Cross-document refs cannot be implemented from namespace prose.

40. **Flow instance addressing is not stable or complete — §7.7 — [OBJECTIVE].**

`<refId>/<nodeId>` handles one ref layer only ([lines 824-829](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:824)). Refs may nest; the same nested target can occur more than once; node IDs or imported namespaces may themselves require escaping. Deleting a source node inside a shared ref target affects every instance path, while the deletion rule is written as though one flow is involved. Duplicate-action equality over a structured trigger is undefined.

Resolution: use a typed instance path (array of ref-instance IDs plus terminal source ID), define escaping/identity and validate it after ref expansion. Define cascading invalidation when a shared target changes.

41. **Font embedding remains a gate without an implementation contract — §§10.5, 17, 25.3; findings 42/48 — [OBJECTIVE].**

The plan correctly identifies `ppt/fonts`, relationships, face mapping, subsetting and OS/2 `fsType` ([lines 3439-3454](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3439)). It does not specify the PresentationML embedded-font list, relationship/content types, Office font obfuscation/keying, supported TTF/OTF formats, subsetter, variable-font instancing, WOFF2 conversion, cache ownership or license-failure behavior. The export report nevertheless already promises `subset: true` ([lines 1402-1408](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1402)).

Resolution: write a font-package mini-spec and a minimal generated fixture before treating Stage 6 as estimated. The precise measurement remains the one already named: unzip, structural assertion, reopen on a font-absent machine.

42. **“PptxGenJS plus direct OOXML” is not an exporter design — §§17, 21.2, 24.1; finding 42 — [OBJECTIVE].**

The rewrite correctly stops pretending PptxGenJS exposes gradients/effects/groups ([lines 2353-2358](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2353)). It never chooses how OOXML is injected: mutate PptxGenJS’s generated ZIP, fork its serializers, construct package parts independently, or use another package layer. Relationship IDs, content types, namespaces/extensions, master/layout ordering and PptxGenJS regeneration boundaries are unspecified.

Resolution: choose and document the package mutation seam with one fixture that combines a PptxGenJS slide and a directly authored gradient/effect/layout, then reopen and round-trip it.

43. **Export destination templating is unsafe and collision behavior is incomplete — §§10.2, 10.4 — [DECISION].**

For N bindings, the destination itself interpolates `${schoolName}` ([lines 1390-1396](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1390)). A school name may contain `/`, `..`, a colon, reserved device names, Unicode-equivalent spellings, or collide after normalization. §10.2’s slug/collision rule applies only to frame-derived filenames inside source bundles ([lines 1315-1324](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1315)). Atomic directory moves also do not say what happens when destination exists.

Forks:

- Reject unsafe/colliding binding values and require an explicit output-name field.
- Deterministically sanitize and report the mapping.

Also decide fail-on-existing versus atomic replace/versioning. Silent overwrite is unacceptable; automatic suffixing contradicts the existing collision policy.

44. **Raster scale and physical-output policy are absent from the IR — §§9.4, 10.3, 24.2 — [OBJECTIVE].**

The IR hard-codes `scale: 2` in its example ([line 1354](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1354)). A 2× bitmap has no universal meaning across a 300-dpi print page, a PowerPoint slide, CSS responsive output and @1x/@2x/@3x mobile assets. It also omits bleed expansion and effect outsets.

Resolution: derive raster pixel dimensions from target physical size/DPI or device asset scale, include color space/alpha/effect outsets, and report final pixel dimensions—not an unexplained multiplier.

45. **The PDF color contract requires an output intent that the export API cannot supply — §§10.1, 10.3, 19, 24.2 — [DECISION].**

§10.3 says PDF writes sRGB “with a declared output intent” ([lines 1384-1388](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1384)). The export request has `profile` but no ICC/output-intent selector or embedded profile identity ([lines 1257-1266](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:1257)). Q19 leaves the color model open ([line 2543](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2543)).

Forks:

- Fix v1 to one named bundled sRGB ICC profile/output condition and make that explicit module data.
- Add document/export color-profile selection now.

The first is smaller but cannot satisfy arbitrary print-provider requirements; the second expands the model and validation surface.

46. **The mark insertion rule contradicts its own boundary convention — §25.6 — [OBJECTIVE].**

It says marks ending “at or before” insertion offset `i` are untouched, then says typing exactly at the end of bold inherits bold from the left ([lines 3520-3523](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3520)). For a bold mark `[a,i)`, the first rule leaves `to=i`; the second requires extending it to `i+n`.

Resolution: define endpoint association/stickiness explicitly per mark, or change the cases to distinguish `to < i`, `from > i`, interior insertion, and equality at each endpoint. Test both left- and right-boundary typing.

47. **The paragraph partition rule has no empty-text state — §7.2 — [OBJECTIVE].**

Every range must satisfy `from < to`, while paragraphs must cover `[0,length)` exactly ([lines 489-505](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:489)). A newly created empty text node has length zero and cannot have any legal paragraph range, yet the editor must represent it.

Resolution: specify that empty content has zero paragraphs plus a node-level/default paragraph style, or admit one zero-length paragraph as a narrowly defined exception.

48. **Root/module constructs are outside the “every node-schema property” capability mechanism — §§6-9, 24 — [OBJECTIVE].**

Capabilities that determine output also live at root or relationship level: axes, profiles, flows/triggers/transitions, notes associations, roles/sizes/folds, language/reading order, imports and component lowering. §9.2 only requires every node-schema property path, and §24 has no flow/transition/accessibility/import capability sections. This is why PPTX transitions are researched as native but never scheduled, while a deck example contains one.

Resolution: define totality across all export-relevant schema domains, not only node properties: `root`, `roles`, `relationships`, `nodes`, and nested properties. Every target must state how each survives, lowers, resolves or is ignored.

## D. Stage-by-stage dependency audit

49. **Stage 0 is not one gated shippable stage — §17 — [OBJECTIVE].**

Its only gate is `Print(1)` on Atferd, but the stage also claims D3, spills, H10 cursors, Connection defaults/quota fallback, `isSelf` removal, folder metadata and a sidebar repro ([lines 2266-2283](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2266)). That gate tests only D4. Several host changes are independent of Canvas and need different repositories/tests.

Resolution: split Stage 0A (Canvas execution unblock, gated by Atferd plus visitor traversal) from host-platform workstreams, each with its own acceptance checks. Only 0A belongs on the Canvas critical path.

50. **Stage 2 migrates axes four stages before the evaluator exists — §17 — [OBJECTIVE].**

Stage 2 runs M14–M17, replacing `themes/theme` and the current variable cascade ([lines 2304-2310](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2304)). The one evaluator for appearance/interaction/viewport/props is Stage 7 ([lines 2365-2368](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2365)). The shipped renderer only understands `themes`, node `theme`, `{type,value}`, and cascade `theme` ([openpencil-render-document.mjs:70-97](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/src/openpencil-render-document.mjs:70)). Stage 2 would migrate documents into a representation the renderer cannot resolve, so it is not shippable.

Resolution: move the base axis/variable evaluator and migrations into Stage 2, leaving target metadata/export lowering for later, or delay M14–M17 until Stage 7.

51. **Stage 2’s totality gate is impossible under the written rules — §§9.2, 17, 24.2 — [OBJECTIVE].**

Stage 2 requires all four module tables to pass totality CI ([lines 2304-2308](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2304)). The print table intentionally contains two `unverified` cells that “fail §9.2’s totality check” until Stage 9 file generation ([lines 3139-3152](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3139)). All tables are also materially partial (finding 19 above).

Resolution: Stage 2 can validate table shape and complete the deck table only; later modules cannot be release-valid before their research/export stages. Alternatively, resolve every target table before Stage 2. The current gate cannot pass.

52. **Stage 3 depends on the Stage 5 IR — §17; finding 58 — [OBJECTIVE].**

Stage 3 assigns “shared run flattening—one implementation, in the IR” while explicitly saying neither exporter exists ([lines 2320-2325](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2320)). The IR is not built until Stage 5. Rendering styled runs also needs flattening before SkParagraph construction, as §21.3 correctly says ([lines 2711-2715](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2711)).

Resolution: Stage 3 builds a target-independent `flattenMarks(content, marks)` normalization primitive used immediately by SkParagraph; Stage 5 consumes it. Do not call the Stage 3 utility “in the IR.”

53. **Stage 3 cannot satisfy the accessibility/collaboration claims attached to it — §§17, 19, 20, 25.5 — [DECISION].**

Stage 3’s gate tests range edits only ([lines 2316-2327](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2316)). The plan says all accessibility model work lands in Stage 3, but it is absent from the tasks/gate (finding 16). Q22 says concurrent rich-text representation still requires a test and a decision between a new Yjs representation and OT ([line 2546](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2546)); §20 nevertheless calls collaborative rich text deferred ([lines 2563-2567](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2563)).

Forks:

- Stage 3 includes character-level collaborative storage and accessibility schema, so rich text ships without regressing collaboration.
- Stage 3 explicitly ships LWW rich text and documents that regression, with collaboration as a later stage.

The first expands Stage 3 substantially; the second is faster but conflicts with presenting current real-time collaboration as a product foundation.

54. **Stage 4’s rationale and gate use the wrong document and hide the migration cost — §§4.8, 17, 22 — [OBJECTIVE].**

Stage 4 says “every existing deck uses `ref + descendants`” and gates on Trusted Partners having no descendants ([lines 2329-2338](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2329)). The corpus says only `penkra` uses refs/descendants; Trusted Partners’ inventory lists no refs ([lines 291-300](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:291)). The gate is therefore vacuous. The real M4 corpus is 464 refs with descendants, 2,667 override entries and about 259 requiring human review ([lines 2800-2810](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2800), [lines 2854-2866](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2854)).

Resolution: gate Stage 4 on the `penkra` document and an approved migration manifest, with render diffs and no remaining descendants. Do not put Stage 4 on the flagship deck critical path unless Trusted Partners actually contains refs.

55. **Stage 5 depends on Stage 7 — §§10.3, 17 — [OBJECTIVE].**

Stage 5 requires axis and prop resolution in the IR ([lines 2340-2348](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2340)). The unified axis/props evaluator is Stage 7 ([lines 2365-2368](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2365)). Even if Stage 2 gets enough appearance logic to keep migrated documents rendering, Stage 5’s stated full responsibility cannot be met before Stage 7.

Resolution: move Stage 7 before Stage 5, or split evaluator core into Stage 2 and target compilation into the web/mobile exporter stages.

56. **Stage 6 is blocked by unscheduled Q17/Q18 and omits native deck flows — §§7.7, 17, 19, 21.2 — [OBJECTIVE].**

Q17 (host-side font bytes) and Q18 (write permission) explicitly block Stage 6 ([lines 2540-2543](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2540)), but no earlier stage resolves them. A gate cannot be “satisfiable using only earlier stages” when two open questions are first encountered inside it.

PPTX flows are also absent from Stage 6 even though `p:transition` and hyperlinks are native and the deck contract/examples include them ([lines 2649-2656](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2649)). §17 says flow rendering begins at Stage 9 for PDF links ([lines 2396-2397](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2396)), skipping deck.

Resolution: resolve Q17/Q18 in a pre-Stage-6 research/spike gate. Either implement the committed deck flow subset in Stage 6 or remove it from the v3/deck contract until a later deck stage.

57. **Stage 8’s gate depends on the Stage 10 HTML exporter — §17 — [OBJECTIVE].**

Stage 8 requires a grid to export as native shapes to both HTML and PPTX ([lines 2370-2375](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2370)). HTML/CSS export is Stage 10 ([lines 2385-2390](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2385)).

Resolution: Stage 8 gates canvas rendering and the already-built PPTX path; Stage 10 gates semantic HTML grid output.

58. **The mobile compile gates cannot run from the artifacts the plan says Canvas emits — §§10.2, 17, 23.1 — [OBJECTIVE].**

Canvas explicitly emits loose source and “never owns a build”: no Package.swift/Xcode project, no Gradle config or deployment target ([lines 2902-2916](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2902)). Stage 11 says `swiftc` compiles SwiftUI source and Stage 12 says Gradle assembles Compose source ([lines 2385-2390](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:2385)). SwiftUI type-checking needs a selected Apple SDK/target; Compose assembly needs a Gradle project, plugin/Kotlin/Compose versions and dependencies.

Resolution: the test suite—not the exported artifact—must own fixture host projects/toolchains. Specify `xcrun --sdk iphoneos swiftc -target … -typecheck` or an Xcode fixture, and a pinned Gradle/AGP/Kotlin/Compose fixture into which emitted files are copied. This also supplies the version matrix missing in finding 30.

59. **The golden corpus is improved but still does not gate semantic source quality — §§17, 25.7; finding 60 — [OBJECTIVE].**

The matrix now covers rendering and compilation ([lines 3547-3566](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/research/canvas-architecture-revision-4.md:3547)). Compilation alone does not verify that HTML/SwiftUI/Compose preserve responsive behavior, accessibility tree, focus order, dynamic type, dark mode, component bindings, or interaction flows. A fixed screenshot diff can pass while the source is entirely absolute-positioned and nonadaptive.

Resolution: add DOM/accessibility-tree assertions and responsive viewport cases for web; UI/accessibility snapshots and size-category/device-size cases in the iOS/Android fixture apps; assert the emitted source uses the expected semantic/layout constructs.

60. **A dependency-sound order exists, but it is not the order in §17 — §17 — [OBJECTIVE].**

The minimum correction is:

1. **0A Canvas unblock**; run independent host defects separately.
2. **Research gates:** Q17/Q18, version/write handshake spike, mobile toolchain fixtures, OOXML package-injection spike.
3. **Fork + interpolation**, preserving all current behaviors.
4. **Machine-readable v3 schema + base resolver:** version protocol, modules/roles, variables/axes evaluator, conditions, refs, accessibility fields, consequences. Do not migrate until the new resolver renders the migrated form.
5. **Rich text core:** mark algebra, SkParagraph flattening, editor geometry, empty-text behavior; settle collaborative storage before declaring it shippable.
6. **Components + reviewed migrations**, gated on `penkra`, not Trusted Partners.
7. **Target-aware export IR**, retaining semantic variants/layout as well as resolved geometry.
8. **Deck exporter**, after Q17/Q18 and OOXML/font spikes; include the committed deck flow subset.
9. **Layout exposure**, gated on canvas + PPTX/IR only.
10. **Print exporter** and its profile deltas/unverified rows.
11. **Web exporter**, then gate semantic grid/media-query/pseudo-state behavior.
12. **SwiftUI exporter** against a pinned Xcode fixture.
13. **Compose exporter** against a pinned Gradle/Kotlin/Compose fixture.
14. **PNG/SVG export**, wherever product priority places it, but as an explicit scheduled writer/table rather than an implicit promise.

This ordering satisfies each gate using only earlier work. It also reveals a product fact hidden by the current critical path: because Trusted Partners contains no refs/descendants, the deck payoff does not objectively depend on completing the whole `penkra` component migration. Keeping components before deck export is a deliberate architecture/product choice, not a dependency imposed by the flagship document.

## E. Items that specifically require Emmanuel’s product or architecture decision

These are the findings above marked `[DECISION]`; the rest are resolvable by code, schema, measurement or internal consistency.

1. **Capability-entry grammar (finding 2):** exactly three verdicts plus orthogonal metadata, or admit more outcome states.
2. **Version identity and stale-client protocol (finding 17):** separate Canvas schema version from OpenPencil format version, or deliberately reuse one field; in either case choose the server write-gate behavior.
3. **Ambiguous migrations (finding 18):** pre-approved deterministic manifests versus interactive per-document upgrades.
4. **PPTX reusable structure (finding 24):** inline every ref, or define a narrow whole-slide-placeholder subset eligible for `p:sldLayout`.
5. **Canonical units (finding 27):** physical canonical units, 96-dpi px plus explicit physical preset size, or module-specific logical units.
6. **Binding-derived output filenames (finding 43):** reject unsafe names and require explicit names, or sanitize deterministically; also choose overwrite policy.
7. **Print color/output intent (finding 45):** one bundled sRGB profile in v1, or a first-class color-profile model now.
8. **Rich-text collaboration scope (finding 53):** character-level CRDT/OT in Stage 3, or an explicit temporary LWW regression.

## Verified claims that should remain

- The installed Canvas dependency is `canvaskit-wasm@0.40.0`, not 0.42.0 ([package.json:14](/Users/emmanuelgyekyeatta-penkra/Penkra/00000000-0000-4000-8000-000000000000/penkra-apps/canvas/package.json:14)).
- The shipped CanvasKit build carries ICU 74 and does not require client-provided ICU; conformance remains correctly open.
- Released stock Yoga lacks grid, while the vendored OpenPencil Yoga fork and adapter contain grid implementation.
- DrawingML `a:effectLst` has the five named effect elements with the parameters listed in the research.
- DrawingML `ST_BlendMode` has the five named tokens; only the claimed generic Canvas mapping is unproved.
- `1 CSS px @ 96 dpi = 9,525 EMU = 0.75 pt`; only the canonical-unit/preset application is wrong.
- PPTX has presentation-wide slide size, so the uniform deck-export check is correct.
- The current Yjs representation stores strings/arrays atomically, while durable operation undo and UI undo are distinct systems.
- The controller cannot read browser IndexedDB font bytes, and the manifest alone does not establish controller write policy.
- The expanded fidelity matrix is a major improvement; it needs the semantic-source checks in finding 59, not replacement.
