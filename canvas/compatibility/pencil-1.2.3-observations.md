# Pencil 1.2.3 open/save differential

Observed through the real `/Applications/Pen.app` UI on 2026-08-06. Both
experiments used disposable copies outside the repository. The already-open
user document was not saved or modified, and the two disposable windows were
closed afterward.

## Forward-unknown node

Input: `fixtures/unknown-content-2.15.pen`

- Input SHA-256: `6053bb8b7477c55c2da918130bcedce5d7be9585bc1cddd3b93d6399f027151d`
- Saved SHA-256: `6ccf35c5e21587cb2fa03fc593fa974af2841df43536c7539d929e56525001c0`
- Pen rendered a blank canvas.
- Saving replaced the document with `children: []`, added a `fileToken`, and
  dropped the unknown root field, the supported parent frame, the unknown child
  node, and every property under them.

## Supported nodes with unknown properties

Input: `fixtures/unknown-properties-2.15.pen`

- Input SHA-256: `5df8501946b4587f1fc663866b9faaf26f068f61847d8350919652301d180689`
- Saved SHA-256: `c39c0dcc6831a4ea4e61af657381a8bb1b21a0b563251a4f9c305b36af57abf5`
- Pen rendered the supported frame and rectangle.
- Saving retained both stable IDs but removed the unknown document field and
  both unknown node properties. It also normalized supported content, including
  removing the rectangle's input `x` and `y`, and added a `fileToken`.

## Product implication

Pencil's current save output is useful as a renderer/import behavioral
differential, but it is not a semantic-losslessness oracle. Canvas must retain
the original opaque document and merge supported edits into it. Unsupported
content must be surfaced as preserved-but-not-editable instead of being routed
through Pencil's serializer and silently discarded.
