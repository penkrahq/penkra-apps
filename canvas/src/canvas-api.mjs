import { decodeJson, encodeJson } from "./codec.mjs";

export function createCanvasApi(runtime = globalThis.penkra) {
  if (!runtime?.account) throw new Error("Canvas requires Penkra Account data support.");

  const request = async (path, options = {}) => {
    const response = await runtime.account.request({
      path: `/canvas${path}`,
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
      request(`/documents?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    createDocument: (input) => request("/documents", { method: "POST", body: input }),
    getDocument: (id) => request(`/documents/${encodeURIComponent(id)}`),
    renameDocument: (id, title) =>
      request(`/documents/${encodeURIComponent(id)}`, { method: "PATCH", body: { title } }),
    deleteDocument: (id) =>
      request(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
    appendUpdate: (id, input) =>
      request(`/documents/${encodeURIComponent(id)}/updates`, { method: "POST", body: input }),
    createSnapshot: (id, input) =>
      request(`/documents/${encodeURIComponent(id)}/snapshots`, { method: "POST", body: input }),
    listGrants: (id) => request(`/documents/${encodeURIComponent(id)}/grants`),
    grantAccess: (id, email) =>
      request(`/documents/${encodeURIComponent(id)}/grants`, {
        method: "POST",
        body: { email },
      }),
    revokeGrant: (id, grantId) =>
      request(
        `/documents/${encodeURIComponent(id)}/grants/${encodeURIComponent(grantId)}`,
        { method: "DELETE" },
      ),
    subscribe: (id, listener, options) =>
      runtime.account.subscribe(`document:${id}`, listener, options),
  };
}
