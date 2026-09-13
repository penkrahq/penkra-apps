import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateCanvasDocument } from "./canvas-schema.mjs";
import { createDocumentModel, encodeState, materialize, restoreDocumentModel } from "./document-model.mjs";
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

export function migrateCanvasDocument(source) {
  const steps = [
    ["M1", (value) => migrateM1DelimitedVariables(value)],
    ["M2", (value) => migrateM2AssignModule(value)],
    ["M5", migrateM5DeleteEditorSlots],
    ["M6", migrateM6UniformText],
    ["M10", (value) => migrateM10Scripts(value)],
    ["M11", (value) => migrateM11Notes(value)],
    ["M12", migrateM12Contexts],
    ["M13", migrateM13Prompts],
    ["M7", (value) => migrateM7AssignRoles(value)],
    ["M4", (value) => migrateM4Descendants(value)],
    ["M3", migrateM3DropReusable],
    ["M14", migrateM14ThemesToAxes],
    ["M15", migrateM15NodeModes],
    ["M16", migrateM16VariableTokens],
    ["M17", migrateM17CascadeConditions],
    ["M18", migrateM18LogicalDirections],
    ["M8", migrateM8AddFlows],
  ];
  let document = structuredClone(source);
  const changes = {};
  const notes = [];
  for (const [name, migrate] of steps) {
    const result = migrate(document);
    document = result.document;
    changes[name] = result.changes;
    notes.push(...(result.notes ?? []));
  }
  if (Object.hasOwn(document, "version")) {
    delete document.version;
    notes.push("Dropped the obsolete OpenPencil format marker; Canvas has no Pencil file-compatibility contract.");
  }
  if (!document.axes || typeof document.axes !== "object" || Array.isArray(document.axes)) document.axes = {};
  if (document.axes.theme && !document.axes.appearance
    && document.axes.theme.modes?.every((mode) => ["light", "dark"].includes(mode.name))) {
    document.axes.appearance = document.axes.theme;
    delete document.axes.theme;
    renameAppearanceConditions(document);
    notes.push("Renamed the legacy light/dark theme axis to appearance, including mode selections and cascade conditions.");
  }
  if (!document.variables || typeof document.variables !== "object" || Array.isArray(document.variables)) document.variables = {};
  if (!document.paragraphStyles || typeof document.paragraphStyles !== "object" || Array.isArray(document.paragraphStyles)) document.paragraphStyles = {};
  if (document.imports === undefined) document.imports = {};
  if (!Array.isArray(document.flows)) document.flows = [];
  if (!Array.isArray(document.children)) document.children = [];
  let renamedExports = 0;
  const renameExports = (nodes) => {
    for (const node of nodes) {
      if (node.export === "live") { node.export = "default"; renamedExports += 1; }
      if (Array.isArray(node.children)) renameExports(node.children);
    }
  };
  renameExports(document.children);
  if (renamedExports) notes.push(`Renamed ${renamedExports} node export override(s) from live to default without changing rendering intent.`);
  if (document.module === "print") {
    document.module = "generic";
    const removePageRoles = (nodes) => {
      for (const node of nodes) {
        if (node.role === "page") delete node.role;
        if (Array.isArray(node.children)) removePageRoles(node.children);
      }
    };
    removePageRoles(document.children);
    notes.push("Converted the withdrawn print module to generic and removed page roles; physical size, artwork, bleed and advisory guides are preserved.");
  }
  try {
    validateCanvasDocument(document);
  } catch (error) {
    throw migrationError(`Migration cannot preserve this document as valid Canvas content: ${error.message}`);
  }
  return { document, changes, notes };
}

function renameAppearanceConditions(value) {
  if (!value || typeof value !== "object") return;
  for (const key of ["modes", "when"]) {
    const record = value[key];
    if (record && !Array.isArray(record) && typeof record === "object" && !record.op && Object.hasOwn(record, "theme")) {
      record.appearance = record.theme;
      delete record.theme;
    }
  }
  for (const child of Object.values(value)) renameAppearanceConditions(child);
}

export async function createCanvasMigrationCopy(api, documentId, payload, { reportDirectory } = {}) {
  if (!payload.snapshot?.source || typeof payload.snapshot.source !== "object") throw migrationError("Canvas migration needs a source projection.");
  if (typeof reportDirectory !== "string" || !reportDirectory) throw migrationError("Canvas migration needs a report directory for its Markdown record.");
  const legacyModel = restoreDocumentModel(payload);
  const source = materialize(legacyModel);
  legacyModel.doc.destroy();
  const migrated = migrateCanvasDocument(source);
  const model = createDocumentModel(migrated.document);
  let copy = null;
  let reportPath = null;
  try {
    const title = String(payload.title ?? "Untitled");
    copy = await api.createDocument({ title, source: migrated.document, initialUpdate: encodeState(model) });
    for (const asset of await api.listAssets(documentId)) {
      await api.uploadAsset(copy.id, { ...asset, bytes: await api.readAsset(documentId, asset) });
    }
    const verified = await api.getDocumentProjection(copy.id);
    if (!verified?.snapshot?.source || !sameProjection(verified.snapshot.source, migrated.document)) {
      throw migrationError(`Migrated copy ${copy.id} did not round-trip its canonical projection.`);
    }
    reportPath = join(resolve(reportDirectory), `migration-${documentId}-to-${copy.id}.md`);
    await mkdir(resolve(reportDirectory), { recursive: true });
    await writeFile(reportPath, migrationMarkdown(title, documentId, copy.id, migrated), { encoding: "utf8", flag: "wx" });
    const supersededTitle = `${title} — superseded by ${copy.id}`;
    if (new TextEncoder().encode(supersededTitle).length > 255) throw migrationError("The superseded-document title exceeds 255 UTF-8 bytes.");
    await api.renameDocument(documentId, supersededTitle);
    return { documentId: copy.id, reportPath };
  } catch (error) {
    if (copy?.id) await api.deleteDocument(copy.id).catch(() => undefined);
    if (reportPath) await unlink(reportPath).catch(() => undefined);
    throw error;
  } finally {
    model.doc.destroy();
  }
}

function migrationMarkdown(title, sourceId, copyId, migrated) {
  const notes = migrated.notes.length ? migrated.notes.map((note) => `- ${note}`).join("\n") : "- No content was dropped, approximated or inferred.";
  return `# Canvas migration: ${title}\n\nSource document: \`${sourceId}\`\n\nMigrated copy: \`${copyId}\`\n\nThe source content was left untouched and renamed only after the copy round-tripped successfully.\n\n## Dropped, approximated and inferred\n\n${notes}\n`;
}

function sameProjection(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameProjection(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameProjection(left[key], right[key]));
}

function migrationError(message) {
  const error = new Error(message);
  error.code = "CANVAS_MIGRATION_INVALID";
  return error;
}
