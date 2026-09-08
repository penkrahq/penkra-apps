import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeJson, encodeJson } from "./codec.mjs";
import {
  createDocumentModel,
  createDocumentOperationUpdates,
  encodeState,
  encodeUpdate,
} from "./document-model.mjs";

function response(status, value) {
  return { status, headers: {}, body: value === null ? new Uint8Array() : encodeJson(value) };
}

function readableDocumentAccount(source, requests) {
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  return {
    async request(request) {
      requests.push(request);
      if (request.path === "/projects/document-1?chunked=auto") {
        return response(200, {
          id: "document-1",
          title: "Design",
          access: "owner",
          ownerAccountId: "account-1",
          snapshot: { throughSequence: 7, state, projection: source },
          updates: [],
        });
      }
      if (request.path === "/projects/document-1/blobs") return response(200, { items: [] });
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    },
    subscribe() {},
  };
}

test("registers only the public document lifecycle, editing, undo, and sharing surface", async () => {
  const handlers = new Map();
  globalThis.penkra = {
    account: { request() {}, subscribe() {} },
    operations: {
      handle(name, handler) {
        handlers.set(name, handler);
      },
    },
  };
  await import(`./operations.mjs?test=${Date.now()}`);
  const context = {
    tab: {
      id: "tab-1",
      async navigate() {},
    },
  };
  assert.deepEqual([...handlers.keys()].sort(), [
    "documents.create",
    "documents.execute",
    "documents.export",
    "documents.extract",
    "documents.list",
    "documents.open",
    "documents.trash",
    "documents.undo",
    "libraries.accept",
    "libraries.inspect",
    "libraries.publish",
    "sharing.add",
    "sharing.list",
    "sharing.remove",
  ]);
  assert.deepEqual(
    await handlers.get("documents.open")({ documentId: "document-1" }, context),
    { documentId: "document-1", tabId: "tab-1" },
  );
});

test("documents.list continues through Account pages until it finds the requested matches", async () => {
  const handlers = new Map();
  const paths = [];
  globalThis.penkra = {
    account: {
      async request(request) {
        paths.push(request.path);
        const secondPage = request.path.includes("cursor=page-2");
        return response(200, secondPage
          ? {
              items: [{ id: "match", title: "Requested design" }],
              pageInfo: { nextCursor: null },
            }
          : {
              items: [{ id: "other", title: "Unrelated design" }],
              pageInfo: { nextCursor: "page-2" },
            });
      },
      subscribe() {},
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?list-test=${Date.now()}`);

  const result = await handlers.get("documents.list")({ query: "requested", limit: 1 });

  assert.deepEqual(result.items, [{ id: "match", title: "Requested design" }]);
  assert.deepEqual(paths, [
    "/projects?limit=100",
    "/projects?limit=100&cursor=page-2",
  ]);
});

test("documents.create identifies the starter frame that later execution should replace", async () => {
  const handlers = new Map();
  globalThis.penkra = {
    account: {
      async request(request) {
        if (request.path === "/projects/snapshot-uploads") {
          return response(200, { uploadId: "upload-1", chunkSize: 1024 * 1024 });
        }
        if (request.path === "/projects/snapshot-uploads/upload-1/parts") {
          return response(200, { received: true });
        }
        if (request.path === "/projects/snapshot-uploads/upload-1/complete") {
          return response(200, { id: "document-1" });
        }
        throw new Error(`Unexpected request ${request.method} ${request.path}`);
      },
      subscribe() {},
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?create-test=${Date.now()}`);

  const result = await handlers.get("documents.create")({ title: "New design", module: "web" });

  assert.equal(result.documentId, "document-1");
  assert.equal(result.title, "New design");
  assert.equal(result.access, "owner");
  assert.match(result.starterFrameId, /^[0-9a-f-]{36}$/u);
});

test("public documents.export derives role from format, defaults matching frames and delivers binding outputs", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-operation-export-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: readableDocumentAccount({
      version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
      children: [{ id: "slide", type: "frame", role: "slide", width: 800, height: 450, physical: { w: 10, h: 5.625, unit: "in" }, children: [
        { id: "title", type: "text", width: 300, height: 50, content: "${schoolName}", fontFamily: "Inter", fontSize: 24, paragraphs: [], marks: [] },
      ] }],
    }, requests),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?export-test=${Date.now()}`);
  for (const bindings of [[], {}, Array(1001).fill({ output: "one" })]) {
    await assert.rejects(handlers.get("documents.export")({ documentId: "document-1", format: "pptx", destination: `${directory}/`, bindings }), { code: "CANVAS_EXPORT_BINDINGS" });
  }
  assert.equal(requests.length, 0);
  const result = await handlers.get("documents.export")({
    documentId: "document-1", format: "pptx", destination: `${directory}/`,
    bindings: [{ output: "one", schoolName: "One School" }, { output: "two", schoolName: "Two School" }],
  });
  assert.deepEqual(result.artifacts, [join(directory, "one.pptx"), join(directory, "two.pptx")]);
  for (const artifact of result.artifacts) assert.deepEqual([...await readFile(artifact)].slice(0, 2), [80, 75]);
});

test("documents.trash requires exact current-title confirmation without decoding the document", async () => {
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: {
      async request(request) {
        requests.push(request);
        if (request.method === "DELETE") {
          return { status: 204, body: new Uint8Array() };
        }
        return {
          status: 200,
          body: encodeJson({
            items: [
              {
                id: "bbae45e7-a867-42c6-9727-af47f4644c23",
                title: "Unreadable draft",
                access: "owner",
              },
            ],
            pageInfo: { nextCursor: null },
          }),
        };
      },
      subscribe() {},
    },
    operations: {
      handle(name, handler) {
        handlers.set(name, handler);
      },
    },
  };
  await import(`./operations.mjs?delete-test=${Date.now()}`);
  const remove = handlers.get("documents.trash");

  await assert.rejects(
    remove({
      documentId: "bbae45e7-a867-42c6-9727-af47f4644c23",
      confirmTitle: "wrong title",
    }),
    { code: "CANVAS_DOCUMENT_TRASH_CONFIRMATION_MISMATCH" },
  );
  assert.equal(requests.some((request) => request.method === "DELETE"), false);

  assert.deepEqual(
    await remove({
      documentId: "bbae45e7-a867-42c6-9727-af47f4644c23",
      confirmTitle: "Unreadable draft",
    }),
    {
      documentId: "bbae45e7-a867-42c6-9727-af47f4644c23",
      title: "Unreadable draft",
      trashed: true,
    },
  );
  assert.deepEqual(
    requests.filter((request) => request.method === "DELETE").map((request) => request.path),
    ["/projects/bbae45e7-a867-42c6-9727-af47f4644c23"],
  );
});

test("read-only execute reports real inspection without advancing the source sequence", async () => {
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: readableDocumentAccount(
      {
        version: "2.15",
        children: [
          { id: "frame", type: "frame", x: 10, y: 20, width: 200, height: 100, children: [] },
        ],
      },
      requests,
    ),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?read-test=${Date.now()}`);
  const result = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: 'Print(Get("#frame")[0].bounds); return "frame";',
  });

  assert.equal(result.changed, false);
  assert.equal(result.operationId, null);
  assert.equal(result.sequence, 7);
  assert.deepEqual(result.touchedNodeIds, []);
  assert.equal(result.prints[0].width, 200);
  assert.equal(requests.some((request) => request.method === "POST"), false);
});

test("execute returns TakeScreenshot renders as MCP-compatible rich content", async () => {
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: readableDocumentAccount(
      {
        version: "2.15",
        children: [
          { id: "frame", type: "frame", x: 0, y: 0, width: 120, height: 80, fill: "#ff0000", children: [] },
        ],
      },
      requests,
    ),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?screenshot-test=${Date.now()}`);
  const result = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: 'TakeScreenshot(["#frame"]); return "frame";',
  });

  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "image");
  assert.equal(result.content[0].mimeType, "image/png");
  assert.deepEqual(Buffer.from(result.content[0].data, "base64").subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.deepEqual(result.structuredContent.screenshots, [{
    nodeIds: ["frame"],
    width: 120,
    height: 80,
    mimeType: "image/png",
  }]);
  assert.equal(result.structuredContent.changed, false);
  assert.equal(requests.some((request) => request.method === "POST"), false);
});

test("invalid execute output fails before any shared update or snapshot write", async () => {
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: readableDocumentAccount({ version: "2.15", children: [] }, requests),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?invalid-test=${Date.now()}`);

  await assert.rejects(
    handlers.get("documents.execute")({
      documentId: "document-1",
      code: 'Insert(null, { id: "broken" });',
    }),
    /requires a non-empty type/,
  );
  assert.equal(requests.some((request) => request.method === "POST"), false);
});

test("invalid descendant overrides fail before commit with a stable code", async () => {
  const handlers = new Map();
  const requests = [];
  const source = {
    version: "2.17",
    module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      { id: "component", type: "frame", reusable: true, children: [{ id: "bar", type: "rectangle", width: 10, height: 3 }] },
      { id: "instance", type: "ref", ref: "component" },
    ],
  };
  globalThis.penkra = {
    account: readableDocumentAccount(source, requests),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?descendant-invalid-test=${Date.now()}`);
  await assert.rejects(
    handlers.get("documents.execute")({
      documentId: "document-1",
      code: 'Update("#instance", { descendants: { missing: { fill: "#000000" } } });',
    }),
    { code: "CANVAS_DESCENDANT_OVERRIDE_INVALID" },
  );
  assert.equal(requests.some((request) => request.method === "POST"), false);
});

test("execute reads and commits legacy text directions through their canonical aliases", async () => {
  const handlers = new Map();
  const requests = [];
  const source = {
    version: "2.17",
    module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      {
        id: "component", type: "frame", reusable: true, children: [{
          id: "label", type: "text", content: "Old", textAlign: "left",
          textAlignVertical: "middle", paragraphs: [{ from: 0, to: 3, align: "right" }],
        }],
      },
      { id: "instance", type: "ref", ref: "component" },
    ],
  };
  const base = readableDocumentAccount(source, requests);
  globalThis.penkra = {
    account: {
      ...base,
      async request(request) {
        if ((request.method ?? "GET") === "GET") return base.request(request);
        requests.push(request);
        if (request.path === "/projects/document-1/updates") return response(200, { sequence: 8 });
        if (request.path === "/projects/document-1/snapshots") return response(200, { throughSequence: 8 });
        throw new Error(`Unexpected request ${request.method} ${request.path}`);
      },
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?alignment-alias-test=${Date.now()}`);

  const read = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: 'return { horizontal: Get("#label")[0].node.textAlign, vertical: Get("#label")[0].node.textAlignVertical };',
  });
  assert.deepEqual(read.result, { horizontal: "start", vertical: "center" });

  const changed = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: 'Update("#instance", { descendants: { label: { content: "New" } } }); Insert(null, { id: "new-text", type: "text", content: "New", textAlign: "right" });',
  });
  assert.equal(changed.changed, true);
  assert.equal(changed.sequence, 8);
  const snapshot = requests.find((request) => request.path === "/projects/document-1/snapshots");
  const projection = decodeJson(snapshot.body).projection;
  assert.equal(projection.children[0].children[0].textAlign, "start");
  assert.equal(projection.children[0].children[0].textAlignVertical, "center");
  assert.equal(projection.children.at(-1).textAlign, "end");
  assert.equal(source.children[0].children[0].textAlign, "left");
});

test("large mutations retain touched IDs but bound detailed inspection with a summary", async () => {
  const handlers = new Map();
  const requests = [];
  const source = {
    version: "2.17",
    module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "root", type: "frame", width: 100, height: 100, children: [] }],
  };
  const base = readableDocumentAccount(source, requests);
  globalThis.penkra = {
    account: {
      ...base,
      async request(request) {
        if ((request.method ?? "GET") === "GET") return base.request(request);
        requests.push(request);
        if (request.path === "/projects/document-1/updates") return response(200, { sequence: 8 });
        if (request.path === "/projects/document-1/snapshots") return response(200, { throughSequence: 8 });
        throw new Error(`Unexpected request ${request.method} ${request.path}`);
      },
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?inspection-limit-test=${Date.now()}`);
  const children = Array.from({ length: 60 }, (_, index) => ({ id: `copy-${index}`, type: "rectangle", width: 1, height: 1 }));
  const result = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: `Insert("#root", ${JSON.stringify({ id: "copy", type: "frame", children })});`,
  });
  assert.equal(result.touchedNodeIds.length, 62);
  assert.equal(result.inspection.length, 50);
  assert.deepEqual(result.inspectionSummary, { total: 62, returned: 50, truncated: true });
});

test("execute uploads a direct image before committing its durable asset path", async () => {
  const handlers = new Map();
  const requests = [];
  const source = {
    version: "2.15",
    children: [
      { id: "hero", type: "frame", x: 0, y: 0, width: 400, height: 240, children: [] },
    ],
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlY7iQAAAAASUVORK5CYII=",
    "base64",
  );
  const base = readableDocumentAccount(source, requests);
  globalThis.penkra = {
    account: {
      ...base,
      async request(request) {
        if (request.path.startsWith("/projects/document-1/blobs/") && request.path.includes("?offset=")) {
          requests.push(request);
          return response(200, { bytes: png.toString("base64"), complete: true });
        }
        if ((request.method ?? "GET") === "GET") return base.request(request);
        requests.push(request);
        if (request.path === "/projects/document-1/blobs/uploads") {
          const input = decodeJson(request.body);
          return response(200, {
            status: "ready",
            blob: {
              path: input.path,
              sha256: input.sha256,
              size: input.size,
              mimeType: input.mimeType,
            },
          });
        }
        if (request.path === "/projects/document-1/updates") {
          return response(200, { sequence: 8 });
        }
        if (request.path === "/projects/document-1/snapshots") {
          return response(200, { throughSequence: 8 });
        }
        throw new Error(`Unexpected request ${request.method} ${request.path}`);
      },
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?image-test=${Date.now()}`);
  const result = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: `Update("#hero", { fill: { type: "image", mode: "fill", url: "data:image/png;base64,${png.toString("base64")}" } }); TakeScreenshot(["#hero"]);`,
  });

  assert.equal(result.structuredContent.changed, true);
  assert.equal(result.structuredContent.sequence, 8);
  assert.match(result.structuredContent.operationId, /^[0-9a-f-]{36}$/u);
  assert.equal(result.content[0].mimeType, "image/png");
  const uploadIndex = requests.findIndex(
    (request) => request.path === "/projects/document-1/blobs/uploads",
  );
  const updateIndex = requests.findIndex(
    (request) => request.path === "/projects/document-1/updates",
  );
  assert.ok(uploadIndex >= 0 && updateIndex > uploadIndex);
  const updateBody = decodeJson(requests[updateIndex].body);
  assert.equal(updateBody.operation.id, result.structuredContent.operationId);
  assert.equal(typeof updateBody.operation.inverseUpdate, "string");
  assert.ok(updateBody.operation.inverseUpdate.length > 0);
  const snapshotStart = requests.find(
    (request) => request.path === "/projects/document-1/snapshots",
  );
  const projection = decodeJson(snapshotStart.body).projection;
  assert.match(projection.children[0].fill.url, /^images\/[a-f0-9]{64}\.png$/u);
});

test("documents.undo applies the backend's exact inverse and snapshots the restored document", async () => {
  const handlers = new Map();
  const requests = [];
  const operationId = "aa9a67db-63bf-4cba-937b-f9f0406eecb4";
  const original = {
    version: "2.15",
    children: [
      { id: "frame", type: "frame", name: "Original", x: 0, y: 0, width: 120, height: 80, children: [] },
    ],
  };
  const changed = {
    version: "2.15",
    children: [
      { id: "frame", type: "frame", name: "Changed", x: 0, y: 0, width: 120, height: 80, children: [] },
    ],
  };
  const changedModel = createDocumentModel(changed);
  const inverse = createDocumentOperationUpdates(changedModel, original).forward;
  const state = encodeState(changedModel);
  changedModel.doc.destroy();
  globalThis.penkra = {
    account: {
      async request(request) {
        requests.push(request);
        if (request.path === "/projects/document-1?chunked=auto") {
          return response(200, {
            id: "document-1",
            title: "Design",
            access: "owner",
            ownerAccountId: "account-1",
            snapshot: { throughSequence: 8, state, projection: changed },
            updates: [],
          });
        }
        if (request.path === "/projects/document-1/blobs") return response(200, { items: [] });
        if (request.path === "/projects/document-1/undo") {
          return response(200, {
            sequence: 9,
            duplicate: false,
            operationId,
            update: encodeUpdate(inverse),
          });
        }
        if (request.path === "/projects/document-1/snapshots") {
          return response(200, { throughSequence: 9 });
        }
        throw new Error(`Unexpected request ${request.method} ${request.path}`);
      },
      subscribe() {},
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?undo-test=${Date.now()}`);

  const result = await handlers.get("documents.undo")({
    documentId: "document-1",
    operationId,
  });

  assert.deepEqual(result, { documentId: "document-1", operationId, changed: true, sequence: 9 });
  const undoRequest = requests.find((request) => request.path === "/projects/document-1/undo");
  assert.match(decodeJson(undoRequest.body).clientUpdateId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(
    { ...decodeJson(undoRequest.body), clientUpdateId: "<uuid>" },
    { operationId, expectedSequence: 8, clientUpdateId: "<uuid>" },
  );
  const snapshotStart = requests.find(
    (request) => request.path === "/projects/document-1/snapshots",
  );
  assert.equal(decodeJson(snapshotStart.body).throughSequence, 9);
  const projection = decodeJson(snapshotStart.body).projection;
  assert.deepEqual(projection, original);
});
