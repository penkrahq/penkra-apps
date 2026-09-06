import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicLibraryItem,
  compareLibraryReleases,
  createLibraryRegistry,
  createLibraryRelease,
  releaseIdentity,
} from "./library-publication.mjs";

const hash = "0".repeat(64);

test("published asset manifests reject ambiguous paths and invalid MIME metadata", () => {
  const asset = { path: "images/logo.png", sha256: hash, size: 0, mimeType: "image/png" };
  const publish = (assets) => createLibraryRelease(library(), { libraryId: "ui", releaseId: "one", assets });
  for (const path of ["/logo.png", "../logo.png", "images/../logo.png", "images/./logo.png", "images//logo.png", "images/", "C:/logo.png", "images\\logo.png", "images/lo\u0000go.png", "images/cafe\u0301.png"]) {
    assert.throws(() => publish([{ ...asset, path }]), /canonical relative path/);
  }
  assert.throws(() => publish([asset, { ...asset }]), /duplicated/);
  for (const mimeType of [4, {}, "", "image/png\r\nInjected: true"]) {
    assert.throws(() => publish([{ ...asset, mimeType }]), /MIME type/);
  }
  assert.equal(publish([asset]).assets[0].path, asset.path);
});
function library(label = "One", publicItems = [
  { kind: "component", id: "card" },
  { kind: "variable", id: "color.brand" },
]) {
  return {
    module: "web", axes: {}, imports: {}, flows: [],
    variables: { "color.brand": { tokenType: "color", cascade: [{ value: label === "One" ? "#123" : "#456" }] }, secret: { tokenType: "number", cascade: [{ value: 4 }] } },
    paragraphStyles: { body: { fontSize: 16 } },
    library: { public: publicItems },
    children: [{ id: "card", type: "frame", children: [{ id: "label", type: "text", content: label, marks: [], paragraphs: [{ from: 0, to: label.length }] }] }, { id: "private", type: "rectangle" }],
  };
}

test("library releases have deterministic content identity and an explicit public surface", () => {
  const first = createLibraryRelease(library(), { libraryId: "ui", releaseId: "spring", assets: [{ path: "assets/a.png", sha256: hash, size: 0 }] });
  const repeated = createLibraryRelease(library(), { libraryId: "ui", releaseId: "spring", assets: [{ size: 0, sha256: hash, path: "assets/a.png" }] });
  assert.equal(first.contentHash, repeated.contentHash);
  assert.equal(assertPublicLibraryItem(first, "component", "card").id, "card");
  assert.throws(() => assertPublicLibraryItem(first, "component", "private"), /private or was removed/);
  assert.throws(() => assertPublicLibraryItem(first, "variable", "secret"), /private or was removed/);
});

test("follow imports see deliberate publications while pinned imports retain one release", async () => {
  const registry = createLibraryRegistry();
  const first = createLibraryRelease(library(), { libraryId: "ui", releaseId: "one" });
  const second = createLibraryRelease(library("Two"), { libraryId: "ui", releaseId: "two" });
  registry.publish(first);
  assert.deepEqual(releaseIdentity(await registry.resolve({ documentId: "ui", updatePolicy: "follow" })), releaseIdentity(first));
  registry.publish(second);
  assert.deepEqual(releaseIdentity(await registry.resolve({ documentId: "ui", updatePolicy: "follow", releaseId: "one", contentHash: first.contentHash })), releaseIdentity(first));
  assert.deepEqual(releaseIdentity(await registry.resolve({ documentId: "ui", updatePolicy: "follow" })), releaseIdentity(second));
  assert.deepEqual(releaseIdentity(await registry.resolve({ documentId: "ui", updatePolicy: "pinned", releaseId: "one", contentHash: first.contentHash })), releaseIdentity(first));
  assert.throws(() => registry.publish({ ...first, contentHash: second.contentHash }), /content hash does not match|different content/);
});

test("release comparison reports changed and removed public resources", () => {
  const first = createLibraryRelease(library(), { libraryId: "ui", releaseId: "one" });
  const second = createLibraryRelease(library("Two", [{ kind: "component", id: "card" }, { kind: "paragraphStyle", id: "body" }]), { libraryId: "ui", releaseId: "two" });
  assert.deepEqual(compareLibraryReleases(first, second), {
    libraryId: "ui",
    accepted: releaseIdentity(first),
    available: releaseIdentity(second),
    added: ["paragraphStyle:body"],
    removed: ["variable:color.brand"],
    changed: ["component:card"],
  });
});

test("registry forwards account identity to access control and fails closed", async () => {
  const observed = [];
  const registry = createLibraryRegistry({ canRead: (request) => { observed.push(request); return request.accountId === "allowed"; } });
  const release = createLibraryRelease(library(), { libraryId: "ui", releaseId: "one" });
  registry.publish(release);
  await assert.rejects(() => registry.resolve({ documentId: "ui", updatePolicy: "follow" }, { accountId: "denied" }), (error) => error.code === "CANVAS_LIBRARY_ACCESS_DENIED");
  await registry.resolve({ documentId: "ui", updatePolicy: "follow" }, { accountId: "allowed" });
  assert.deepEqual(observed.map((item) => item.accountId), ["denied", "allowed"]);
});

test("public change detection includes referenced private token values but excludes unrelated private edits", () => {
  const source = library();
  source.children[0].width = "${secret}";
  const first = createLibraryRelease(source, { libraryId: "ui", releaseId: "one" });
  source.variables.secret.cascade[0].value = 5;
  const second = createLibraryRelease(source, { libraryId: "ui", releaseId: "two" });
  assert.deepEqual(compareLibraryReleases(first, second).changed, ["component:card"]);
  source.children[1].name = "Unrelated private edit";
  const third = createLibraryRelease(source, { libraryId: "ui", releaseId: "three" });
  assert.deepEqual(compareLibraryReleases(second, third).changed, []);
});

test("public image resources require owned bytes and include their identity in change detection", () => {
  const document = library();
  document.children[0].fill = { type: "image", url: "images/logo.png" };
  const publish = (assets, releaseId) => createLibraryRelease(document, { libraryId: "ui", releaseId, assets });
  assert.throws(() => publish([], "one"), /no owned asset descriptor/);
  const first = publish([{ path: "images/logo.png", sha256: hash, size: 1 }], "one");
  const second = publish([{ path: "images/logo.png", sha256: "1".repeat(64), size: 1 }], "two");
  assert.deepEqual(compareLibraryReleases(first, second).changed, ["component:card"]);
  document.children[0].fill.url = "https://example.test/mutable.png";
  assert.throws(() => publish([], "three"), /materialize its bytes before publication/);
});
