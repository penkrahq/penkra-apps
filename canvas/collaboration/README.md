# Yjs model validation

This is an isolated research harness, not Canvas runtime code. It tests whether
Yjs can carry the smallest normalized edit model that still preserves `.pen`
identifiers, unsupported properties, and deterministic hierarchy materializing.

The model stores each node once in an ID-keyed map. Parent and sortable position
are node properties, so concurrent moves cannot leave the same node in two
parent child arrays. A deleted node is a tombstone. Unknown properties remain
independent values and are returned during `.pen` materialization.

Every collaborator must bootstrap from the same canonical Yjs document update.
Two peers independently importing the same `.pen` text create unrelated CRDT
histories and are not valid replicas merely because their visible JSON matches.
The backend/realtime design must distribute one canonical initial update and
state vector for a Canvas document.

Deleting a node hides its current descendants. A descendant moved concurrently
to a live parent survives, which prevents an unrelated parent deletion from
discarding that independently rescued work. Structural fields (`id`, `type`,
and `children`) are changed only by declared structural operations, never by the
generic property setter.

Supported nested object fields use a path operation so independent inspector
edits such as `fill.color` and `fill.opacity` merge separately. Replacing a
whole property is still atomic. Arrays and unsupported opaque values also remain
atomic until their element identity and editing behavior are explicitly defined.

Run from this directory:

```sh
bun install --frozen-lockfile
bun run test
```

This validates local CRDT behavior only. It does not choose a realtime provider,
storage layout, authorization model, snapshot cadence, or backend API.

Production work still must define tombstone garbage collection, durable offline
storage and restart recovery, update-log snapshot/compaction, hostile depth and
size limits, generated collision-resistant IDs, long-running ordering ranks, and
the exact policy for simultaneous restore/delete. Those are intentionally not
claimed by this feasibility harness.
