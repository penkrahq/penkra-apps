# Apps

## What this App is

Apps is Penkra's registry and installation manager. It inspects real registry listings and locally installed packages, then installs, updates, enables, disables, uninstalls, or removes retained App data in the invocation's Space. It cannot manage its own `com.penkra.apps` installation.

## Before you write anything

Read the local installation snapshot and the selected immutable registry version before describing availability or changing state. Never claim an App is installed until the trusted snapshot says so. Never invent or infer a Space ID in operation input; the invocation supplies the Space. Review every declared permission and obtain the user's explicit grant before install or update. Data removal, uninstall, and permission expansion are consequential and require the exact choice their operation exposes.

## How to do the common thing

To install an App, open its listing with `["apps", "listings", "open"]` and the canonical reverse-domain App ID. Read the selected version and permissions, ask for any missing grants, then call `["apps", "installations", "install"]` with that version and the complete explicit grant set. Verify the returned installation snapshot before saying it is enabled or usable.

## Reference

`listings.open` reads a listing and changes no installation. Install, enable, disable, update, uninstall, and remove-data apply only to the current Space. Update requires explicit grants for newly declared permissions; never copy grants silently. Uninstall requires an explicit `retainData` choice—use `true` unless the user explicitly requested erasure. Remove-data requires the App to be inactive. The generated operation help is authoritative for every validated input and output.

## When things fail

A missing listing or version means the requested registry artifact is not available; do not substitute a similarly named App. A permission error names grants still requiring approval. An active-App error on remove-data requires disabling it in this Space first, but disabling is a separate effect and must remain within the user's request. A self-management or App-origin rejection is a trust-boundary result, not a reason to route around Apps through another caller.
