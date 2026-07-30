# Penkra Apps

## Product boundaries

- Work only on Penkra-authored Apps in this repository.
- Every App uses the public Penkra App runtime and SDK. Do not add private host APIs.
- Penkra owns the panel tab strip and standard App Bar implementation.
- Apps declaratively configure the standard App Bar and own their web content viewport.
- The exact SDK contract is deferred until its design states are settled.

## Design source of truth

- Each App has one authoritative `.pen` file in its own `design/` directory.
- The App's Pencil file is authoritative for that App's content, states, and language.
- Do not invent code UI that is absent from the corresponding Pencil design.
- Shared repository tooling must not force Apps to share a visual design system.

## Repository scope

- `apps/catalog` is the user-facing **Apps** App.
- The registry service, SDK implementation, Penkra host, and third-party Apps are out
  of scope for this repository.
