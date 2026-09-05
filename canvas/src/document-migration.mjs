import { validateCanvasDocument } from "./canvas-schema.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";
import {
  migrateM1DelimitedVariables,
  migrateM2AssignModule,
  migrateM3DropReusable,
  migrateM4Descendants,
  migrateM5DeleteEditorSlots,
  migrateM6UniformText,
  migrateM7AssignRoles,
  migrateM8AddFlows,
  migrateM10Scripts,
  migrateM11Notes,
  migrateM12Contexts,
  migrateM13Prompts,
  migrateM14ThemesToAxes,
  migrateM15NodeModes,
  migrateM16VariableTokens,
  migrateM17CascadeConditions,
  migrateM18LogicalDirections,
} from "./migrations.mjs";

export function migrateCanvasDocument(source, manifest = {}, targetVersion = 3) {
  const steps = [
    ["M1", (value) => migrateM1DelimitedVariables(value)],
    ["M2", (value) => migrateM2AssignModule(value, manifest.m2)],
    ["M5", migrateM5DeleteEditorSlots],
    ["M6", migrateM6UniformText],
    ["M10", (value) => migrateM10Scripts(value, manifest.m10 ?? { entries: {} })],
    ["M11", (value) => migrateM11Notes(value, manifest.m11 ?? { entries: {} })],
    ["M12", migrateM12Contexts],
    ["M13", migrateM13Prompts],
    ["M4", (value) => migrateM4Descendants(value, manifest.m4 ?? { entries: {} })],
    ["M3", migrateM3DropReusable],
    ["M14", migrateM14ThemesToAxes],
    ["M15", migrateM15NodeModes],
    ["M16", migrateM16VariableTokens],
    ["M17", migrateM17CascadeConditions],
    ["M18", migrateM18LogicalDirections],
    ["M7", (value) => migrateM7AssignRoles(value, manifest.m7)],
    ["M8", migrateM8AddFlows],
  ];
  let document = structuredClone(source);
  const changes = {};
  for (const [name, migrate] of steps) {
    const result = migrate(document);
    document = result.document;
    changes[name] = result.changes;
  }
  if (document.imports === undefined) document.imports = {};
  document.canvasSchemaVersion = targetVersion;
  validateCanvasDocument(document);
  return { document, changes };
}

export async function commitCanvasMigration(api, documentId, payload, manifest = {}, targetVersion = 3) {
  const source = payload.snapshot?.source;
  if (!source || typeof source !== "object") throw migrationError("Canvas migration needs a source projection.");
  const fromVersion = Number(source.canvasSchemaVersion ?? 0);
  if (!Number.isInteger(fromVersion) || fromVersion < 0 || targetVersion <= fromVersion) {
    throw migrationError(`Invalid schema transition ${fromVersion} → ${targetVersion}.`);
  }
  const expectedSequence = Math.max(
    Number(payload.snapshot?.throughSequence ?? 0),
    ...(payload.updates ?? []).map((update) => Number(update.sequence ?? 0)),
  );
  const migrated = migrateCanvasDocument(source, manifest, targetVersion);
  const model = createDocumentModel(migrated.document);
  let began = false;
  try {
    await api.beginSchemaMigration(documentId, { fromVersion, targetVersion, expectedSequence });
    began = true;
    const result = await api.completeSchemaMigration(documentId, {
      fromVersion,
      targetVersion,
      expectedSequence,
      state: encodeState(model),
      projection: migrated.document,
    });
    return { ...result, changes: migrated.changes };
  } catch (error) {
    if (began) await api.abortSchemaMigration(documentId).catch(() => undefined);
    throw error;
  } finally {
    model.doc.destroy();
  }
}

function migrationError(message) {
  const error = new Error(message);
  error.code = "CANVAS_MIGRATION_INVALID";
  return error;
}
