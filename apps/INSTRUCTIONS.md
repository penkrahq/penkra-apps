# Apps

Apps is Penkra's registry and installation manager. It reads immutable registry listings and manages
installations in the current Space. An installation, its retained App data, a registry listing, and
an open App tab are different resources with separate lifecycles.

`apps list` is the source of truth for which Apps are installed in this Space. Its results describe
App identity and discovery information; use the installed App's `<slug> --help` for that App's
operations and operating guidance. Source code, a similarly named plugin, or a registry listing is
not evidence that an App is installed.

Install, update, uninstall, and retained-data removal are distinct effects. Permissions are explicit
user grants, scoped to the installation, and are not implied by a prior version or nearby App.
Apps cannot manage its own `com.penkra.apps` installation.

Each mutating operation's leaf help explains the exact permission and data-retention decision that
must be settled before calling it.
