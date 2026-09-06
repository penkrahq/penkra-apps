import assert from "node:assert/strict";
import test from "node:test";
import { compareLibraryReleases, createLibraryRelease, preparePublicLibraryItemContent } from "./library-publication.mjs";
import { resolveCanvasDocument } from "./canvas-resolver.mjs";

function fixture() {
  return createLibraryRelease({
    module: "generic", axes: {}, imports: {}, flows: [],
    library: { public: [{ kind: "component", id: "card" }] },
    variables: {
      ink: { tokenType: "color", cascade: [{ value: "${primitive}" }] },
      primitive: { tokenType: "color", cascade: [{ value: "#123456" }] },
      unused: { tokenType: "color", cascade: [{ value: "#ffffff" }] },
    },
    paragraphStyles: { body: { fill: "${ink}", fontSize: 16 }, unused: { fontSize: 99 } },
    children: [
      { id: "card", type: "frame", children: [
        { id: "text", type: "text", content: "Retained", paragraphs: [{ from: 0, to: 8, style: "body" }] },
        { id: "picture", type: "rectangle", fill: { type: "image", url: "images/used.png" } },
      ] },
      { id: "private", type: "frame", children: [] },
    ],
  }, { libraryId: "library", releaseId: "release-one", assets: [
    { path: "images/used.png", sha256: "1".repeat(64), size: 5 },
    { path: "images/unused.png", sha256: "2".repeat(64), size: 9 },
  ] });
}

test("accepted item preparation includes transitive private dependencies but excludes unrelated content", () => {
  const release = fixture();
  const prepared = preparePublicLibraryItemContent(release, "component", "card");
  assert.deepEqual(prepared.release, { libraryId: "library", releaseId: "release-one", contentHash: release.contentHash });
  assert.deepEqual(prepared.item, release.publicItems[0]);
  assert.deepEqual(prepared.content.resources.map(([key]) => key), ["component:card", "paragraphStyle:body", "variable:ink", "variable:primitive"]);
  assert.deepEqual(prepared.content.assets.map(({ path }) => path), ["images/used.png"]);
  assert.deepEqual(prepared.content.dependencies, []);
});

test("item preparation does not expose a private root or accept tampered release content", () => {
  const release = fixture();
  assert.throws(() => preparePublicLibraryItemContent(release, "component", "private"), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  assert.throws(() => preparePublicLibraryItemContent(release, "variable", "primitive"), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  release.document.variables.primitive.cascade[0].value = "#ffffff";
  assert.throws(() => preparePublicLibraryItemContent(release, "component", "card"), { code: "CANVAS_LIBRARY_INVALID" });
});

test("prepared item content is detached from the release and from other callers", () => {
  const release = fixture();
  const before = structuredClone(release);
  const first = preparePublicLibraryItemContent(release, "component", "card");
  first.item.id = "changed";
  first.content.resources[0][1].children[0].content = "Changed";
  first.content.assets[0].path = "changed.png";
  assert.deepEqual(release, before);
  assert.equal(preparePublicLibraryItemContent(release, "component", "card").content.resources[0][1].children[0].content, "Retained");
});

test("public item identity and retained content include owning axis defaults", () => {
  const base = fixture();
  const source = base.document;
  source.axes = { appearance: { modes: [{ name: "light" }, { name: "dark" }] } };
  source.variables.primitive.cascade.push({ value: "#ffffff", when: { appearance: "dark" } });
  const first = createLibraryRelease(source, { libraryId: "library", releaseId: "one", assets: base.assets });
  const before = resolveCanvasDocument(source).document.paragraphStyles.body.fill;
  source.axes.appearance.modes.reverse();
  const second = createLibraryRelease(source, { libraryId: "library", releaseId: "two", assets: base.assets });
  const after = resolveCanvasDocument(source).document.paragraphStyles.body.fill;
  assert.equal(before, "#123456");
  assert.equal(after, "#ffffff");
  assert.deepEqual(compareLibraryReleases(first, second).changed, ["component:card"]);
  const prepared = preparePublicLibraryItemContent(second, "component", "card");
  assert.deepEqual(prepared.content.axes, source.axes);
  prepared.content.axes.appearance.modes.reverse();
  assert.equal(second.document.axes.appearance.modes[0].name, "dark");
});
