# Browser

Penkra's active first-party web browsing App. Its implementation uses the ordinary isolated App
runtime and public scoped-browser-session service.

Reserved canonical App ID: `com.penkra.browser`.

Browser owns its complete page-tab strip and App Bar. Penkra owns only the
trusted panel-tab chrome and the isolated native page renderer below Browser's bar.

Browser is an ordinary App. Navigation, downloads, file handoff, networking, and
external opening use public web or Penkra permission contracts rather than a private
first-party Browser API. The public `penkra.browser` service is permission-bound,
framework-neutral, and available to any reviewed App that declares `browser-session`.

Run the package checks with:

```sh
node --test browser-model.test.mjs operations.test.mjs
node --check app.js
node --check operations.js
```
