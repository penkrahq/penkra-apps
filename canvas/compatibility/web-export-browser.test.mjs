import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { buildExporterIR } from "../src/exporter-ir.mjs";
import { exportWeb } from "../src/exporters/web.mjs";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const document = {
  version: "2.15",
  module: "web",
  lang: "en-GB",
  axes: {
    appearance: { modes: [{ name: "light" }, { name: "dark", media: "prefers-color-scheme: dark" }] },
    viewport: { modes: [{ name: "mobile", minWidth: 0 }, { name: "wide", minWidth: 900 }] },
  },
  variables: {},
  paragraphStyles: {},
  imports: {},
  flows: [],
  children: [{
    id: "route",
    type: "frame",
    role: "route",
    name: "Responsive route",
    width: 1280,
    height: 720,
    layout: "grid",
    gridTemplateColumns: ["1fr", "2fr"],
    padding: [10, 20, 30, 40],
    gap: [{ value: 8 }, { value: 24, when: { viewport: "wide" } }],
    fill: [{ value: "#ffffff" }, { value: "#111111", when: { appearance: "dark" } }],
    children: [{
      id: "title",
      type: "text",
      width: 500,
      height: 80,
      content: "A responsive heading",
      fontFamily: "Inter",
      fontSize: 42,
      marks: [],
      paragraphs: [{ from: 0, to: 20, headingLevel: 1 }],
      description: "Primary page heading",
    }, {
      id: "layout-matrix", type: "frame", width: 300, height: 140, layout: "horizontal", justifyContent: "center", alignItems: "end",
      minWidth: 240, maxWidth: 360, minHeight: 100, maxHeight: 180,
      children: [
        { id: "flow-child", type: "rectangle", width: 30, height: 20, fill: "#123456" },
        { id: "absolute-child", type: "rectangle", x: 17, y: 19, width: 20, height: 20, layoutPosition: "absolute", fill: "#654321" },
      ],
    },
    { id: "linear", type: "rectangle", width: 100, height: 70, fill: { type: "gradient", gradientType: "linear", center: { x: .3, y: .7 }, size: { width: .6, height: .8 }, rotation: 25, colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }] } },
    { id: "radial", type: "ellipse", width: 100, height: 70, fill: { type: "gradient", gradientType: "radial", center: { x: .25, y: .6 }, size: { width: .5, height: .8 }, rotation: 35, colors: [{ color: "#ffffff", position: 0 }, { color: "#000000", position: 1 }] } },
    { id: "angular", type: "rectangle", width: 100, height: 70, fill: { type: "gradient", gradientType: "angular", rotation: 40, colors: [{ color: "#00ff00", position: 0 }, { color: "#0000ff", position: 1 }] } },
    { id: "image", type: "rectangle", width: 80, height: 60, fill: { type: "image", mode: "fit", url: "image.svg" } },
    { id: "effects", type: "rectangle", width: 90, height: 50, fill: "#777777", blendMode: "multiply", effect: [{ type: "shadow", offset: { x: 3, y: 4 }, blur: 5, spread: 6, color: "#00000080" }, { type: "blur", radius: 2 }, { type: "background_blur", radius: 7 }] },
    { id: "clipped", type: "frame", width: 50, height: 40, clip: true, children: [{ id: "clipped-child", type: "rectangle", width: 100, height: 80, fill: "#00ff00" }] },
    { id: "flipped", type: "rectangle", width: 40, height: 30, flipX: true, flipY: true, rotation: 15, fill: "#abcabc" },
    { id: "icon", type: "icon", library: "lucide", icon: "camera", weight: 400, width: 24, height: 24, fill: "#334455", description: "Camera symbol" },
    { id: "line", type: "line", width: 80, height: 30, stroke: { fill: "#112233", thickness: 4, cap: "round", join: "bevel", dash: [5, 3] }, description: "Trend line" },
    { id: "rich", type: "text", width: 220, height: 90, content: "AlphaBeta", textAlign: "end", textAlignVertical: "bottom", lineHeight: 1.5, wordSpacing: 6, textGrowth: "fixed-width", linkName: "Details destination", marks: [{ type: "link", from: 0, to: 5, value: "#details" }], paragraphs: [{ from: 0, to: 5, list: { kind: "bullet", level: 0 }, align: "center" }, { from: 5, to: 9, list: { kind: "number", level: 1 } }] },
    { id: "node-heading", type: "text", width: 160, height: 40, content: "Node heading", headingLevel: 2 },
    ...[
      ["scroll-x", "scroll-x"],
      ["scroll-y", "scroll-y"],
      ["scroll-both", "scroll-both"],
    ].map(([id, overflow]) => ({
      id, type: "frame", width: 120, height: 80, layout: "none", overflow,
      children: [{ id: `${id}-content`, type: "rectangle", x: 30, y: 20, width: 200, height: 140, fill: "#2563eb" }],
    }))],
  }],
};

test("web export preserves responsive semantics and accessibility in Chrome", { timeout: 120_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-web-export-"));
  const profile = join(directory, "chrome-profile");
  const files = exportWeb(buildExporterIR(document, { role: "route", frames: ["route"] }));
  for (const [name, contents] of files) await writeFile(join(directory, name), contents);
  await writeFile(join(directory, "image.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>`);

  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let didClose = false;
  const closed = new Promise((resolve) => chrome.once("close", () => { didClose = true; resolve(); }));
  t.after(async () => {
    if (!didClose) chrome.kill("SIGTERM");
    const escalation = setTimeout(() => { if (!didClose) chrome.kill("SIGKILL"); }, 2000);
    let timeout;
    try {
      await Promise.race([closed, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("Chrome termination was not confirmed"), { code: "BROWSER_TERMINATION_UNCONFIRMED" })), 5000);
      })]);
    } finally { clearTimeout(escalation); clearTimeout(timeout); }
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  const browserWs = await devtoolsUrl(chrome);
  const browser = connectCdp(browserWs);
  t.after(() => browser.close());
  const { targetId } = await browser.send("Target.createTarget", { url: pathToFileURL(join(directory, "responsive-route.html")).href });
  const target = await waitForTarget(browserWs, targetId);
  const page = connectCdp(target.webSocketDebuggerUrl);
  t.after(() => page.close());
  await page.send("Page.enable");
  await page.send("DOM.enable");
  await page.send("Accessibility.enable");
  await page.send("Runtime.enable");
  await page.send("Page.reload");
  await page.once("Page.loadEventFired");

  for (const width of [360, 900, 1280]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 720, deviceScaleFactor: 1, mobile: false });
    await settle(page);
    assert.equal(await evaluate(page, "window.innerWidth"), width);
    const expectedGap = width >= 900 ? "24px" : "8px";
    assert.equal(await evaluate(page, "getComputedStyle(document.getElementById('route')).gap"), expectedGap);
    assert.equal(await evaluate(page, "getComputedStyle(document.getElementById('route')).gridTemplateColumns.split(' ').length"), 2);
    assert.deepEqual(await evaluate(page, `(() => { const style = getComputedStyle(document.getElementById("route")); return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]; })()`), ["10px", "20px", "30px", "40px"]);
    const tree = await page.send("Accessibility.getFullAXTree");
    const heading = tree.nodes.find((node) => node.role?.value === "heading");
    assert.equal(heading?.name?.value, "Primary page heading");
    assert.equal(heading?.properties?.find((property) => property.name === "level")?.value?.value, 1);
  }

  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await settle(page);
  assert.equal(await evaluate(page, "getComputedStyle(document.getElementById('route')).backgroundColor"), "rgb(17, 17, 17)");

  const { root } = await page.send("DOM.getDocument");
  const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#route" });
  await page.send("CSS.enable");
  await page.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
  assert.equal(await evaluate(page, "getComputedStyle(document.getElementById('route')).gap"), "24px");
  assert.equal(await evaluate(page, "document.documentElement.lang"), "en-GB");

  assert.deepEqual(await evaluate(page, `(() => {
    const read = id => { const element = document.getElementById(id); const style = getComputedStyle(element); return {
      overflowX: style.overflowX, overflowY: style.overflowY,
      clientWidth: element.clientWidth, clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
    }; };
    return [read("scroll-x"), read("scroll-y"), read("scroll-both")];
  })()`), [
    { overflowX: "auto", overflowY: "hidden", clientWidth: 120, clientHeight: 80, scrollWidth: 230, scrollHeight: 160 },
    { overflowX: "hidden", overflowY: "auto", clientWidth: 120, clientHeight: 80, scrollWidth: 230, scrollHeight: 160 },
    { overflowX: "auto", overflowY: "auto", clientWidth: 120, clientHeight: 80, scrollWidth: 230, scrollHeight: 160 },
  ]);

  assert.deepEqual(await evaluate(page, `(() => {
    const read = id => getComputedStyle(document.getElementById(id));
    const layout = read("layout-matrix"); const absolute = document.getElementById("absolute-child"); const host = document.getElementById("layout-matrix").getBoundingClientRect(); const child = absolute.getBoundingClientRect();
    return {
      layout: [layout.justifyContent, layout.alignItems, layout.minWidth, layout.maxWidth, layout.minHeight, layout.maxHeight],
      absolute: [Math.round(child.left - host.left), Math.round(child.top - host.top), absolute.style.position],
      gradients: [read("linear").backgroundImage.startsWith('url("data:image/svg+xml'), read("radial").backgroundImage.startsWith('url("data:image/svg+xml'), read("angular").backgroundImage.startsWith("conic-gradient")],
      image: [read("image").backgroundSize, read("image").backgroundImage.includes("image.svg")],
      effects: [read("effects").boxShadow, read("effects").filter, read("effects").backdropFilter, read("effects").mixBlendMode],
      clip: [read("clipped").overflowX, read("clipped").overflowY],
      flip: read("flipped").transform,
      text: [read("rich").textAlign, read("rich").justifyContent, read("rich").lineHeight, read("rich").wordSpacing, read("rich").height],
      vectors: [document.querySelector("#icon path") !== null, document.querySelector("#line line").getAttribute("stroke-linecap"), document.querySelector("#line line").getAttribute("stroke-dasharray")],
      lists: [document.querySelectorAll("#rich ul li").length, document.querySelectorAll("#rich ol li").length],
    };
  })()`), {
    layout: ["center", "flex-end", "240px", "360px", "100px", "180px"],
    absolute: [17, 19, "absolute"],
    gradients: [true, true, true], image: ["contain", true],
    effects: ["rgba(0, 0, 0, 0.5) 3px 4px 5px 6px", "blur(2px)", "blur(7px)", "multiply"],
    clip: ["hidden", "hidden"], flip: "matrix(-0.965926, -0.258819, 0.258819, -0.965926, 0, 0)",
    text: ["end", "flex-end", "24px", "6px", "112px"], vectors: [true, "round", "5 3"], lists: [1, 1],
  });
  const completeTree = await page.send("Accessibility.getFullAXTree");
  assert.equal(completeTree.nodes.find((node) => node.role?.value === "link")?.name?.value, "Details destination");
  assert.ok(completeTree.nodes.some((node) => node.role?.value === "heading" && node.name?.value === "Node heading" && node.properties?.some((property) => property.name === "level" && property.value?.value === 2)));
});

async function devtoolsUrl(child) {
  let text = "";
  for await (const chunk of child.stderr) {
    text += chunk;
    const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
    if (match) return match[1];
    if (text.length > 32_000) text = text.slice(-16_000);
  }
  throw new Error(`Chrome exited before exposing DevTools: ${text}`);
}

async function waitForTarget(browserWs, targetId) {
  const endpoint = new URL(browserWs);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`http://${endpoint.host}/json/list`).catch(() => null);
    if (response?.ok) {
      const target = (await response.json()).find((candidate) => candidate.id === targetId);
      if (target) return target;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Chrome target ${targetId} did not become available.`);
}

function connectCdp(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const events = new Map();
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error.message));
      else waiter?.resolve(message.result);
      return;
    }
    const waiter = events.get(message.method)?.shift();
    waiter?.(message.params);
  });
  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    once(method) {
      return new Promise((resolve) => {
        const waiters = events.get(method) ?? [];
        waiters.push(resolve);
        events.set(method, waiters);
      });
    },
    close() { socket.close(); },
  };
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function settle(page) {
  const result = await page.send("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
}
