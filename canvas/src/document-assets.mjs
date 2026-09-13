export async function hydrateDocumentAssets(api, documentId, descriptors = [], current = new Map(), dependencies = {}) {
  const assets = current;
  const rasterizeSvg = dependencies.rasterizeSvg;
  let changed = false;
  await Promise.all(descriptors.map(async (descriptor) => {
    const existing = assets.get(descriptor.path);
    if (
      existing?.bytes
      && existing.sha256 === descriptor.sha256
      && Number(existing.size ?? existing.bytes.byteLength) === Number(descriptor.size)
    ) return;
    const bytes = await api.readAsset(documentId, descriptor);
    assets.set(descriptor.path, await prepareAssetForRendering({ ...descriptor, bytes }, rasterizeSvg));
    changed = true;
  }));
  return { assets, changed };
}

export function isSvgAsset(asset) {
  return asset?.mimeType === "image/svg+xml" || /\.svg$/iu.test(asset?.path ?? "");
}

export async function prepareAssetForRendering(asset, rasterizeSvg) {
  if (!rasterizeSvg || !isSvgAsset(asset)) return asset;
  return { ...asset, renderBytes: await rasterizeSvg(asset.bytes) };
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
