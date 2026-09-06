import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { exportDocumentBatch } from "../src/export-service.mjs";
import { bindingsForExportSet, resolveExportDestinations } from "../src/export-delivery.mjs";

export const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const viewportWidths = [800, 1200, 1600];
export const viewportHeight = 600;
export const fortyCount = 40;

// This is the exact forty-school fixture used by export-four-format-batch.test.mjs.
// Keep the axes, text, layout, and geometry intact for browser acceptance.
export function fortySchoolTemplate() {
  return {
    version: "2.17", module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "slide", type: "frame", role: "route", width: 800, height: 450,
      physical: { w: 10, h: 5.625, unit: "in" }, layout: "horizontal", gap: 10,
      children: [
        { id: "school", type: "text", width: "${cardWidth}", height: 50, content: "${schoolName}", fontFamily: "Inter", fontSize: 24, paragraphs: [], marks: [] },
        { id: "marker", type: "rectangle", width: 20, height: 20, fill: "#123456" },
      ],
    }],
  };
}

export function fortySchoolSets() {
  return Array.from({ length: fortyCount }, (_, index) => ({
    output: `School ${index + 1}`,
    schoolName: `School ${index + 1}`,
    cardWidth: 100 + index,
  }));
}

function relativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function safeJson(value) {
  return JSON.stringify(value, (_key, child) => typeof child === "bigint" ? Number(child) : child, null, 2);
}

function failureForObservation(observation) {
  const failures = [];
  const expectedText = `School ${observation.schoolIndex}`;
  const expectedWidth = 100 + observation.schoolIndex - 1;
  const school = observation.school;
  const marker = observation.marker;
  const tolerance = 2;
  if (observation.navigationError) failures.push(`navigation: ${observation.navigationError}`);
  if (observation.readinessError) failures.push(`readiness: ${observation.readinessError}`);
  if (observation.screenshotError) failures.push(`screenshot: ${observation.screenshotError}`);
  if (!school) failures.push("#school is absent");
  if (!marker) failures.push("#marker is absent");
  if (school && school.textContent !== expectedText) failures.push("school textContent mismatch");
  if (school && Math.abs(school.bounds.width - expectedWidth) > tolerance) failures.push("school width mismatch");
  if (school && Math.abs(school.bounds.height - 50) > tolerance) failures.push("school height mismatch");
  if (marker && Math.abs(marker.bounds.width - 20) > tolerance) failures.push("marker width mismatch");
  if (marker && Math.abs(marker.bounds.height - 20) > tolerance) failures.push("marker height mismatch");
  if (school && marker && Math.abs((marker.bounds.left - school.bounds.left) - (school.bounds.width + 10)) > tolerance) failures.push("marker horizontal offset mismatch");
  if (school && marker && Math.abs(marker.bounds.top - school.bounds.top) > tolerance) failures.push("marker top mismatch");
  if (observation.unresolvedVisibleText.length) failures.push("unresolved binding placeholder is visible");
  if (!observation.fontFamily || !observation.fontSize) failures.push("computed font metadata missing");
  if (observation.console.length) failures.push("console/page diagnostics present");
  if (observation.failedLocalResources.length) failures.push("local resource request failed");
  return failures;
}

export function classifyObservation(observation) {
  const failures = failureForObservation(observation);
  return { status: failures.length ? "mismatch" : "pass", failures };
}

export async function runHtmlBatchBrowserAcceptance({ evidenceRoot: requestedRoot } = {}) {
  const evidenceRoot = requestedRoot ?? await mkdtemp(join(tmpdir(), "canvas-luna-html-batch-browser-"));
  const bundleRoot = join(evidenceRoot, "bundles");
  const screenshotRoot = join(evidenceRoot, "screenshots");
  await mkdir(bundleRoot, { recursive: true });
  await mkdir(screenshotRoot, { recursive: true });
  await writeFile(join(bundleRoot, "unrelated-preserved.txt"), "preserve this unrelated entry\n", { flag: "wx" });

  const document = deepFreeze(fortySchoolTemplate());
  const before = structuredClone(document);
  const sets = fortySchoolSets();
  const destinations = resolveExportDestinations(`${bundleRoot}/`, sets, "html");
  const requests = sets.map((set, index) => ({
    role: "route", frames: ["slide"], destination: destinations[index], bindings: bindingsForExportSet(set),
  }));
  await exportDocumentBatch(document, requests, { assets: new Map(), title: "Forty-school HTML browser acceptance" });
  if (JSON.stringify(document) !== JSON.stringify(before)) throw new Error("HTML acceptance template was mutated during export.");

  const topLevel = (await readdir(bundleRoot)).sort();
  const expectedTopLevel = ["unrelated-preserved.txt", ...sets.map((set) => set.output)].sort();
  if (JSON.stringify(topLevel) !== JSON.stringify(expectedTopLevel)) throw new Error("HTML export left unexpected top-level artifacts.");
  for (const destination of destinations) {
    const entries = await readdir(destination);
    if (!entries.includes("slide.html")) throw new Error(`HTML bundle is missing slide.html: ${destination}`);
  }

  const browser = await openOwnedChrome(join(evidenceRoot, "chrome-profile"));
  let browserExit;
  const observations = [];
  const screenshotNames = new Set();
  try {
    const page = await browser.openPage();
    try {
      for (let index = 0; index < sets.length; index += 1) {
        for (const width of viewportWidths) {
          const observation = await page.measure({
            schoolIndex: index + 1,
            width,
            url: pathToFileURL(join(destinations[index], "slide.html")).href,
            displayPath: relativePath(evidenceRoot, join(destinations[index], "slide.html")),
          });
          const screenshotName = `school-${String(index + 1).padStart(2, "0")}-${width}.png`;
          if (screenshotNames.has(screenshotName)) throw new Error(`Screenshot name collision: ${screenshotName}`);
          screenshotNames.add(screenshotName);
          try {
            const screenshotBytes = await page.screenshot();
            const screenshotPath = join(screenshotRoot, screenshotName);
            await writeFile(screenshotPath, screenshotBytes, { flag: "wx" });
            observation.screenshot = { relativePath: relativePath(evidenceRoot, screenshotPath), bytes: screenshotBytes.length };
          } catch (error) {
            observation.screenshotError = error.message;
          }
          const classification = classifyObservation(observation);
          observation.status = classification.status;
          observation.failures = classification.failures;
          observations.push(observation);
        }
      }
    } finally {
      await page.close();
    }
  } finally {
    browserExit = await browser.close();
  }

  const result = {
    format: "html",
    artifactCount: destinations.length,
    viewportWidths,
    viewportHeight,
    deviceScaleFactor: 1,
    observations,
    generatedBundles: destinations.map((destination) => relativePath(evidenceRoot, destination)),
    preservedUnrelatedEntry: relativePath(evidenceRoot, join(bundleRoot, "unrelated-preserved.txt")),
    screenshotCount: screenshotNames.size,
    browser: { executable: chromePath, terminated: true, exit: browserExit },
  };
  await writeFile(join(evidenceRoot, "measurements.json"), safeJson({
    ...result,
    evidenceRoot: undefined,
  }));
  return { ...result, evidenceRoot };
}

async function openOwnedChrome(profileDirectory) {
  await mkdir(dirname(profileDirectory), { recursive: true });
  const child = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profileDirectory}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.on("error", () => {});
  const closed = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  let browser;
  let closing = false;
  try {
    const browserUrl = await devtoolsUrl(child);
    browser = connectCdp(browserUrl);
    return {
      async openPage() {
        const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
        const target = await waitForTarget(browserUrl, targetId);
        const page = connectCdp(target.webSocketDebuggerUrl);
        await page.send("Page.enable");
        await page.send("Runtime.enable");
        await page.send("Network.enable");
        return createPageController(page);
      },
      async close() {
        if (closing) return;
        closing = true;
        try {
          await Promise.race([
            browser.send("Browser.close"),
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch {}
        await browser.close();
        if (!child.killed) child.kill("SIGTERM");
        return waitForChild(closed, child);
      },
    };
  } catch (error) {
    await browser?.close();
    if (!child.killed) child.kill("SIGTERM");
    await waitForChild(closed, child);
    throw error;
  }
}

function createPageController(page) {
  let diagnostics = { console: [], failedLocalResources: [], navigationError: undefined, readinessError: undefined };
  page.on("Runtime.consoleAPICalled", (params) => {
    diagnostics.console.push({ kind: "console", type: params.type, text: params.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") ?? "" });
  });
  page.on("Runtime.exceptionThrown", (params) => {
    diagnostics.console.push({ kind: "exception", text: params.exceptionDetails?.text ?? params.exceptionDetails?.exception?.description ?? "Unknown page exception" });
  });
  page.on("Network.loadingFailed", (params) => {
    if (!params.url || params.url.startsWith("file:")) diagnostics.failedLocalResources.push({ url: params.url ?? "", errorText: params.errorText ?? "", type: params.type ?? "" });
  });
  return {
    async measure({ schoolIndex, width, url, displayPath }) {
      diagnostics = { console: [], failedLocalResources: [], navigationError: undefined, readinessError: undefined };
      await page.send("Emulation.setDeviceMetricsOverride", { width, height: viewportHeight, deviceScaleFactor: 1, mobile: false });
      const observation = { schoolIndex, width, height: viewportHeight, deviceScaleFactor: 1, url: `file://<evidence-root>/${displayPath}`, ...diagnostics };
      try {
        const loaded = page.once("Page.loadEventFired");
        const navigation = await page.send("Page.navigate", { url });
        if (navigation.errorText) observation.navigationError = navigation.errorText;
        await loaded;
      } catch (error) {
        observation.navigationError = error.message;
      }
      try {
        const ready = await page.send("Runtime.evaluate", {
          expression: "(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true; })()",
          awaitPromise: true, returnByValue: true,
        });
        if (ready.exceptionDetails) throw new Error(ready.exceptionDetails.text);
      } catch (error) {
        observation.readinessError = error.message;
      }
      try {
        const measured = await page.send("Runtime.evaluate", {
          expression: `(() => {
            const bounds = (element) => {
              if (!element) return null;
              const rect = element.getBoundingClientRect();
              return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            };
            const school = document.querySelector("#school");
            const marker = document.querySelector("#marker");
            const text = school?.querySelector("span") ?? school;
            const style = text ? getComputedStyle(text) : null;
            return {
              school: school ? { textContent: school.textContent, tag: school.tagName, bounds: bounds(school) } : null,
              marker: marker ? { textContent: marker.textContent, tag: marker.tagName, bounds: bounds(marker) } : null,
              fontFamily: style?.fontFamily ?? "",
              fontSize: style?.fontSize ?? "",
              visibleText: document.body?.innerText ?? "",
              tags: [...document.querySelectorAll("#school, #marker")].map((element) => element.tagName),
            };
          })()`,
          returnByValue: true,
        });
        if (measured.exceptionDetails) throw new Error(measured.exceptionDetails.text);
        Object.assign(observation, measured.result.value);
      } catch (error) {
        observation.readinessError ??= error.message;
        observation.school = null;
        observation.marker = null;
        observation.fontFamily = "";
        observation.fontSize = "";
        observation.visibleText = "";
        observation.tags = [];
      }
      observation.unresolvedVisibleText = (observation.visibleText.match(/schoolName|cardWidth/gu) ?? []);
      observation.console = diagnostics.console;
      observation.failedLocalResources = diagnostics.failedLocalResources;
      return observation;
    },
    async screenshot() {
      const result = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      return Buffer.from(result.data, "base64");
    },
    close() { return page.close(); },
  };
}

async function waitForChild(closed, child) {
  const exited = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (exited) return closed;
  if (!exited) {
    child.kill("SIGKILL");
    const forcedExit = await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1000))]);
    return forcedExit ?? { code: null, signal: "SIGKILL", forced: true };
  }
}

async function devtoolsUrl(child) {
  let output = "";
  for await (const chunk of child.stderr) {
    output += chunk;
    const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
    if (match) return match[1];
    if (output.length > 32_000) output = output.slice(-16_000);
  }
  throw new Error(`Chrome exited before exposing DevTools: ${output}`);
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
  const listeners = new Map();
  const waiters = new Map();
  let socketClosed = false;
  let socketClosedResolve;
  const closed = new Promise((resolve) => { socketClosedResolve = resolve; });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("close", () => {
    socketClosed = true;
    socketClosedResolve();
    const error = new Error("Browser connection closed");
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    for (const entries of waiters.values()) for (const waiter of entries) waiter.reject(error);
    waiters.clear();
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
    const waiter = waiters.get(message.method)?.shift();
    waiter?.resolve(message.params);
    for (const listener of listeners.get(message.method) ?? []) listener(message.params);
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
      return new Promise((resolve, reject) => {
        const current = waiters.get(method) ?? [];
        current.push({ resolve, reject });
        waiters.set(method, current);
      });
    },
    on(method, listener) {
      const current = listeners.get(method) ?? [];
      current.push(listener);
      listeners.set(method, current);
    },
    async close() {
      if (!socketClosed) {
        socket.close();
        await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1000))]);
      }
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const researchRoot = fileURLToPath(new URL("../research/luna-html-batch-browser-20260906/", import.meta.url));
  await mkdir(researchRoot, { recursive: true });
  const evidenceRoot = await mkdtemp(join(researchRoot, "run-"));
  const result = await runHtmlBatchBrowserAcceptance({ evidenceRoot });
  console.log(safeJson({ evidenceRoot: relativePath(researchRoot, evidenceRoot), browser: result.browser, observations: result.observations.length, pass: result.observations.filter((entry) => entry.status === "pass").length, mismatch: result.observations.filter((entry) => entry.status !== "pass").length }));
}
