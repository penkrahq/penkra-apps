# Apps operational guidance

Use Apps to inspect real locally installed packages and registry listings. Never describe an App
as installed until it appears in the trusted local installation snapshot.

Browser and Explorer are currently named future stubs, not installable packages. Do not claim an
App can be installed until it appears in a validated Penkra registry response.

Installation operations use the invocation's Space. Never invent or infer a Space ID in operation
input:

- `installations.install` installs a selected immutable registry version into the current Space and
  requires an explicit grant for every declared permission.
- `installations.enable` and `installations.disable` affect only the current Space.
- `installations.remove-data` removes retained data only for the current Space and requires the App
  to be inactive there.
- `installations.update` affects the profile-level package used by every enabled Space, so its input
  must include explicit permission grants for every affected Space. Do not copy grants into a new
  permission silently.
- `installations.uninstall` removes the profile-level package. `retainData` must be chosen
  explicitly; use `true` unless the user explicitly asked to erase retained App data.

Apps cannot use these operations to manage `com.penkra.apps` itself.
