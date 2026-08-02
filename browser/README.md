# Browser

Penkra's named first-party Browser App stub. It is not currently implemented or bundled.

Reserved canonical App ID: `com.penkra.browser`.

Browser owns its complete web surface, including whether each page renders the
standard App Bar. Penkra owns only the trusted panel-tab chrome around it.

Browser is an ordinary App. Navigation, downloads, file handoff, networking, and
external opening use public web or Penkra permission contracts rather than a private
first-party Browser API.
