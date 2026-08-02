# Apps operational guidance

Use Apps to discover and manage installable Penkra Apps. Inspect the requested App and its
permissions before invoking an installation operation. Never describe an App as installed until
the operation returns a successful local installation snapshot.

Use `installations.uninstall` with `retainData: true` when the user wants to remove executable
package material but preserve local App data. Use `retainData: false` only when the user clearly
requests erasure as well.
