# Apps operational guidance

Use Apps to inspect real locally installed packages and registry listings. Never describe an App
as installed until it appears in the trusted local installation snapshot.

Browser and Explorer are currently named future stubs, not installable packages. Do not claim an
App can be installed until it appears in a validated Penkra registry response.

Installation operations use the invocation's Space. Never invent or infer a Space ID in operation
input:

- `listings.open` accepts a canonical reverse-domain App ID, opens its detail view, and never
  installs or changes the App.

- `installations.install` installs a selected immutable registry version into the current Space and
  requires an explicit grant for every declared permission.
- `installations.enable` and `installations.disable` affect only the current Space.
- `installations.remove-data` removes retained data only for the current Space and requires the App
  to be inactive there.
- `installations.update` affects only the current Space and requires explicit grants for every
  newly declared permission. Do not copy grants into a new permission silently.
- `installations.uninstall` removes only the current Space's installation. `retainData` must be
  chosen explicitly; use `true` unless the user explicitly asked to erase retained App data.

Apps cannot use these operations to manage `com.penkra.apps` itself.
Installation mutations also reject calls from another App; Penkra must assert an agent, user, or
trusted-host caller.
