# Revision 4 code-review fix status

> Historical verification record. Its fixed findings are complete and are not TODOs. Consult
> `research/implementation-progress.md` for the reconciled gate status.

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

## Clean-cut correction

The later product decision removed `canvasSchemaVersion`, every write-handshake and quiesce path,
automatic migration on open, all migration manifests and their registry, sequence fencing for
migration, and the census gate. The history above records what was reviewed at the time; it no
longer describes shipped behavior. Migration is now a deliberate best-effort copy pipeline with one
human-readable Markdown report per run. Opening a document never migrates or redirects it. Effect
outsets, per-role raster policies, and declared PDF bleed/fold page-box lowering are now implemented;
PDF/X-4 conformance remains open pending an external preflight runner.
