# Revision 4 code-review fix status

> Historical verification record. Its fixed findings are complete and are not TODOs. Consult
> `research/implementation-progress.md` for the reconciled gate status.
> The Stage 6 statements about deleting Pencil slots are also historical: native Canvas slots now
> preserve component insertion surfaces and instance-owned content.

Date: 2026-09-04

## Protected commits

- `penkra-apps`, branch `codex/canvas-architecture-rev4`: `cfd5e98` protects the baseline revision-4
  implementation; `d9b8b2e` contains the fail-closed review corrections.
- `penkra-apps`, branch `codex/canvas-architecture-rev4`: `29024c8` settles the follow-up paragraph,
  mark, node-mode, variable-token and deleted-reading-order semantics.
- `penkra-backend`, branch `codex/canvas-architecture-rev4`: `8365aba` protects the production schema
  write handshake.
- Subsequent implementation is protected by app commits `382a5cf`, `ebb07e7`, `aa2d2a9`, `7e3d256`,
  `f4bab4b`, `af3e6d3`, `4ba9375`, and backend commits `003cc0f`, `6f31230`.
- Existing Explorer and Penkra-host worktree edits were not staged or changed.

## Review findings

1. **Capability default — fixed.** Unknowns default to `{verdict:null,status:"unverified"}` and any
   unverified status blocks. The build invokes the aggregate assertion before bundling and fails on
   the 121 entries that still need non-local evidence, PDF/X-4 preflight, or unsettled flow semantics. See
   `research/unverified-capabilities.md`.
2. **Mark inclusivity — fixed.** One `inclusive` policy matches ProseMirror: true by default and
   false for link and language. Both boundaries are tested for every declared mark type.
3. **Cascade/mark collision — fixed without changing the serialized model.** Cascade entries now
   match the closed `{value, when?}` shape; extra keys disqualify the array. Marks therefore cannot
   match, and `semanticVariants` shares the same discriminator. A persisted discriminator would
   contradict revision 4's specified direct cascade arrays and needs a model revision if still
   desired.
4. **Filename sanitisation — fixed.** `safeAssetName` is deleted. Derived asset names and every
   relative bundle path segment pass through the rejecting `validateOutputSegment` implementation.
5. **Instance ID remapping — fixed.** Expanded `notesFor` and typed flow sources are
   rewritten to expanded IDs.
6. **Nested prop scope — fixed.** A ref target consumes supplied props at its component root; a
   nested component declaration establishes a new lexical default scope.
7. **Raster fidelity — fail-closed where the model is open.** Effect rasters fail with
   `CANVAS_EFFECT_OUTSET_UNSPECIFIED`; other rasters fail with `CANVAS_RASTER_PPI_UNSPECIFIED`;
   physical slide size must be declared; an 8192-pixel clamp now throws instead of downscaling.
   No PPI, effect outset or missing physical preset was invented.
8. **Consequences — fixed.** Consequences are computed from all evaluated nodes before descendants
   inside a raster scope are dropped.
9. **Validation — fixed/fail-closed.** Mutual component containment cycles and every typed flow path
   segment are validated. Same-type writes clip and overlapping stored ranges are invalid. Dead
   `void` statements are removed.
10. **Scale/migrations — fixed.** M1 remaps full and partial ranges; M1–M8 and M10–M18 run in one
    deterministic pipeline; four reviewed M4 manifests are fenced to their exact source sequences.
11. **Dead capability paths — fixed.** Root, active role and present relationship paths are evaluated
    by the IR and can block export; they no longer exist solely to satisfy totality.
12. **Paragraph styles — fixed.** Named styles resolve variables and feed paragraph text-run bases;
    missing style names fail validation.

## Verification

- Focused correction suite: 31 tests pass.
- `git diff --check`: pass before commit.
- Production build: intentionally fails at the capability gate with the enumerated 121 unknowns.
  It must remain red until artifact measurements promote or conservatively classify every entry.

## Stage 6 live gate

The migration corpus is the Canvas document `penkra`
(`092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9`), read through `canvas documents execute`; the local
`penkra/penkra.pen` is an unrelated desktop UI design. The verified census is 749 refs, 464 refs with
`descendants` and 2,667 descendant entries, matching §22. A `Get("*")` walk silently truncates at
1,000 nodes, so measurements enumerate per node type. M5 deletes `slot` because its only consumer was
excluded Pencil editor chrome. At sequence 1434 M1 still has 1,747 exact matches: 1,688 direct and 59
inside `descendants`; 8 frames carry slot and 7 are non-empty. The four corpus documents contain zero
M10/M11 cases. The code and reviewed manifests are complete; deploying the migration and capturing
before/after render identity remains open. M15 is `modes: { theme: "dark" }`; M16 is
`{ tokenType, cascade: [...] }`.

The environment-only gates remain open exactly as requested: PowerPoint rendering, the no-font
host, PDF/X-4 preflight, and mobile UI/accessibility snapshot runners.

## Native slots, icon catalog, and `penkra` migration verification — 2026-09-12

- Canvas now models structural component insertion with typed `slot` properties and instance-owned
  `slots`. A slot may target the component root or a frame descendant. Nested typed properties,
  slot ownership, selection, editing, and instance swaps use the same component resolver rather
  than a Pencil-only compatibility layer.
- The bundled Phosphor catalog is available through the ordinary Canvas icon node and icon search
  operation. Migrated icons retain their source IDs; Canvas does not generate replacement IDs.
- The attached 2.0 MB source was migrated into Canvas document
  `f572abce-0531-4564-8dba-2c73893d3fc7`. At live sequence 3419, an audit against the canonical
  persistent Canvas projection matched all 2,638 migrated source nodes: zero property differences,
  zero type differences, zero parent/slot differences, zero sibling-order differences, and zero
  missing or extra source nodes. The only additional node is the intentional Canvas decision note.
  Four raster assets were retained under durable content-addressed Canvas paths.
- All 43 source screens were rendered locally. Representative live Canvas renders cover the
  expanded sidebar and provider menu, agent rows and connection menu, onboarding artwork, app
  launcher artwork, composer context, and empty-slot affordance. The live document structure and
  local render oracle are the same canonical persistent representation.
- The final focused Canvas migration/render/component/runtime/persistence suite passes 276 tests.
  The OpenPencil
  source engine and all upstream packages rebuild successfully; scene-graph typecheck and the Pen
  package build pass. The upstream aggregate check reaches its pre-existing repository lint debt
  and stops with 59 violations outside this integration's changed lines. The broader Canvas suite's
  only repeatable external failure is the local LibreOffice wrapper pointing to a missing
  `/Applications/LibreOffice.app/Contents/MacOS/soffice`; the browser artifact checks pass alone.

## Live persistence correction — 2026-09-12

- The editor no longer stores a full Yjs document in IndexedDB. It stores only identified,
  unacknowledged local updates and removes each outbox entry after the server acknowledges it.
  This prevents a stale renderer replica from merging deleted structure into a newer server head.
- OpenPencil graph replacement is disposable view work. Scene mutations are forwarded to the
  canonical model only during a captured user authoring event or an explicit undo/redo replay;
  refresh and background graph mutations are ignored.
- Renderer code no longer creates server snapshots. Snapshot compaction remains in the operation
  path, after a conflict-checked append, and undo snapshots the backend-issued inverse.
- A second defect was reproduced independently of the editor: `getDocumentProjection` returned a
  snapshot plus following updates, while `documents.execute` read only the projection. Valid
  updates were therefore invisible until the ten-update compaction boundary, where stale
  projection could be snapshotted and the update log pruned. Operations now restore and
  materialize every returned update before reading, editing, or compacting.
- The process-local operation cache was removed. A sequence number identifies the logical update
  head, not the byte identity of an in-process projection, so it is not a sufficient cache key.
- Recovery used ordinary conflict-checked updates rather than replacing a snapshot at the same
  sequence. Two fresh reads after the final installed-editor open matched the canonical digest:
  2,638 authored nodes, FNV accumulator `3871342111`, secondary accumulator `268971219`, sequence
  3419. The current package opened with `Saved`, Undo and Redo disabled, and the Layers panel
  exposed all 20 migrated roots without advancing the sequence.
- Library module labels now come from the bounded collection projection (`projectionFields=module`)
  instead of issuing one CRDT state read per document. The per-document fallback and its
  `Unavailable` state were deleted.

## Clean-cut correction

The later product decision removed `canvasSchemaVersion`, every write-handshake and quiesce path,
automatic migration on open, all migration manifests and their registry, sequence fencing for
migration, and the census gate. The history above records what was reviewed at the time; it no
longer describes shipped behavior. Migration is now a deliberate best-effort copy pipeline with one
human-readable Markdown report per run. Opening a document never migrates or redirects it. Effect
outsets, per-role raster policies, and declared PDF bleed/fold page-box lowering are now implemented;
PDF/X-4 conformance remains open pending an external preflight runner.
