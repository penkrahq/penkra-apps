# Apps

The bundled Penkra App for discovering, inspecting, installing, and restoring Apps.

The package slug and user-facing name are **Apps**.

Canonical App ID: `app.penkra.apps`.

Apps owns its complete web surface. It may render or omit the standard App Bar on
each page through the public UI contract. Penkra owns only the trusted panel-tab
chrome around the App.

Apps uses the ordinary public runtime for rendering and isolation. Its only private
surface is a narrow binding to the trusted installation service; it does not receive
general filesystem, process, registry-key, or host-control authority.
