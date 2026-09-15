# Penkra Apps

## Instruction authority

The client-workspace `../AGENTS.md` is the higher-level authority for client scope, consequential
claims, external effects, and shared-client-instruction changes. This file is authoritative for
Penkra-authored App implementation, design, validation, and independent App releases in this
repository. Each App's ignored root `TODO.md` is its single planning authority; Penkra host and
public SDK work belongs in the desktop repository's root `TODO.md`. Neither plan overrides an App's
local design source or version authority. A narrower rule here applies unless it conflicts with the
higher-level client boundary.

## Planning authority

- Put an App's active and explicitly deferred work in `<app>/TODO.md`. These files are intentionally
  gitignored working state.
- Do not create repository-wide or parallel App roadmaps, plan files, phase documents, “next” files,
  or planning lists in research/status documents. Reconcile the work into the owning App's TODO.
- Keep settled architecture, compatibility evidence, research, and completed QA in tracked files
  beside the App. Those documents may explain the system or prove a result, but must point to the
  App TODO rather than maintain another list of unfinished work.
- Remove completed TODO items after proportionate verification. Preserve completion through commits
  and evidence rather than checked-off plan inventories.
- Cross-App work belongs to the App that owns the user-visible outcome. Move it to Penkra's TODO only
  when it changes the shared host or public SDK contract.

## Product boundaries

- Work only on Penkra-authored Apps in this repository.
- Every App uses the public Penkra App runtime and SDK. Do not add private host APIs.
- Penkra owns the trusted panel tab strip. Each App owns its complete web surface,
  including whether it renders the standard App Bar on any given page.
- Use the public App Bar specification, semantic tokens, and optional framework
  adapters. Do not depend on the host rendering or configuring an App Bar for an App.
- The Penkra desktop repository's `TODO.md` is authoritative for the active SDK and platform
  contract; an App's `TODO.md` is authoritative only for that App.

## Manifest summaries

- Treat every `penkra-app.json` `summary` as untrusted catalog data that Penkra will show to users
  and agents. Keep it a short, factual description of what the App does.
- Do not put headings, fenced blocks, model-directed instructions, authority claims, or operational
  procedures in a summary. Put agent operating guidance in the App's `INSTRUCTIONS.md` instead.

## Investigation and decision standard

- Never implement a behavioral, architectural, performance, data-model, or product change before
  investigating the actual current system. First inspect the relevant history, design authority,
  source, dependencies, runtime configuration, release state, and prior attempted fixes. Preserve
  unrelated work and verify uncertain outcomes before repeating an action.
- Treat user-facing and agent-facing writing as part of the system under investigation. Audit the
  exact instructions, operation manuals, generated help, manifest summaries, labels, errors,
  comments presented as guidance, and installed package version that the affected actor actually
  saw. Check for ambiguity, omission, stale terminology, misleading examples, duplicated guidance,
  and source-versus-installed version skew before attributing behavior only to code or the model.
  Reconstruct when and why help was or was not loaded; do not assume the first visible failed call
  was the actor's first interaction with the App.
- Reproduce a reported defect on the exact affected App, version, document or record, environment,
  and lifecycle path. Capture correlated logs, monotonic timings, process/resource observations,
  operation results, and intermediate visual state as appropriate. Establish a control and reduce
  the failure until the causal mechanism is demonstrated. A plausible correlation, successful
  mutation, saved revision, or clean layout warning list is not proof of visual correctness or root
  cause.
- Do not implement from a hunch, symptom, timeout, or size threshold. Diagnostic instrumentation and
  bounded reproduction harnesses come first. When the historical occurrence cannot be proven,
  state exactly what was reproduced and what remains unproven.
- Determine whether the behavior is a regression, a pre-existing limitation, newly exposed data, or
  an incomplete earlier fix. Identify a known-good version or commit when one exists, compare the
  same scenario and measurements on both sides, inspect the introducing history, and bisect when
  necessary. Never call something a regression—or say it has always existed—without that evidence.
- Use historical comparison only after source, history, telemetry, or the reproduction identifies a
  plausible causal boundary. Test the smallest relevant before/after pair first; do not benchmark a
  sweep of old releases merely because they are available. Expand to a bisect or broader matrix only
  when the narrower experiment cannot distinguish the credible causes and the answer matters to the
  fix or product decision.
- Keep reported problems separate and make each investigation large enough to produce a useful
  result without turning it into a catch-all program. Start with the user-visible issue as stated,
  prove its mechanism, and close or explicitly defer it before absorbing adjacent observations.
  Do not spend substantial effort on unreported, low-impact, or low-information possibilities unless
  evidence shows they block the reported issue, create material risk, or are unusually cheap to rule
  out.
- Reconstruct the complete causal interaction, not only the terminal error: the user's request,
  available context, loaded instructions/help, tool calls and their purpose, returned data, timing,
  retries, mutations, and the claim the actor made. Explain why each apparently unnecessary action
  occurred and whether it was required, induced by guidance, compensating for a missing capability,
  or simply an actor mistake.
- Before selecting a product or architecture direction, present the complete decision surface:
  current behavior and constraints; goals and non-goals; representative and deliberately diverse
  user stories and examples; data/operation/state shapes; empty, loading, partial, error, recovery,
  permission, concurrency, scale, and lifecycle cases; alternatives with tradeoffs; migration and
  compatibility consequences; observability; and acceptance evidence. Use generic examples when a
  single domain example would bias the design.
- Make user stories operational rather than decorative. For each representative story, state the
  actor and permissions, starting state and scale, trigger, ordered interaction, expected visible
  and persisted results, relevant timing expectation, failure/recovery behavior, and how acceptance
  will be observed. Show concrete request/response, data, state-machine, UI, or lifecycle shapes when
  they materially affect the decision, plus examples and counterexamples that prevent overfitting.
- Explain every proposed abstraction in plain product language before asking for a decision. Show
  what changes for users and agents, what remains unchanged, benefits, costs, risks, reversibility,
  migration implications, and viable alternatives. Do not ask for approval of an implementation
  term such as isolation, caching, previewing, source-only reads, or incremental rendering without
  first showing its observable behavior and tradeoffs.
- Research primary sources when behavior depends on an unfamiliar or delicate browser, Electron,
  platform, protocol, storage, rendering, accessibility, security, or third-party-library contract.
  Separate documented facts, directly observed facts, controlled experimental results, and open
  questions. Never report “this points to” as a conclusion.
- When the evidence makes a Penkra host or public-SDK defect plausible, investigate that boundary
  too: inspect the host contract, implementation, logs, history, and a cross-boundary reproduction
  before classifying the failure. Do not hide a confirmed host defect behind an App workaround.
  Keep App changes in this repository and move any confirmed host/SDK fix and planning to the Penkra
  repository that owns it.
- Ask focused questions before implementing whenever the remaining choice is a product decision or
  would materially change user-visible behavior, data, compatibility, or scope. Do not ask the user
  to resolve questions that logs, source, history, experiments, or primary-source research can
  answer.
- Discuss product and architecture choices directly in the conversation. Do not reduce them to a
  constrained choice form or polling UI. Show the evidence, shapes, user stories, examples,
  alternatives, edge cases, and recommendation in prose so the user can challenge assumptions and
  introduce a direction that was not pre-listed.
- After a fix, rerun the original failing reproduction, the control, adjacent regressions, and the
  relevant live App-in-Penkra host flows. Summarize the full evidence, including failures and residual
  uncertainty; do not collapse the handoff to a test count or claim broader coverage than was run.
- Build the regression matrix from both the changed mechanism and its historical neighboring flows.
  Include previously working small/common cases, affected large or unusual cases, fresh and restored
  lifecycles, failure and recovery, and source-versus-installed guidance where relevant. Verify that
  performance work preserves visual and data fidelity; faster completion alone is not success.

## Tests

- Never add tests whose purpose is to freeze or police prose, instructions, documentation, help
  wording, labels, headings, messages, or other authored copy.
- Test behavior, structured data, schemas, stable machine identifiers, error codes, and rendered
  outcomes. Text may be fixture data when the behavior under test operates on text, but assertions
  must not make exact wording a product contract.

## Penkra Thread and Live-QA Boundary

- A Penkra Thread may be used to drive work on any App, but messages sent to it must read like normal user requests about the desired product behavior.
- For agent-driven App QA, give the Thread the user-visible problem or outcome and let its agent discover the code-level work. The supervising developer separately loads the App under development into the relevant running Penkra host, observes the live App UI, and checks the result. Use Penkra Dev only when the behavior under test depends on Dev-specific host work, an isolated Dev profile, or another concrete Dev-only condition; ordinary App-only changes may be sideloaded and verified in the current Penkra Space.
- A Thread agent's claim, source diff, build, or automated test is not live QA. The supervising developer must verify the affected behavior in the running App before treating it as fixed.

## Design source of truth

- Each App's TODO names its current authoritative design artifact. The artifact is authoritative for
  that App's UI/UX content, states, language, hierarchy, and visual composition.
- Canvas uses the Canvas document named `Canvas - App` as its authoritative product design.
- Do not invent code UI that is absent from the named design artifact.
- A design artifact does not impose another product's data model or compatibility behavior, and it
  does not override runtime, security, storage, package, or permission boundaries.
- Shared repository tooling must not force Apps to share a visual design system.

## Repository scope

- `apps` is the required registry-published discovery and installation App.
- `explorer` is an active first-party App built on the public scoped-file service.
- `browser` is an active first-party App built on the public scoped-browser-session service.
- `canvas` is an active first-party App built on the public account-data and App operation services.
- Themes are core Penkra Settings presets, not an App; do not recreate a `themes` package.
- Penkra-owned immutable App IDs use the reverse `penkra.com` namespace (`com.penkra.*`).
- The registry service, SDK implementation, Penkra host, and third-party Apps are out
  of scope for this repository.

## Version authority

- Every App is versioned independently through its own `penkra-app.json` manifest and is published independently through the App Registry.
- Never infer, bump, tag, publish, or coordinate an App version from a Penkra desktop version or release. A Penkra desktop tag does not release any App in this repository.
- Never infer or bump the Penkra desktop version from an App change. The App manifest's `compatibility.penkra` range is the only version relationship between an App package and the desktop product.
- Approval of a desktop release is not approval to change or publish an App version, and approval of one App release is not approval for another App.
