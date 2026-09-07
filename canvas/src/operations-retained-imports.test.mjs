import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { base64ToBytes, bytesToBase64, decodeJson, encodeJson } from "./codec.mjs";
import { createCanvasApi } from "./canvas-api.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";

const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlY7iQAAAAASUVORK5CYII=",
  "base64",
));

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function response(status, value) { return { status, headers: {}, body: encodeJson(value) }; }

function createAccountTransport() {
  const projects = new Map();
  const blobs = new Map();
  const uploads = new Map();
  const calls = [];
  let uploadNumber = 0;
  let denyBlobReads = false;
  let sourceRequests = 0;

  function setProject(id, source, title = "Consumer") {
    const model = createDocumentModel(source);
    const state = encodeState(model);
    model.doc.destroy();
    projects.set(id, { id, title, source, state });
    if (!blobs.has(id)) blobs.set(id, new Map());
  }
  function corrupt(id, sha256) {
    const stored = blobs.get(id)?.get(sha256);
    if (!stored) throw new Error(`Missing blob ${sha256}`);
    stored.bytes[0] ^= 0xff;
  }
  function blobDescriptors(id) {
    return [...(blobs.get(id)?.values() ?? [])].map(({ bytes: _bytes, ...descriptor }) => descriptor);
  }
  function combine(parts) {
    const ordered = [...parts.entries()].sort(([left], [right]) => left - right).map(([, bytes]) => bytes);
    const output = new Uint8Array(ordered.reduce((size, bytes) => size + bytes.byteLength, 0));
    let offset = 0;
    for (const bytes of ordered) { output.set(bytes, offset); offset += bytes.byteLength; }
    return output;
  }

  const account = {
    async request(request) {
      calls.push(request);
      if (request.path.startsWith("/projects/source")) {
        sourceRequests += 1;
        throw Object.assign(new Error("source access is forbidden after acceptance"), { code: "SOURCE_READ_FORBIDDEN" });
      }
      const projectMatch = request.path.match(/^\/projects\/([^/?]+)(.*)$/u);
      const projectId = projectMatch ? decodeURIComponent(projectMatch[1]) : null;
      const suffix = projectMatch?.[2] ?? "";
      if (!projectId || !projects.has(projectId)) return response(404, { code: "ACCESS_DENIED", message: "denied" });
      const project = projects.get(projectId);
      const projectBlobs = blobs.get(projectId);
      if (suffix === "?chunked=auto") {
        return response(200, {
          id: project.id, title: project.title, access: "owner", ownerAccountId: "account-1",
          snapshot: { throughSequence: 1, state: project.state, projection: project.source }, updates: [],
        });
      }
      if (suffix === "/blobs" && request.method === "GET") return response(200, { items: blobDescriptors(projectId) });
      if (suffix === "/blobs/uploads" && request.method === "POST") {
        const input = decodeJson(request.body);
        const uploadId = `upload-${++uploadNumber}`;
        uploads.set(uploadId, { projectId, input, parts: new Map() });
        return response(200, { status: "upload", uploadId, chunkSize: 1024 * 1024 });
      }
      const partMatch = suffix.match(/^\/blobs\/uploads\/([^/]+)\/parts$/u);
      if (partMatch && request.method === "POST") {
        const upload = uploads.get(decodeURIComponent(partMatch[1]));
        if (!upload) return response(404, { code: "CANVAS_REQUEST_FAILED", message: "missing upload" });
        const input = decodeJson(request.body);
        upload.parts.set(Number(input.part), base64ToBytes(input.bytes));
        return response(200, { received: true });
      }
      const completeMatch = suffix.match(/^\/blobs\/uploads\/([^/]+)\/complete$/u);
      if (completeMatch && request.method === "POST") {
        const uploadId = decodeURIComponent(completeMatch[1]);
        const upload = uploads.get(uploadId);
        if (!upload) return response(404, { code: "CANVAS_REQUEST_FAILED", message: "missing upload" });
        const bytes = combine(upload.parts);
        const input = upload.input;
        const descriptor = { path: input.path, sha256: input.sha256, size: input.size, ...(input.mimeType ? { mimeType: input.mimeType } : {}) };
        projectBlobs.set(input.sha256, { ...descriptor, bytes });
        uploads.delete(uploadId);
        return response(200, { blob: descriptor });
      }
      const readMatch = suffix.match(/^\/blobs\/([^?]+)\?offset=(\d+)$/u);
      if (readMatch && request.method === "GET") {
        if (denyBlobReads) return response(403, { code: "ACCESS_DENIED", message: "consumer blob read denied" });
        const sha256 = decodeURIComponent(readMatch[1]);
        const stored = projectBlobs.get(sha256);
        if (!stored) return response(404, { code: "CANVAS_REQUEST_FAILED", message: "missing blob" });
        return response(200, { bytes: bytesToBase64(stored.bytes), complete: true });
      }
      throw new Error(`Unexpected Account request ${request.method} ${request.path}`);
    },
    subscribe() {},
  };
  return {
    account,
    calls,
    setProject,
    corrupt,
    set denyBlobReads(value) { denyBlobReads = value; },
    get sourceRequests() { return sourceRequests; },
  };
}

function libraryDocument() {
  return {
    version: "2.17", module: "generic",
    axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } },
    variables: {
      privateInk: { tokenType: "color", cascade: [{ value: "#111111" }, { value: "#eeeeee", when: { appearance: "dark" } }] },
      accent: { tokenType: "color", cascade: [{ value: "${privateInk}" }] },
    },
    paragraphStyles: { body: { fill: "${accent}", fontSize: 18 } },
    imports: {}, flows: [],
    library: { public: [{ kind: "variable", id: "accent" }, { kind: "paragraphStyle", id: "body" }, { kind: "component", id: "card" }] },
    children: [{
      id: "card", type: "frame", width: 180, height: 100, fill: "${accent}", children: [
        { id: "card-image", type: "rectangle", x: 10, y: 10, width: 20, height: 20, fill: { type: "image", url: "card.png" } },
        { id: "card-label", type: "text", x: 40, y: 10, width: 120, height: 30, content: "Library card", style: "body", paragraphs: [{ from: 0, to: 12 }], marks: [] },
      ],
    }],
  };
}

function consumerDocument(release, receipt) {
  return {
    version: "2.17", module: "web",
    axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } },
    variables: { accent: { tokenType: "color", cascade: [{ value: "#ff0000" }] } },
    paragraphStyles: { body: { fill: "#00ff00", fontSize: 99 } },
    imports: { ui: { documentId: release.libraryId, updatePolicy: "pinned", releaseId: release.releaseId, contentHash: release.contentHash, retention: receipt } },
    flows: [],
    children: [{
      id: "scene", type: "frame", name: "Scene", role: "route", width: 320, height: 180, fill: "#ffffff", children: [
        { id: "use-card", type: "ref", ref: "ui:card", x: 20, y: 20 },
        { id: "consumer-color", type: "rectangle", x: 220, y: 20, width: 60, height: 20, fill: "${ui:accent}" },
        { id: "consumer-label", type: "text", x: 20, y: 130, width: 180, height: 30, content: "Consumer label", style: "ui:body", paragraphs: [{ from: 0, to: 14 }], marks: [] },
      ],
    }],
  };
}

function emptyDocument() {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "scene", type: "frame", width: 120, height: 80, fill: "#ffffff", children: [{ id: "box", type: "rectangle", x: 10, y: 10, width: 30, height: 20, fill: "#123456" }] }],
  };
}

async function register(transport, suffix) {
  const handlers = new Map();
  globalThis.penkra = { account: transport.account, operations: { handle: (name, handler) => handlers.set(name, handler) } };
  await import(`./operations.mjs?retained-imports=${suffix}-${Date.now()}`);
  return handlers;
}

async function acceptedScenario() {
  const transport = createAccountTransport();
  transport.setProject("consumer", emptyDocument());
  const runtime = { account: transport.account };
  const api = createCanvasApi(runtime);
  const assetBytes = new Uint8Array(ONE_PIXEL_PNG);
  const release = createLibraryRelease(libraryDocument(), {
    libraryId: "source", releaseId: "r1",
    assets: [{ path: "card.png", sha256: hash(assetBytes), size: assetBytes.length, mimeType: "image/png" }],
  });
  const receipt = await createLibraryStorage(api).retainItems("consumer", release, [
    { kind: "variable", id: "accent" }, { kind: "paragraphStyle", id: "body" }, { kind: "component", id: "card" },
  ], {
    resolveRelease: async (identity) => {
      assert.deepEqual(identity, { documentId: "source", updatePolicy: "pinned", releaseId: "r1", contentHash: release.contentHash });
      return release;
    },
    readAsset: async (_identity, descriptor) => {
      assert.equal(descriptor.path, "card.png");
      return new Uint8Array(assetBytes);
    },
  });
  const consumer = consumerDocument(release, receipt);
  transport.setProject("consumer", consumer);
  return { transport, release, receipt, consumer };
}

test("registered export and extract handlers load accepted consumer receipts without source reads", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-operations-retained-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const scenario = await acceptedScenario();
  const handlers = await register(scenario.transport, "valid");

  const svgPath = join(directory, "scene.svg");
  const extracted = await handlers.get("documents.extract")({
    documentId: "consumer", node: ["scene"], format: "svg", destination: svgPath, modes: { appearance: "dark" },
  });
  assert.deepEqual(extracted.artifacts, [svgPath]);
  const svg = await readFile(svgPath, "utf8");
  assert.match(svg, /Library card/u);
  assert.match(svg, /#eeeeee/iu);
  assert.match(svg, /data:image\/png;base64,/u);

  const html = await handlers.get("documents.export")({
    documentId: "consumer", format: "html", destination: `${directory}/`, bindings: [{ output: "site" }], modes: { appearance: "dark" },
  });
  assert.ok(html.artifacts.some((path) => path.endsWith("scene.html")));
  const htmlSource = await readFile(join(directory, "site", "scene.html"), "utf8");
  assert.match(htmlSource, /Library card/u);
  assert.match(htmlSource, /#eeeeee/iu);
  assert.ok(html.artifacts.some((path) => path.endsWith("assets/raster-1.png")));
  assert.equal(scenario.transport.sourceRequests, 0);
  assert.ok(scenario.transport.calls.some(({ path }) => path === "/projects/consumer/blobs"));
});

test("retained operation failures publish no destination and never fall back to source", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-operations-retained-failures-"));
  context.after(() => rm(directory, { recursive: true, force: true }));

  const missing = await acceptedScenario();
  const missingDocument = structuredClone(missing.consumer);
  delete missingDocument.imports.ui.retention;
  missing.transport.setProject("consumer", missingDocument);
  const missingHandlers = await register(missing.transport, "missing");
  const missingDestination = join(directory, "missing.svg");
  await assert.rejects(
    missingHandlers.get("documents.extract")({ documentId: "consumer", node: ["scene"], format: "svg", destination: missingDestination }),
    { code: "CANVAS_IMPORT_RETENTION_REQUIRED" },
  );
  await assert.rejects(readFile(missingDestination), { code: "ENOENT" });
  assert.equal(missing.transport.sourceRequests, 0);

  const corrupt = await acceptedScenario();
  corrupt.transport.corrupt("consumer", corrupt.receipt.sha256);
  const corruptHandlers = await register(corrupt.transport, "corrupt");
  const corruptDestination = join(directory, "corrupt.svg");
  await assert.rejects(
    corruptHandlers.get("documents.extract")({ documentId: "consumer", node: ["scene"], format: "svg", destination: corruptDestination }),
    { code: "CANVAS_IMPORT_INTEGRITY" },
  );
  await assert.rejects(readFile(corruptDestination), { code: "ENOENT" });
  assert.equal(corrupt.transport.sourceRequests, 0);

  const denied = await acceptedScenario();
  denied.transport.denyBlobReads = true;
  const deniedHandlers = await register(denied.transport, "denied");
  const deniedDestination = join(directory, "denied.svg");
  await assert.rejects(
    deniedHandlers.get("documents.extract")({ documentId: "consumer", node: ["scene"], format: "svg", destination: deniedDestination }),
    { code: "ACCESS_DENIED" },
  );
  await assert.rejects(readFile(deniedDestination), { code: "ENOENT" });
  assert.equal(denied.transport.sourceRequests, 0);
});

test("registered extract handler preserves empty-import behavior without library blob reads", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-operations-no-imports-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const transport = createAccountTransport();
  transport.setProject("consumer", emptyDocument());
  const handlers = await register(transport, "empty");
  const destination = join(directory, "scene.svg");
  await handlers.get("documents.extract")({ documentId: "consumer", node: ["scene"], format: "svg", destination });
  assert.match(await readFile(destination, "utf8"), /#123456/iu);
  assert.equal(transport.calls.some(({ path }) => /\/blobs\/[^/]+\?offset=/u.test(path)), false);
  assert.equal(transport.sourceRequests, 0);
});
