# Removing retained App data

This operation permanently erases one uninstalled App's retained data from the current Space. Use it
only when the user explicitly authorized that erasure and the exact App identity is established.

The App must already be uninstalled. An installed-App error does not authorize uninstalling it;
uninstall is a separate effect with its own retention choice. A self-management or App-origin
rejection is a trust boundary, not a reason to route the deletion through another caller.
