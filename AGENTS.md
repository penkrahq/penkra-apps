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

## Tests

- Never add tests whose purpose is to freeze or police prose, instructions, documentation, help
  wording, labels, headings, messages, or other authored copy.
- Test behavior, structured data, schemas, stable machine identifiers, error codes, and rendered
  outcomes. Text may be fixture data when the behavior under test operates on text, but assertions
  must not make exact wording a product contract.

## Penkra Dev Thread Boundary

- A Penkra (Dev) Thread may be used to drive work on any App, but messages sent to it must read like normal user requests about the desired product behavior.
- Do not pass platform or harness administration through the Thread. Environment variables, sideload registration, Penkra process management, repository setup, release mechanics, and QA harness preparation are responsibilities of the supervising developer in the owning repository.
- For agent-driven App QA, give the Thread the user-visible problem or outcome and let its agent discover the code-level work. The supervising developer separately starts the clean host, loads the App under development, observes the live App UI, and checks the result.
- A Thread agent's claim, source diff, build, or automated test is not live QA. The supervising developer must verify the affected behavior in the running App before treating it as fixed.

## Design source of truth

- Each App has one authoritative `.pen` file in its own `design/` directory.
- The App's Pencil file is authoritative for that App's UI/UX content, states,
  language, hierarchy, and visual composition.
- Do not invent code UI that is absent from the corresponding Pencil design.
- Pencil does not override runtime, security, storage, package, or permission boundaries.
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
