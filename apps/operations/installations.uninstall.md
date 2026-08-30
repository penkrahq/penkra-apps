# Uninstalling an App

Uninstall removes the App installation from the current Space. The required `retainData` value is
a real product decision: use `true` unless the user explicitly requested erasing the App's stored
data. Uninstalling with retained data allows a later reinstall to recover it.

Permanent retained-data removal is a separate operation and separate authority. Do not turn a
general uninstall request into data erasure.
