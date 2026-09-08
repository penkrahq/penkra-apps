# Canvas 0.2.70 release verification

Date: 2026-09-08

- Implementation/version commit: `ef1ad04`
- Private registry submission: `4e9564ae-b95e-4a34-8f0c-7551445bcbf3`
- Registry package digest: `b982f9972cb8e4937e949803b38ca68fcee13963440ff94ed331ca51b326273f`
- Registry status: `published`
- Exact registry version installed after publication: `0.2.70`

This release prevents stored legacy text-direction aliases and unrelated stored enum values from
blocking otherwise valid component descendant overrides. It also makes a missing icon library a
typed, actionable render issue and repeats the authored-source instance-selection boundary in the
`Get` operation guidance.

Verification:

- full `npm test` passed: 2,082 passed, 0 failed, 0 cancelled, 0 skipped; Swift and Compose
  compilation stages also passed;
- the focused normalization, descendant, resolver, render preparation, and operation suite passed:
  63 passed, 0 failed, 0 cancelled, 0 skipped;
- development and production builds passed;
- the exact 0.2.70 distribution passed the isolated App integration test, including operation help,
  a ready renderer tab, and successful temporary-profile removal;
- registry archive, compatibility, digest, identity, manifest, permission, policy, and version
  validation all passed before publication;
- a disposable installed-App QA document proved that a component authored with `textAlign: "left"`
  and `textAlignVertical: "middle"` accepts a content-only descendant override, persists canonical
  `start`/`center`, returns no issues, and reads canonically in a subsequent execution;
- that disposable QA document was moved to Canvas Trash and is recoverable;
- the supplied reproduction document `9bf51d3d-8e14-470f-ad5a-559759d0be65` was inspected
  read-only at sequence 2,184 and was not mutated.

The enum audit also proved that descendant validation previously revalidated the complete stored
source node. It now validates only each supplied override property, so an unrelated preserved field
cannot disable all instance overrides while invalid override values still fail before commit.
