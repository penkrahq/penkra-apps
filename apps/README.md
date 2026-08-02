# Apps

The bundled Penkra App for discovering, inspecting, installing, and restoring Apps.

The package slug and user-facing name are **Apps**.

Canonical App ID: `com.penkra.apps`. Stable command slug: `apps`.

Apps owns its complete web surface. It may render or omit the standard App Bar on
each page through the public UI contract. Penkra owns only the trusted panel-tab
chrome around the App.

Apps uses the ordinary public runtime for rendering and isolation. Its only private
surface is a narrow binding to the trusted installation service; it does not receive
general filesystem, process, registry-key, or host-control authority.

Its public installation-facing operations use App-local keys such as
`installations.install`, `installations.update`, and `installations.uninstall`.
The trusted host binding—not the Apps renderer or controller—verifies and mutates packages.
