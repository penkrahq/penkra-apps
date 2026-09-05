import penkraM4 from "../compatibility/migration-manifests/092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9.m4.json" with { type: "json" };
import design297M4 from "../compatibility/migration-manifests/09c0a937-3e64-478c-a7ff-4daa836bc169.m4.json" with { type: "json" };
import design0aM4 from "../compatibility/migration-manifests/7928b2a5-7106-4008-a7a8-e477aeed4ca7.m4.json" with { type: "json" };
import design0bM4 from "../compatibility/migration-manifests/e620f165-b7b9-4404-8b79-e8ce7654b96c.m4.json" with { type: "json" };

const M4_MANIFESTS = new Map([
  penkraM4,
  design297M4,
  design0aM4,
  design0bM4,
].map((manifest) => [manifest.documentId, manifest]));

export function migrationManifestFor(documentId, sourceSequence) {
  const m4 = M4_MANIFESTS.get(documentId);
  if (m4 && m4.sourceSequence !== sourceSequence) {
    const error = new Error(`M4 manifest for ${documentId} was reviewed at sequence ${m4.sourceSequence}, not ${sourceSequence}. Re-census the document before migration.`);
    error.code = "CANVAS_MIGRATION_MANIFEST_STALE";
    throw error;
  }
  return {
    m4: m4 ?? { entries: {} },
    m10: { entries: {} },
    m11: { entries: {} },
  };
}

export function registeredMigrationDocuments() {
  return [...M4_MANIFESTS.values()].map(({ documentId, documentTitle, sourceSequence }) => ({
    documentId,
    documentTitle,
    sourceSequence,
  }));
}
