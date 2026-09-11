import { base64ToBytes, bytesToBase64, decodeJson, encodeJson } from "./codec.mjs";

// This mirrors the host's documented Account-data request-body boundary. Use
// the direct snapshot endpoint whenever the exact encoded request fits; the
// multipart transfer remains the lossless path for larger valid snapshots.
const ACCOUNT_DATA_MAX_REQUEST_BYTES = 24 * 1024 * 1024;

export function createCanvasApi(runtime = globalThis.penkra) {
  if (!runtime?.account) throw new Error("Canvas requires Penkra Account data support.");

  const request = async (path, options = {}) => {
    const response = await runtime.account.request({
      path: `/projects${path}`,
      method: options.method ?? "GET",
      ...(options.body === undefined
        ? {}
        : { body: encodeJson(options.body), contentType: "application/json" }),
    });
    let value;
    try { value = response.body.byteLength > 0 ? decodeJson(response.body) : null; }
    catch (cause) { throw new Error(`Invalid JSON response for /projects${path} (${response.body.byteLength} bytes): ${cause.message}`, { cause }); }
    if (response.status < 200 || response.status >= 300) {
      const message = value?.message ?? "Canvas request failed";
      const error = new Error(`${message} (${response.status}; ${options.method ?? "GET"} /projects${path}).`);
      error.code = value?.code ?? "CANVAS_REQUEST_FAILED";
      error.status = response.status;
      throw error;
    }
    return value;
  };

  const api = {
    listDocuments: (cursor) =>
      request(`?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    listTrash: (cursor) =>
      request(`/trash?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    createDocument: ({ source, initialUpdate, ...input }) =>
      uploadSnapshot(request, null, {
        ...input,
        projection: source,
        state: base64ToBytes(initialUpdate),
      }),
    getDocumentHead: (id) =>
      request(`/${encodeURIComponent(id)}?chunked=auto`),
    getDocument: async (id) => {
      const encoded = encodeURIComponent(id);
      const project = await request(`/${encoded}?chunked=auto`);
      const assets = await request(`/${encoded}/blobs`);
      const snapshot = project.snapshot.chunked
        ? await readChunkedSnapshot(request, encoded, project.snapshot)
        : { ...project.snapshot, source: project.snapshot.projection };
      return {
        ...project,
        snapshot,
        assets: assets.items,
      };
    },
    getDocumentProjection: async (id) => {
      const encoded = encodeURIComponent(id);
      const project = await request(`/${encoded}?chunked=auto`);
      if ((project.updates ?? []).length > 0) return null;
      const source = project.snapshot.chunked
        ? decodeJson(await readSnapshotContent(request, encoded, project.snapshot.throughSequence, "projection", project.snapshot.projectionBytes))
        : project.snapshot.projection;
      return { ...project, snapshot: { ...project.snapshot, source } };
    },
    getDocumentState: async (id) => {
      const encoded = encodeURIComponent(id);
      // Library labels must not use the opening endpoint: that endpoint updates
      // lastOpenedAt. Do not fall back when an older backend lacks state reads.
      const project = await request(`/${encoded}/state?chunked=auto`);
      const state = project.snapshot.chunked
        ? bytesToBase64(await readSnapshotContent(request, encoded, project.snapshot.throughSequence, "state", project.snapshot.stateBytes))
        : project.snapshot.state;
      return { snapshot: { state }, updates: project.updates ?? [] };
    },
    listAssets: async (id) => {
      const assets = await request(`/${encodeURIComponent(id)}/blobs`);
      return assets.items;
    },
    renameDocument: (id, title) =>
      request(`/${encodeURIComponent(id)}`, { method: "PATCH", body: { title } }),
    deleteDocument: (id) =>
      request(`/${encodeURIComponent(id)}`, { method: "DELETE" }),
    restoreDocument: (id) =>
      request(`/${encodeURIComponent(id)}/restore`, { method: "POST" }),
    permanentlyDeleteDocument: (id) =>
      request(`/${encodeURIComponent(id)}/permanent`, { method: "DELETE" }),
    appendUpdate: (id, input) =>
      request(`/${encodeURIComponent(id)}/updates`, { method: "POST", body: input }),
    undoOperation: (id, input) =>
      request(`/${encodeURIComponent(id)}/undo`, { method: "POST", body: input }),
    createSnapshot: (id, { source, state, ...input }) => {
      const snapshot = { ...input, state, projection: source };
      return encodeJson(snapshot).byteLength <= ACCOUNT_DATA_MAX_REQUEST_BYTES
        ? request(`/${encodeURIComponent(id)}/snapshots`, { method: "POST", body: snapshot })
        : uploadSnapshot(request, id, {
          ...input,
          projection: source,
          state: base64ToBytes(state),
        });
    },
    listGrants: (id) => request(`/${encodeURIComponent(id)}/grants`),
    grantAccess: (id, email) =>
      request(`/${encodeURIComponent(id)}/grants`, {
        method: "POST",
        body: { email },
      }),
    revokeGrant: (id, grantId) =>
      request(
        `/${encodeURIComponent(id)}/grants/${encodeURIComponent(grantId)}`,
        { method: "DELETE" },
      ),
    subscribe: (id, listener, options = {}) =>
      runtime.account.subscribe(`project:${id}`, listener, options),
    subscribeToDocuments: (listener, options) =>
      runtime.account.subscribe("projects", listener, options),
    uploadAsset: async (id, asset) => {
      const snapshot = snapshotUploadAsset(asset);
      const root = `/${encodeURIComponent(id)}/blobs/uploads`;
      const started = await request(root, {
        method: "POST",
        body: {
          path: snapshot.path,
          sha256: snapshot.sha256,
          size: snapshot.bytes.byteLength,
          mimeType: snapshot.mimeType,
        },
      });
      if (!isReceiptObject(started)) throw uploadReceiptInvalid("Canvas asset upload returned an invalid start receipt.");
      if (started.status === "ready") return uploadedAsset(started.blob, snapshot);
      const chunkSize = started.chunkSize;
      if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw uploadReceiptInvalid("Canvas asset upload returned an invalid chunk size.");
      for (let offset = 0, part = 1; offset < snapshot.bytes.byteLength; offset += chunkSize, part += 1) {
        await request(`${root}/${encodeURIComponent(started.uploadId)}/parts`, {
          method: "POST",
          body: { part, bytes: bytesToBase64(snapshot.bytes.subarray(offset, offset + chunkSize)) },
        });
      }
      const completed = await request(`${root}/${encodeURIComponent(started.uploadId)}/complete`, {
        method: "POST",
      });
      if (!isReceiptObject(completed)) throw uploadReceiptInvalid("Canvas asset upload returned an invalid completion receipt.");
      return uploadedAsset(completed.blob, snapshot);
    },
    generateImage: (id, input) =>
      request(`/${encodeURIComponent(id)}/images/generate`, {
        method: "POST",
        body: input,
      }),
    readAsset: async (id, asset) => {
      const chunks = [];
      let offset = 0;
      while (offset < asset.size || chunks.length === 0) {
        const result = await request(
          `/${encodeURIComponent(id)}/blobs/${asset.sha256}?offset=${offset}`,
        );
        const bytes = base64ToBytes(result.bytes);
        if (!bytes.byteLength && !result.complete) throw new Error(`Empty asset range for ${asset.path}.`);
        chunks.push(bytes);
        offset += bytes.byteLength;
        if (result.complete || offset >= asset.size) break;
      }
      const output = new Uint8Array(offset);
      let cursor = 0;
      for (const chunk of chunks) {
        output.set(chunk, cursor);
        cursor += chunk.byteLength;
      }
      return output;
    },
  };
  return api;
}

function snapshotUploadAsset(asset) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)
    || typeof asset.path !== "string" || !asset.path
    || typeof asset.sha256 !== "string" || !asset.sha256
    || (asset.mimeType !== undefined && typeof asset.mimeType !== "string")
    || !(asset.bytes instanceof Uint8Array)) throw uploadReceiptInvalid("Canvas asset upload metadata is invalid.");
  return { path: asset.path, sha256: asset.sha256, mimeType: asset.mimeType, bytes: new Uint8Array(asset.bytes) };
}

function uploadedAsset(blob, snapshot) {
  if (!isReceiptObject(blob)
    || blob.sha256 !== snapshot.sha256 || blob.size !== snapshot.bytes.byteLength) {
    throw uploadReceiptInvalid("Canvas asset upload returned invalid blob metadata.");
  }
  // The Account blob projection identifies content, while the Pencil-relative
  // path belongs to this document and is supplied on upload. Preserve that
  // requested path at the Canvas boundary so callers always receive the
  // durable fill URL, even when the backend projection omits it.
  return { ...blob, path: snapshot.path };
}

function isReceiptObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function uploadReceiptInvalid(message) { const error = new Error(message); error.code = "CANVAS_ASSET_UPLOAD_RECEIPT_INVALID"; throw error; }

async function readChunkedSnapshot(request, encodedProjectId, snapshot) {
  const [projectionBytes, stateBytes] = await Promise.all([
    readSnapshotContent(request, encodedProjectId, snapshot.throughSequence, "projection", snapshot.projectionBytes),
    readSnapshotContent(request, encodedProjectId, snapshot.throughSequence, "state", snapshot.stateBytes),
  ]);
  const projection = decodeJson(projectionBytes);
  return {
    ...snapshot,
    state: bytesToBase64(stateBytes),
    projection,
    source: projection,
  };
}

async function uploadSnapshot(request, projectId, input) {
  const projection = encodeJson(input.projection);
  const state = input.state;
  const root = projectId
    ? `/${encodeURIComponent(projectId)}/snapshot-uploads`
    : "/snapshot-uploads";
  const started = await request(root, {
    method: "POST",
    body: {
      ...(projectId ? { throughSequence: input.throughSequence } : { title: input.title }),
      projection: { size: projection.byteLength, sha256: await sha256(projection) },
      state: { size: state.byteLength, sha256: await sha256(state) },
    },
  });
  const partsRoot = `/snapshot-uploads/${encodeURIComponent(started.uploadId)}`;
  try {
    for (const [kind, bytes] of [["projection", projection], ["state", state]]) {
      for (let offset = 0, part = 1; offset < bytes.byteLength; offset += started.chunkSize, part += 1) {
        await request(`${partsRoot}/parts`, {
          method: "POST",
          body: {
            kind,
            part,
            bytes: bytesToBase64(bytes.subarray(offset, offset + started.chunkSize)),
          },
        });
      }
    }
    return await request(`${partsRoot}/complete`, { method: "POST" });
  } catch (error) {
    await request(partsRoot, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}

async function readSnapshotContent(request, encodedProjectId, throughSequence, kind, totalBytes) {
  const chunks = [];
  let offset = 0;
  for (;;) {
    const result = await request(
      `/${encodedProjectId}/snapshots/${throughSequence}/content?kind=${kind}&offset=${offset}`,
    );
    // The range endpoint serializes PostgreSQL JSONB text, whose whitespace
    // differs from the compact projection size in document metadata.
    if (offset === 0 && Number.isSafeInteger(result.totalBytes)) totalBytes = result.totalBytes;
    const bytes = base64ToBytes(result.bytes);
    chunks.push(bytes);
    offset += bytes.byteLength;
    if (result.complete) break;
    if (bytes.byteLength === 0) throw new Error(`Could not finish reading Canvas ${kind}.`);
    if (Number.isSafeInteger(totalBytes) && totalBytes > offset) {
      // Learn a valid range size from the server's default response rather than
      // assuming a deployed maximum. Bound concurrency while reading the exact
      // immutable snapshot selected above; no snapshot write or compaction occurs.
      const rangeSize = bytes.byteLength;
      const remaining = Math.ceil((totalBytes - offset) / rangeSize);
      const tail = new Array(remaining);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, remaining) }, async () => {
        for (;;) {
          const index = next++;
          if (index >= remaining) break;
          const position = offset + index * rangeSize;
          const length = Math.min(rangeSize, totalBytes - position);
          const part = await request(`/${encodedProjectId}/snapshots/${throughSequence}/content?kind=${kind}&offset=${position}&length=${length}`);
          const content = base64ToBytes(part.bytes);
          if (content.byteLength !== length) throw new Error(`Incomplete Canvas ${kind} range at ${position}.`);
          tail[index] = content;
        }
      }));
      chunks.push(...tail);
      offset = totalBytes;
      break;
    }
  }
  if (Number.isSafeInteger(totalBytes) && offset !== totalBytes) throw new Error(`Canvas ${kind} length does not match snapshot metadata.`);
  const output = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return output;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
