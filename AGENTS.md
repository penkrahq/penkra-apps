# Penkra Apps

## Product boundaries

- Work only on Penkra-authored Apps in this repository.
- Every App uses the public Penkra App runtime and SDK. Do not add private host APIs.
- Penkra owns the trusted panel tab strip. Each App owns its complete web surface,
  including whether it renders the standard App Bar on any given page.
- Use the public App Bar specification, semantic tokens, and optional framework
  adapters. Do not depend on the host rendering or configuring an App Bar for an App.
- `TODO.md` at the client workspace root is authoritative for the active SDK and
  platform contract. Do not create a second repository-local product plan.

## Design source of truth

- Each App has one authoritative `.pen` file in its own `design/` directory.
- The App's Pencil file is authoritative for that App's UI/UX content, states,
  language, hierarchy, and visual composition.
- Do not invent code UI that is absent from the corresponding Pencil design.
- Pencil does not override runtime, security, storage, package, or permission boundaries.
- Shared repository tooling must not force Apps to share a visual design system.

## Repository scope

- `apps` is the active bundled discovery and installation App.
- `browser` is the named, non-bundled Browser App stub for deferred implementation.
- `explorer` is the named, non-bundled Explorer App stub for deferred implementation.
- Themes are core Penkra Settings presets, not an App; do not recreate a `themes` package.
- Penkra-owned immutable App IDs use the reverse `penkra.com` namespace (`com.penkra.*`).
- The registry service, SDK implementation, Penkra host, and third-party Apps are out
  of scope for this repository.
