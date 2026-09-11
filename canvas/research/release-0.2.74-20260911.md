# Canvas 0.2.74 release verification

Date: 2026-09-11

- Consolidated implementation commit: `69963f0`
- Version and connected-stroke fix commit: `18f7b56`
- Public registry submission: `123a5b63-8d57-4672-b2ef-84f5b3c9bc89`
- Registry version ID: `a19f3c60-9d38-4635-9601-d7dd3de99649`
- Registry manifest digest: `a92383c3132fe5e27f926d12ce640dfe017b0149ee42795fa125cfdec8497e3b`
- Registry package digest: `e3083e277196be0dd76fc45cb2045e48af76afd58d765aaac9712e7888cab22f`
- Registry status: `published`
- Exact installed version after publication: `0.2.74`

This public release consolidates the completed Canvas authoring and runtime fixes: exact icon
catalog discovery, exporter-native icon geometry, explicit Phosphor variants, connected vector
stroke joins, same-ID generated-image cache invalidation, stable fixed-overlay context menus,
module-aware document listing with migration-safe fallback, native component slots, durable script
mutation indexing, and operation results that survive snapshot compaction.

Verification:

- full `npm test`: 2,153 passed, 0 failed, 0 cancelled, 0 skipped;
- the generated SwiftUI fixture passed both `swift test --jobs 2` and `swift build --jobs 2`;
- the generated Compose fixture passed `./gradlew --no-daemon --max-workers 2 :app:assembleDebug`;
- production `bun run build` exited 0;
- the exact 0.2.74 distribution passed isolated Penkra App validation with root help, all 15
  operation-help entries, a ready renderer tab, and successful temporary-profile removal;
- live `canvas icons search --query loader --library lucide --limit 5` returned the exact bundled
  identifiers `loader`, `loader-circle`, `loader-pinwheel`, and `loader2`;
- registry archive, compatibility, digest, identity, manifest, permission, policy, and version
  validators all passed before publication;
- the registry reports the 0.2.74 submission as `published`, and `apps list` reports the current
  Space's Canvas installation at 0.2.74.
