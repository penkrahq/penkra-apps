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
    createDocument: ({ source, ...input }) => request("", {
      method: "POST",
      body: { ...input, projection: source },
    }),
    getDocument: async (id) => {
      const encoded = encodeURIComponent(id);
      const [project, assets] = await Promise.all([
        request(`/${encoded}`),
        request(`/${encoded}/blobs`),
      ]);
      return {
        ...project,
        snapshot: { ...project.snapshot, source: project.snapshot.projection },
        assets: assets.items,
      };
    },
    renameDocument: (id, title) =>
      request(`/${encodeURIComponent(id)}`, { method: "PATCH", body: { title } }),
    deleteDocument: (id) =>
      request(`/${encodeURIComponent(id)}`, { method: "DELETE" }),
    appendUpdate: (id, input) =>
      request(`/${encodeURIComponent(id)}/updates`, { method: "POST", body: input }),
    createSnapshot: (id, { source, ...input }) =>
      request(`/${encodeURIComponent(id)}/snapshots`, {
        method: "POST",
        body: { ...input, projection: source },
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
      if (started.status === "ready") return started.blob;
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
      return completed.blob;
    },
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
