## Native component slots

- [x] Define canonical slot declarations and validation on component properties.
- [x] Resolve default and instance-supplied slot children through the existing binding system.
- [x] Preserve stable instance identities and relationship remapping for supplied subtrees.
- [x] Add editor authoring, insertion, selection, and slot-limit feedback without export chrome.
- [x] Cover local/imported components, libraries, runtime resolution, screenshots, and exporters.

## Penkra design migration

- [ ] Translate source-design slots without retaining Pencil editor chrome or foreign metadata.
- [ ] Preserve source IDs where globally unique and use one deterministic collision rule where expansion creates duplicates.
- [ ] Resume and complete the screens in exact source order and geometry.
- [ ] Compare every migrated screen visually against the designated `.pen` source.
