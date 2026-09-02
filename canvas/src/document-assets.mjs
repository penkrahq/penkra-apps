export async function hydrateDocumentAssets(api, documentId, descriptors = [], current = new Map()) {
  const assets = new Map(current);
  let changed = false;
  await Promise.all(descriptors.map(async (descriptor) => {
    const existing = assets.get(descriptor.path);
    if (
      existing?.bytes
      && existing.sha256 === descriptor.sha256
      && Number(existing.size ?? existing.bytes.byteLength) === Number(descriptor.size)
    ) return;
    const bytes = await api.readAsset(documentId, descriptor);
    assets.set(descriptor.path, { ...descriptor, bytes });
    changed = true;
  }));
  return { assets, changed };
}

export function hasUnloadedDocumentImages(document, assets) {
  let missing = false;
  visit(document, (value) => {
    if (
      value?.type === "image"
      && typeof value.url === "string"
      && !assets.has(value.url)
    ) missing = true;
  });
  return missing;
}

function visit(value, visitor) {
  if (missingValue(value)) return;
  visitor(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    visit(child, visitor);
  }
}

function missingValue(value) {
  return value === null || typeof value !== "object";
}
