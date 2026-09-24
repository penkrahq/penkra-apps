import assert from "node:assert/strict";
import test from "node:test";
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
      if (request.path === "/projects/document-1/updates?afterSequence=7") {
        return response(200, {
          requiresSnapshot: false,
          latestSequence: 7,
          hasMore: false,
          updates: [],
        });
      }
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
    "documents.duplicate",
    "documents.execute",
    "documents.export",
    "documents.extract",
    "documents.list",
    "documents.move",
    "documents.open",
    "documents.rename",
    "documents.restore",
    "documents.trash",
    "documents.undo",
    "folders.create",
    "folders.list",
    "folders.move",
    "folders.rename",
    "folders.restore",
    "folders.sharing.add",
    "folders.sharing.list",
    "folders.sharing.remove",
    "folders.trash",
    "icons.search",
    "sharing.add",
    "sharing.list",
    "sharing.remove",
  ]);
  assert.deepEqual(
    await handlers.get("documents.open")({ documentId: "document-1" }, context),
    { documentId: "document-1", tabId: "tab-1" },
  );
  assert.deepEqual(
    await handlers.get("icons.search")({ query: "loader", library: "lucide", limit: 2 }),
    {
      items: [
        { library: "lucide", icon: "loader" },
        { library: "lucide", icon: "loader-circle" },
      ],
      total: 4,
      truncated: true,
    },
  );
});

test("documents.rename updates only document metadata and returns the saved title", async () => {
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: {
      async request(request) {
        requests.push(request);
        return response(200, {
          id: "bbae45e7-a867-42c6-9727-af47f4644c23",
          title: "Launch system",
          access: "owner",
        });
      },
      subscribe() {},
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?rename-test=${Date.now()}`);

  const result = await handlers.get("documents.rename")({
    documentId: "bbae45e7-a867-42c6-9727-af47f4644c23",
    title: "Launch system",
  });

  assert.deepEqual(result, {
    documentId: "bbae45e7-a867-42c6-9727-af47f4644c23",
    title: "Launch system",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "PATCH");
  assert.equal(requests[0].path, "/projects/bbae45e7-a867-42c6-9727-af47f4644c23");
  assert.deepEqual(decodeJson(requests[0].body), { title: "Launch system" });
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
    "/projects?limit=100&projectionFields=module&view=all",
    "/projects?limit=100&projectionFields=module&view=all&cursor=page-2",
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
  const source = {
    version: "2.15",
    children: [
      { id: "frame", type: "frame", x: 10, y: 20, width: 200, height: 100, children: [] },
    ],
  };
  const original = structuredClone(source);
  globalThis.penkra = {
    account: readableDocumentAccount(source, requests),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?read-test=${Date.now()}`);
  const result = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: 'Print(Get("#frame")[0].bounds); return "frame";',
  });

  assert.equal(result.changed, false);
  assert.equal(result.issueSummary.inspected, true);
  assert.equal(result.operationId, null);
  assert.equal(result.sequence, 7);
  assert.deepEqual(result.touchedNodeIds, []);
  assert.equal(result.prints[0].width, 200);
  assert.equal(requests.some((request) => request.method === "POST"), false);
  assert.deepEqual(source, original);
  const repeated = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: 'return Get("#frame")[0].node.id;',
  });
  assert.equal(repeated.result, "frame");
  assert.equal(repeated.issueSummary.inspected, false);
  assert.equal(
    requests.filter((request) => request.path === "/projects/document-1?chunked=auto").length,
    1,
  );
  assert.equal(
    requests.filter((request) => request.path === "/projects/document-1/updates?afterSequence=7").length,
    1,
  );
});

test("execute summarizes review issues by default and permits an explicit full audit", async () => {
  const handlers = new Map();
  const requests = [];
  const source = { version: "2.17", children: [{
    id: "frame", type: "frame", width: 100, height: 100, children: Array.from({ length: 25 }, (_, index) => ({
      id: `out-${index}`, type: "rectangle", layoutPosition: "absolute", x: 120 + index, y: 0, width: 10, height: 10,
    })),
  }] };
  globalThis.penkra = {
    account: readableDocumentAccount(source, requests),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?issues-test=${Date.now()}`);
  const input = { documentId: "document-1", code: 'return Get("#frame")[0].bounds;' };
  const summary = await handlers.get("documents.execute")(input);
  assert.equal(summary.issueSummary.total, 25);
  assert.equal(summary.issueSummary.inspected, true);
  assert.equal(summary.issues.length, 20);
  assert.equal(summary.issueSummary.omitted, 5);
  const full = await handlers.get("documents.execute")({ ...input, issueDetail: "all" });
  assert.equal(full.issues.length, 25);
  assert.equal(full.issueSummary.omitted, 0);
  assert.equal(requests.some((request) => request.method === "POST"), false);
});

test("a projection-based edit rehydrates once and rejects a newer authoritative sequence", async () => {
  const handlers = new Map();
  const requests = [];
  const source = {
    version: "2.15",
    children: [
      { id: "frame", type: "frame", name: "Before", x: 0, y: 0, width: 120, height: 80, children: [] },
    ],
  };
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  let metadataReads = 0;
  globalThis.penkra = {
    account: {
      async request(request) {
        requests.push(request);
        if (request.path === "/projects/document-1?chunked=auto") {
          metadataReads += 1;
          return response(200, {
            id: "document-1",
            title: "Design",
            access: "owner",
            ownerAccountId: "account-1",
            snapshot: {
              throughSequence: metadataReads === 1 ? 7 : 8,
              state,
              projection: source,
            },
            updates: [],
          });
        }
        if (request.path === "/projects/document-1/blobs") return response(200, { items: [] });
        throw new Error(`Unexpected request ${request.method} ${request.path}`);
      },
      subscribe() {},
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?conflict-test=${Date.now()}`);

  await assert.rejects(
    handlers.get("documents.execute")({
      documentId: "document-1",
      code: 'Update("#frame", { name: "After" });',
    }),
    (error) => error.code === "CANVAS_DOCUMENT_CONFLICT",
  );

  assert.equal(metadataReads, 2);
  assert.equal(requests.some((request) => (request.method ?? "GET") === "POST"), false);
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

test("execute converts a durable SVG asset into an atomic editable-path copy", async () => {
  const handlers = new Map();
  const requests = [];
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#2563eb"/></svg>',
  );
  const descriptor = {
    path: "images/logo.svg",
    sha256: "f".repeat(64),
    size: svg.byteLength,
    mimeType: "image/svg+xml",
  };
  const source = {
    version: "2.17",
    children: [{
      id: "logo",
      type: "rectangle",
      name: "Placed logo",
      width: 100,
      height: 100,
      fill: { type: "image", url: descriptor.path, mode: "fit" },
    }],
  };
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
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
            assets: [descriptor],
            snapshot: { throughSequence: 7, state, projection: source },
            updates: [],
          });
        }
        if (request.path === "/projects/document-1/blobs") return response(200, { items: [descriptor] });
        if (request.path === `/projects/document-1/blobs/${descriptor.sha256}?offset=0`) {
          return response(200, { bytes: svg.toString("base64"), complete: true });
        }
        if (request.path === "/projects/document-1/updates") return response(200, { sequence: 8 });
        if (request.path === "/projects/document-1/snapshots") return response(200, { throughSequence: 8 });
        throw new Error(`Unexpected request ${request.method} ${request.path}`);
      },
      subscribe() {},
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?svg-convert-test=${Date.now()}`);

  const result = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: 'return ConvertSvgToVectors("#logo");',
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.svgConversions, [{
    sourceNodeId: "logo",
    createdNodeId: "logo-editable",
    shapeCount: 1,
    mode: "copy",
    fidelity: "exact",
    warnings: [],
  }]);
  const snapshot = decodeJson(requests.find((request) => request.path === "/projects/document-1/snapshots").body).projection;
  assert.equal(snapshot.children[0].fill.url, descriptor.path);
  assert.equal(snapshot.children[1].id, "logo-editable");
  assert.equal(snapshot.children[1].children[0].type, "path");
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
