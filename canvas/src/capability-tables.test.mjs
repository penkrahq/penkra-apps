import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_TABLES,
  assertAllCapabilityTables,
  capabilityTableFor,
  extractionEmissionSupport,
  mergeCapabilityRows,
  unverifiedCapabilityEntries,
} from "./capability-tables.mjs";

test("capability composition rejects conflicting rows in either order", () => {
  for (const path of ["nodes.path", "nodes.polygon", "properties.geometry", "properties.viewBox", "properties.fillRule", "properties.stroke.width"]) {
    const native = { [path]: { verdict: "native" } };
    const raster = { [path]: { verdict: "raster" } };
    const unverified = { [path]: { verdict: null, status: "unverified" } };
    for (const groups of [[native, raster], [raster, native], [raster, unverified], [unverified, raster]]) {
      assert.throws(() => mergeCapabilityRows(groups));
    }
    assert.throws(() => mergeCapabilityRows([native, native]));
  }
  assert.deepEqual(mergeCapabilityRows([{ a: { verdict: "native" } }, { b: { verdict: "raster" } }]), {
    a: { verdict: "native" }, b: { verdict: "raster" },
  });
});

test("all static exporters ignore prototype flows by dated product decision", () => {
  const paths = ["root.flows", "relationships.flow", "properties.flow.advance", "properties.flow.hover", "properties.flow.keypress", "properties.flow.tap"];
  for (const [target, table] of Object.entries(CAPABILITY_TABLES)) {
    for (const path of paths) {
      assert.equal(table.properties[path].verdict, "ignore", `${target}:${path}`);
      assert.match(table.properties[path].reason, /Product decision 2026-09-04/u);
    }
  }
});

test("deliverable capability keys are formats, with extraction and PDF profiles kept separate", () => {
  assert.deepEqual(Object.keys(CAPABILITY_TABLES), ["pptx", "html", "swift", "kotlin"]);
  for (const nonFormat of ["slide", "page", "route", "ios", "android", "pdf", "svg", "__proto__"]) assert.equal(capabilityTableFor(nonFormat), null);
  assert.equal(capabilityTableFor("pptx").properties["roles.slide"].verdict, "native");
  assert.equal(capabilityTableFor("html").properties["roles.route"].verdict, "native");
  assert.equal(extractionEmissionSupport("pdf").kind, "roleless-node-lowerings");
  assert.equal(Object.keys(extractionEmissionSupport("pdf").properties).some((path) => path.startsWith("roles.")), false);
  assert.ok(extractionEmissionSupport("svg"));
});

test("only visually measured vector profiles have native verdicts", () => {
  const tables = { ...CAPABILITY_TABLES, svg: extractionEmissionSupport("svg") };
  for (const [format, table] of Object.entries(tables)) {
    for (const path of ["nodes.path", "nodes.polygon", "properties.geometry", "properties.viewBox", "properties.fillRule"]) {
      assert.equal(table.properties[path].status, undefined, `${format}:${path}`);
      assert.equal(table.properties[path].verdict, "native", `${format}:${path}`);
    }
  }
});

test("aggregate capability gate is total with unmeasured mobile rows rasterized", () => {
  const entries = unverifiedCapabilityEntries();
  assert.deepEqual(entries, []);
  assert.equal(entries.some((entry) => entry.path === "profile"), false);
  assert.equal(entries.some((entry) => entry.path === "root.flows"), false);
  assert.equal(entries.some((entry) => entry.path === "relationships.flow"), false);
  assert.equal(assertAllCapabilityTables(), true);
  for (const format of ["swift", "kotlin"]) {
    assert.equal(capabilityTableFor(format).properties["nodes.text"].verdict, "raster");
    assert.equal(capabilityTableFor(format).properties["root.axes"].verdict, "raster");
  }
});

test("scroll containers are live only in interactive deliverables and static elsewhere", () => {
  for (const format of ["html", "swift", "kotlin"]) {
    const entry = capabilityTableFor(format).properties["properties.overflow"];
    assert.equal(entry.verdict, "native", format);
    assert.ok(entry.evidence, format);
  }
  assert.equal(extractionEmissionSupport("svg").properties["properties.overflow"].verdict, "native");
  for (const [format, table] of [["pptx", capabilityTableFor("pptx")], ["pdf", extractionEmissionSupport("pdf")]]) {
    const entry = table.properties["properties.overflow"];
    assert.equal(entry.verdict, "raster", format);
    assert.match(entry.reason, /static|scrolling viewport|clipped viewport/iu, format);
  }
});

test("mobile shadow spread is an explicit raster limitation", () => {
  for (const format of ["swift", "kotlin"]) {
    const entry = capabilityTableFor(format).properties["properties.effect.shadow.spread"];
    assert.equal(entry.verdict, "raster");
    assert.match(entry.reason, /no native shadow-spread parameter/u);
  }
});

test("mobile icon vocabulary uses the deterministic raster fallback", () => {
  for (const format of ["swift", "kotlin"]) {
    const table = capabilityTableFor(format).properties;
    for (const path of ["nodes.icon", "properties.icon", "properties.library", "properties.weight"]) {
      assert.equal(table[path].verdict, "raster", `${format}:${path}`);
      assert.equal(table[path].status, undefined, `${format}:${path}`);
    }
  }
});

test("mobile landmark and link-purpose fields are intentional semantic omissions", () => {
  for (const format of ["swift", "kotlin"]) {
    const table = capabilityTableFor(format).properties;
    for (const path of ["properties.accessibility.landmark", "properties.accessibility.linkName"]) {
      assert.equal(table[path].verdict, "ignore", `${format}:${path}`);
      assert.match(table[path].reason, /without inventing navigation behavior/u);
    }
  }
});

test("HTML fallback inventory contains only objective platform limits and meaningless static-route fields", () => {
  const properties = capabilityTableFor("html").properties;
  assert.deepEqual(Object.entries(properties).filter(([, entry]) => entry.verdict === "raster").map(([path]) => path), [
    "properties.fill.gradient.mesh", "properties.fill.shader", "properties.stroke.align",
  ]);
  assert.deepEqual(Object.entries(properties).filter(([, entry]) => entry.verdict === "ignore").map(([path]) => path), [
    "properties.bleed", "properties.flow.advance", "properties.flow.hover", "properties.flow.keypress", "properties.flow.tap",
    "properties.folds", "properties.safeMargin", "relationships.flow", "relationships.notesFor", "roles.android", "roles.ios", "roles.slide", "root.flows",
  ]);
  for (const [path, entry] of Object.entries(properties).filter(([, value]) => ["raster", "ignore"].includes(value.verdict))) {
    assert.doesNotMatch(entry.reason, /current (?:HTML|writer)|no measured|unverified/iu, path);
  }
});
