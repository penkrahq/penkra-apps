import { mkdir, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
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
  repairLegacyParagraphs(document, notes);
  canonicalizeLegacyAnnotatedDimensions(document, notes);
  canonicalizeLegacyTextAlignment(document, notes);
  wrapLegacyScalarVariableReferences(document, notes);
  canonicalizeEmptyLegacyPaths(document, notes);
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
  collapseUniformLegacyAxes(document, notes);
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
    const detail = String(error?.message ?? error);
    const limit = 1_600;
    const bounded = detail.length > limit
      ? `${detail.slice(0, limit)}\n… ${detail.length - limit} additional characters omitted.`
      : detail;
    throw migrationError(`Migration cannot preserve this document as valid Canvas content: ${bounded}`);
  }
  return { document, changes, notes };
}

function canonicalizeEmptyLegacyPaths(document, notes) {
  let changes = 0;
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      if (node?.type === "path" && typeof node.geometry === "string" && !node.geometry.trim()) {
        node.geometry = "M 0 0";
        changes += 1;
      }
      visit(node?.children);
    }
  };
  visit(document.children);
  if (changes) notes.push(`Canonicalized ${changes} intentionally empty legacy path(s) as zero-length paths with unchanged visual output.`);
}

function wrapLegacyScalarVariableReferences(document, notes) {
  const scalarKeys = new Set([
    "x", "y", "width", "height", "rotation", "flipX", "flipY", "opacity", "enabled", "decorative",
    "bleed", "safeMargin", "wrap", "minWidth", "maxWidth", "minHeight", "maxHeight", "gridColumn", "gridRow",
    "clip", "fontSize", "lineHeight", "letterSpacing", "wordSpacing", "underline", "strikethrough", "weight",
  ]);
  let changes = 0;
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      for (const key of scalarKeys) {
        const value = node?.[key];
        if (typeof value !== "string" || !/^\$\{(?:[A-Za-z][\w-]*:)?[A-Za-z][\w-]*(?:\.[\w-]+)*\}$/u.test(value)) continue;
        node[key] = [{ value }];
        changes += 1;
      }
      visit(node?.children);
    }
  };
  visit(document.children);
  if (changes) notes.push(`Wrapped ${changes} legacy scalar variable reference(s) as canonical cascades so their resolved types remain intact.`);
}

function collapseUniformLegacyAxes(document, notes) {
  const unsupported = Object.keys(document.axes ?? {}).filter((name) => name === "portal");
  for (const axis of unsupported) {
    const selected = new Set();
    const collect = (nodes) => {
      for (const node of nodes ?? []) {
        if (typeof node?.modes?.[axis] === "string") selected.add(node.modes[axis]);
        collect(node?.children);
      }
    };
    collect(document.children);
    if (selected.size > 1) {
      throw migrationError(`Legacy axis ${axis} has multiple active modes and cannot be collapsed without changing sibling rendering.`);
    }
    const mode = [...selected][0] ?? document.axes[axis]?.modes?.[0]?.name;
    if (typeof mode !== "string" || !mode) throw migrationError(`Legacy axis ${axis} has no selectable mode.`);
    collapseAxisConditions(document, axis, mode);
    delete document.axes[axis];
    notes.push(`Collapsed uniformly selected legacy axis \`${axis}\` at mode \`${mode}\` into static values; Canvas axes are appearance and viewport.`);
  }
}

function collapseAxisConditions(value, axis, mode) {
  if (Array.isArray(value)) {
    const cascade = value.length > 0 && value.every((entry) => entry && typeof entry === "object"
      && !Array.isArray(entry) && Object.hasOwn(entry, "value"));
    if (cascade) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const entry = value[index];
        if (entry.when?.[axis] !== undefined && entry.when[axis] !== mode) {
          value.splice(index, 1);
          continue;
        }
        if (entry.when && Object.hasOwn(entry.when, axis)) {
          delete entry.when[axis];
          if (Object.keys(entry.when).length === 0) delete entry.when;
        }
        collapseAxisConditions(entry.value, axis, mode);
      }
      return;
    }
    value.forEach((entry) => collapseAxisConditions(entry, axis, mode));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (value.modes && typeof value.modes === "object" && !Array.isArray(value.modes)) {
    delete value.modes[axis];
    if (Object.keys(value.modes).length === 0) delete value.modes;
  }
  for (const child of Object.values(value)) collapseAxisConditions(child, axis, mode);
}

function canonicalizeLegacyTextAlignment(document, notes) {
  let changes = 0;
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      if (node?.type === "text" && node.textAlignVertical === "middle") {
        node.textAlignVertical = "center";
        changes += 1;
      }
      visit(node?.children);
    }
  };
  visit(document.children);
  if (changes) notes.push(`Renamed ${changes} legacy middle text alignment value(s) to canonical center alignment.`);
}

function canonicalizeLegacyAnnotatedDimensions(document, notes) {
  const dimensionKeys = new Set(["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"]);
  let changes = 0;
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      for (const key of dimensionKeys) {
        const value = node?.[key];
        if (typeof value !== "string") continue;
        const match = /^(fill_container|fit_content)\([^)]*\)$/u.exec(value);
        if (!match) continue;
        node[key] = match[1];
        changes += 1;
      }
      visit(node?.children);
    }
  };
  visit(document.children);
  if (changes) notes.push(`Canonicalized ${changes} legacy annotated sizing value(s) while preserving fill/fit layout intent.`);
}

function repairLegacyParagraphs(document, notes) {
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      if (node?.type === "text" && typeof node.content === "string" && !validParagraphPartition(node)) {
        const original = Array.isArray(node.paragraphs) ? node.paragraphs : [];
        node.paragraphs = paragraphPartition(node.content).map((range, index) => ({
          ...range,
          ...usableParagraphMetadata(document, selectParagraph(original, range, index)),
        }));
        notes.push(`Regenerated paragraph ranges from content for text node \`${node.id}\`; preserved usable paragraph metadata deterministically.`);
      }
      visit(node?.children);
    }
  };
  visit(document.children);
}

function validParagraphPartition(node) {
  const { content, paragraphs } = node;
  if (!Array.isArray(paragraphs)) return false;
  if (content.length === 0) return paragraphs.length === 0;
  if (paragraphs.length === 0) return false;
  let cursor = 0;
  for (const paragraph of paragraphs) {
    if (!paragraph || !Number.isInteger(paragraph.from) || !Number.isInteger(paragraph.to)
      || paragraph.from !== cursor || paragraph.from < 0 || paragraph.from >= paragraph.to
      || paragraph.to > content.length) return false;
    if (paragraph.to < content.length && content[paragraph.to - 1] !== "\n") return false;
    cursor = paragraph.to;
  }
  return cursor === content.length;
}

function selectParagraph(paragraphs, range, targetIndex) {
  if (!paragraphs.length) return null;
  const ranked = paragraphs.map((paragraph, index) => {
    const interval = paragraphInterval(paragraph);
    if (!interval) return { paragraph, index, overlap: 0, distance: Number.POSITIVE_INFINITY };
    const overlap = Math.max(0, Math.min(interval.to, range.to) - Math.max(interval.from, range.from));
    const distance = overlap > 0 ? 0 : interval.to < range.from ? range.from - interval.to : interval.from - range.to;
    return { paragraph, index, overlap, distance };
  });
  ranked.sort((left, right) => {
    if ((left.overlap > 0) !== (right.overlap > 0)) return left.overlap > 0 ? -1 : 1;
    if (left.overlap !== right.overlap) return right.overlap - left.overlap;
    if (left.distance !== right.distance) return left.distance - right.distance;
    const leftIndexDistance = Math.abs(left.index - targetIndex);
    const rightIndexDistance = Math.abs(right.index - targetIndex);
    return leftIndexDistance - rightIndexDistance || left.index - right.index;
  });
  return ranked[0].paragraph;
}

function paragraphInterval(paragraph) {
  if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph)
    || !Number.isInteger(paragraph.from) || !Number.isInteger(paragraph.to)) return null;
  return paragraph.from <= paragraph.to
    ? { from: paragraph.from, to: paragraph.to }
    : { from: paragraph.to, to: paragraph.from };
}

function usableParagraphMetadata(document, paragraph) {
  if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph)) return {};
  const metadata = {};
  if (typeof paragraph.style === "string" && paragraph.style
    && paragraphStyleExists(document, paragraph.style)) metadata.style = paragraph.style;
  if (["start", "center", "end", "justify"].includes(paragraph.align)) metadata.align = paragraph.align;
  if (paragraph.list && typeof paragraph.list === "object" && !Array.isArray(paragraph.list)) {
    metadata.list = structuredClone(paragraph.list);
  }
  if (Number.isInteger(paragraph.headingLevel) && paragraph.headingLevel >= 1 && paragraph.headingLevel <= 6) {
    metadata.headingLevel = paragraph.headingLevel;
  }
  return metadata;
}

function paragraphStyleExists(document, style) {
  if (Object.hasOwn(document.paragraphStyles ?? {}, style)) return true;
  const parts = style.split(":");
  return parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]) && Object.hasOwn(document.imports ?? {}, parts[0]);
}

function paragraphPartition(content) {
  const ranges = [];
  let from = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "\n") continue;
    ranges.push({ from, to: index + 1 });
    from = index + 1;
  }
  if (from < content.length) ranges.push({ from, to: content.length });
  return ranges;
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

export async function createCanvasMigrationCopy(api, documentId, payload, {
  reportDirectory,
  sourceAccess = "owner",
  sourceTitle,
} = {}) {
  if (payload.id !== undefined && payload.id !== documentId) {
    throw migrationError(`Canvas migration payload ${payload.id} does not match source document ${documentId}.`);
  }
  if (!payload.snapshot?.source || typeof payload.snapshot.source !== "object") throw migrationError("Canvas migration needs a source projection.");
  if (typeof reportDirectory !== "string" || !reportDirectory || !isAbsolute(reportDirectory)) {
    throw migrationError("Canvas migration needs an absolute report directory for its Markdown record.");
  }
  if (sourceAccess !== "owner" && sourceAccess !== "editor") {
    throw migrationError(`Canvas migration received unsupported source access ${sourceAccess}.`);
  }
  const title = String(sourceTitle ?? payload.title ?? "Untitled");
  const copyTitle = sourceAccess === "editor" ? `${title} — migrated copy` : title;
  const supersededTitle = `${title} — superseded by 00000000-0000-0000-0000-000000000000`;
  // Validate the title that is sent to createDocument before any remote write.
  // The owner superseded title is checked again after the generated copy ID is
  // known because that ID is part of the final title.
  assertMigrationTitle(copyTitle);
  if (sourceAccess === "owner") assertMigrationTitle(supersededTitle);
  const legacyModel = restoreDocumentModel(payload);
  const source = materialize(legacyModel);
  legacyModel.doc.destroy();
  const migrated = migrateCanvasDocument(source);
  const model = createDocumentModel(migrated.document);
  let copy = null;
  let reportPath = null;
  let reportCreated = false;
  try {
    const sourceAssets = payload.assets === undefined
      ? validateAssetInventory(await api.listAssets(documentId), documentId)
      : validateAssetInventory(payload.assets, documentId);
    copy = await api.createDocument({ title: copyTitle, source: migrated.document, initialUpdate: encodeState(model) });
    if (!copy?.id) throw migrationError("Canvas migration createDocument returned no copy ID.");
    await transferAssets(api, documentId, copy.id, sourceAssets);
    const verified = await api.getDocumentProjection(copy.id);
    if (!verified?.snapshot?.source || !sameProjection(verified.snapshot.source, migrated.document)) {
      throw migrationError(`Migrated copy ${copy.id} did not round-trip its canonical projection.`);
    }
    const copiedAssets = validateAssetInventory(await api.listAssets(copy.id), copy.id);
    if (!sameAssetInventory(sourceAssets, copiedAssets)) {
      throw migrationError(`Migrated copy ${copy.id} did not round-trip its asset inventory.`);
    }
    reportPath = join(resolve(reportDirectory), `migration-${documentId}-to-${copy.id}.md`);
    await mkdir(resolve(reportDirectory), { recursive: true });
    await writeFile(reportPath, migrationMarkdown(title, documentId, copy.id, migrated, sourceAssets, sourceAccess), { encoding: "utf8", flag: "wx" });
    reportCreated = true;
    let sourceRenamed = false;
    if (sourceAccess === "owner") {
      const finalSupersededTitle = `${title} — superseded by ${copy.id}`;
      assertMigrationTitle(finalSupersededTitle);
      await api.renameDocument(documentId, finalSupersededTitle);
      sourceRenamed = true;
    }
    return {
      sourceDocumentId: documentId,
      documentId: copy.id,
      title: copyTitle,
      sourceAccess,
      sourceRenamed,
      reportPath,
      assetCount: sourceAssets.length,
    };
  } catch (error) {
    if (copy?.id) await api.deleteDocument(copy.id).catch(() => undefined);
    if (reportCreated) await unlink(reportPath).catch(() => undefined);
    throw error;
  } finally {
    model.doc.destroy();
  }
}

function migrationMarkdown(title, sourceId, copyId, migrated, assets, sourceAccess) {
  const notes = migrated.notes.length ? migrated.notes.map((note) => `- ${note}`).join("\n") : "- No content was dropped, approximated or inferred.";
  const sourceDisposition = sourceAccess === "editor"
    ? "The source was shared with this caller and was left unchanged; only a new owner copy was created."
    : "The source content was left untouched and renamed only after the copy and asset inventory round-tripped successfully.";
  return `# Canvas migration: ${title}\n\nSource document: \`${sourceId}\`\n\nMigrated copy: \`${copyId}\`\n\nValidated assets transferred: ${assets.length}\n\n${sourceDisposition}\n\n## Dropped, approximated and inferred\n\n${notes}\n`;
}

function assertMigrationTitle(title) {
  if (new TextEncoder().encode(title).length > 255) {
    const error = new Error("The Canvas migration title exceeds 255 UTF-8 bytes.");
    error.code = "CANVAS_MIGRATION_TITLE_INVALID";
    throw error;
  }
}

function validateAssetInventory(value, documentId) {
  if (!Array.isArray(value)) throw migrationError(`Canvas document ${documentId} returned an invalid asset inventory.`);
  const paths = new Set();
  for (const asset of value) {
    if (!asset || typeof asset !== "object" || typeof asset.path !== "string" || !asset.path
      || typeof asset.sha256 !== "string" || !asset.sha256 || !Number.isSafeInteger(asset.size) || asset.size < 0
      || typeof asset.mimeType !== "string" || !asset.mimeType) {
      throw migrationError(`Canvas document ${documentId} returned an invalid asset descriptor.`);
    }
    if (paths.has(asset.path)) throw migrationError(`Canvas document ${documentId} returned duplicate asset path ${asset.path}.`);
    paths.add(asset.path);
  }
  return value;
}

function sameAssetInventory(left, right) {
  if (left.length !== right.length) return false;
  const byPath = new Map(right.map((asset) => [asset.path, asset]));
  return left.every((asset) => {
    const copy = byPath.get(asset.path);
    return copy?.sha256 === asset.sha256 && copy.size === asset.size && copy.mimeType === asset.mimeType;
  });
}

async function transferAssets(api, sourceDocumentId, destinationDocumentId, assets) {
  // Keep a bounded number of read/upload chains active. Each worker owns an
  // asset index, and the failure flag prevents any worker from claiming more
  // work after an error while Promise.all below settles already-started work.
  const next = { index: 0 };
  let failed = false;
  const failures = [];
  const worker = async () => {
    while (true) {
      if (failed) return;
      const index = next.index;
      next.index += 1;
      if (index >= assets.length) return;
      const asset = assets[index];
      try {
        const bytes = await api.readAsset(sourceDocumentId, asset);
        await api.uploadAsset(destinationDocumentId, { ...asset, bytes });
      } catch (error) {
        failures.push({ index, error });
        failed = true;
        return;
      }
    }
  };
  const workerCount = Math.min(4, assets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failures.length) {
    failures.sort((left, right) => left.index - right.index);
    throw failures[0].error;
  }
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
