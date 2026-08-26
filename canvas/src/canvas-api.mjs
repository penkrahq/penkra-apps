import { base64ToBytes, bytesToBase64, decodeJson, encodeJson } from "./codec.mjs";

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
    const value = response.body.byteLength > 0 ? decodeJson(response.body) : null;
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(value?.message ?? `Canvas request failed (${response.status}).`);
      error.code = value?.code ?? "CANVAS_REQUEST_FAILED";
      error.status = response.status;
      throw error;
    }
    return value;
  };

  return {
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
    getDocument: async (id) => {
      const encoded = encodeURIComponent(id);
      const [project, assets] = await Promise.all([
        request(`/${encoded}?chunked=auto`),
        request(`/${encoded}/blobs`),
      ]);
      const snapshot = project.snapshot.chunked
        ? await readChunkedSnapshot(request, encoded, project.snapshot)
        : { ...project.snapshot, source: project.snapshot.projection };
      return {
        ...project,
        snapshot,
        assets: assets.items,
      };
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
    createSnapshot: (id, { source, state, ...input }) =>
      uploadSnapshot(request, id, {
        ...input,
        projection: source,
        state: base64ToBytes(state),
      }),
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
    subscribe: (id, listener, options) =>
      runtime.account.subscribe(`project:${id}`, listener, options),
    uploadAsset: async (id, asset) => {
      const root = `/${encodeURIComponent(id)}/blobs/uploads`;
      const started = await request(root, {
        method: "POST",
        body: {
          path: asset.path,
          sha256: asset.sha256,
          size: asset.bytes.byteLength,
          mimeType: asset.mimeType,
        },
      });
      if (started.status === "ready") return uploadedAsset(started.blob, asset.path);
      const chunkSize = started.chunkSize;
      for (let offset = 0, part = 1; offset < asset.bytes.byteLength; offset += chunkSize, part += 1) {
        await request(`${root}/${encodeURIComponent(started.uploadId)}/parts`, {
          method: "POST",
          body: { part, bytes: bytesToBase64(asset.bytes.subarray(offset, offset + chunkSize)) },
        });
      }
      const completed = await request(`${root}/${encodeURIComponent(started.uploadId)}/complete`, {
        method: "POST",
      });
      return uploadedAsset(completed.blob, asset.path);
    },
    generateImage: (id, input) =>
      request(`/${encodeURIComponent(id)}/images/generate`, {
        method: "POST",
        body: input,
      }),
    readAsset: async (id, asset) => {
      const chunks = [];
      let offset = 0;
      while (offset < asset.size) {
        const result = await request(
          `/${encodeURIComponent(id)}/blobs/${asset.sha256}?offset=${offset}&length=${8 * 1024 * 1024}`,
        );
        const bytes = base64ToBytes(result.bytes);
        chunks.push(bytes);
        offset += bytes.byteLength;
        if (result.complete) break;
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
}

function uploadedAsset(blob, path) {
  if (!blob || typeof blob !== "object") {
    throw new Error("Canvas asset upload completed without blob metadata.");
  }
  // The Account blob projection identifies content, while the Pencil-relative
  // path belongs to this document and is supplied on upload. Preserve that
  // requested path at the Canvas boundary so callers always receive the
  // durable fill URL, even when the backend projection omits it.
  return { ...blob, path };
}

async function readChunkedSnapshot(request, encodedProjectId, snapshot) {
  const [projectionBytes, stateBytes] = await Promise.all([
    readSnapshotContent(request, encodedProjectId, snapshot.throughSequence, "projection"),
    readSnapshotContent(request, encodedProjectId, snapshot.throughSequence, "state"),
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

async function readSnapshotContent(request, encodedProjectId, throughSequence, kind) {
  const chunks = [];
  let offset = 0;
  for (;;) {
    const result = await request(
      `/${encodedProjectId}/snapshots/${throughSequence}/content?kind=${kind}&offset=${offset}&length=${1024 * 1024}`,
    );
    const bytes = base64ToBytes(result.bytes);
    chunks.push(bytes);
    offset += bytes.byteLength;
    if (result.complete) break;
    if (bytes.byteLength === 0) throw new Error(`Could not finish reading Canvas ${kind}.`);
  }
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
