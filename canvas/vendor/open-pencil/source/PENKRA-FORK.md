# Penkra OpenPencil fork

This source snapshot is pinned to OpenPencil commit
`4a5e7d557064d941fbac88bd492586db5257ff5f`. `../PROVENANCE.json` is the
authoritative upstream identity and behavioral patch ledger.

The previously shipped `../engine.mjs` was patched after bundling. Those edits
do not constitute a source patch series and cannot honestly be described as
one. The fork gate therefore preserves the shipped artifact as the behavioral
oracle while each ledger item is moved to source and covered by a focused
behavior test. A source-built engine may replace the oracle only when the
corpus comparison is byte-identical.

Do not add capabilities merely to satisfy a ledger description. Each source
change must cite the behavior test that distinguishes the patched engine from
the pinned upstream build.
