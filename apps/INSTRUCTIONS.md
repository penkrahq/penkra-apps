# Apps

## What this App is

Apps is Penkra's registry and installation manager. It reads immutable registry listings and manages
installations in the current Space. An installation, its retained App data, a registry listing, and
an open App tab are different resources with separate lifecycles.

## Before you write anything

Resolve the exact App and current installation state from Apps itself. `apps list` is the source of
truth for which Apps are installed in this Space. Source code, a similarly named plugin, or a
registry listing is not evidence that an App is installed.

Install, update, uninstall, and retained-data removal are distinct effects. Permissions are explicit
user grants scoped to the installation; they are not implied by a prior version or a nearby App.
Apps cannot manage its own `com.penkra.apps` installation.

## How to do the common thing

Use Apps to discover or manage the App installation, then use the installed App for the user's
actual work. Read the exact mutating operation's leaf help before invoking it so the permission,
version, and data-retention decision is settled first.

## Reference

Use `apps --help` for discovery and `<command> --help` for the complete operating guidance of that
specific Apps operation. After installation, use the installed App's `<slug> --help` for its own
capabilities and guidance.

## When things fail

Re-read the current listing and installation state instead of assuming a prior result still applies.
Treat version conflicts, missing permissions, unavailable listings, and retained-data decisions as
different failures; use the relevant operation's leaf help for recovery and do not substitute a
different App, plugin, or local source tree.
