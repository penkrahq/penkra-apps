import assert from "node:assert/strict";
import { createServer } from "node:http";
import * as FS from "node:fs/promises";
import NodeFS from "node:fs";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const desktopRoot = process.env.PENKRA_DESKTOP_REPO_ROOT;
if (!desktopRoot || !Path.isAbsolute(desktopRoot)) {
  throw new Error(
    "Set PENKRA_DESKTOP_REPO_ROOT to the desktop checkout for its Playwright installation.",
  );
}
const { chromium } = createRequire(Path.join(desktopRoot, "apps/web/package.json"))("playwright");
const appRoot = fileURLToPath(new URL("./", import.meta.url));
const handlers = new Map();
const subscriptions = new Map();
globalThis.penkra = {
  operations: { handle() {} },
  controller: {
    subscription(name, handler) {
      subscriptions.set(name, handler);
    },
    handle(name, handler) {
      handlers.set(name, handler);
    },
  },
};
await import("./operations.js");

function pdfFixture() {
  const content = "0 0 100 100 re f\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 5\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return source;
}

async function openFixture(t, intercept) {
  const rootPath = await FS.realpath(
    await FS.mkdtemp(Path.join(tmpdir(), "penkra-explorer-browser-")),
  );
  const abort = new AbortController();
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const path = Path.resolve(appRoot, `.${pathname === "/" ? "/app.html" : pathname}`);
      const relative = Path.relative(appRoot, path);
      if (relative.startsWith("..") || Path.isAbsolute(relative))
        throw new Error("Outside test App");
      const type = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[Path.extname(path)];
      response.setHeader("Content-Type", type ?? "application/octet-stream");
      response.end(await FS.readFile(path));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  t.after(async () => {
    abort.abort(new Error("Fixture closed"));
    await browser.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await FS.rm(rootPath, { recursive: true, force: true });
  });
  const page = await browser.newPage();
  await page.exposeFunction("invokeExplorer", async (name, input) => {
    if (intercept) {
      const result = await intercept(name, input);
      if (result !== undefined) return result;
    }
    return handlers.get(name)(input, { signal: abort.signal });
  });
  const watches = new Map();
  let ready;
  const watching = new Promise((resolve) => {
    ready = resolve;
  });
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    for (const controller of watches.values()) controller.abort(new Error("Renderer replaced"));
    watches.clear();
  });
  page.on("close", () => {
    for (const controller of watches.values()) controller.abort(new Error("Tab closed"));
    watches.clear();
  });
  await page.exposeFunction("subscribeExplorer", async (name, input, id) => {
    const controller = new AbortController();
    watches.set(id, controller);
    const send = async (payload) => {
      if (!page.isClosed())
        await page.evaluate(
          ({ id, payload }) =>
            window.dispatchEvent(new CustomEvent(`explorer-stream:${id}`, { detail: payload })),
          { id, payload },
        );
    };
    try {
      await subscriptions.get(name)(input, {
        signal: controller.signal,
        send: (value) => {
          void send({ type: "message", value });
        },
        end: () => {
          watches.delete(id);
          controller.abort();
          void send({ type: "end" });
        },
      });
      ready();
    } catch (error) {
      watches.delete(id);
      controller.abort();
      await send({ type: "end", error: { message: error.message } });
    }
  });
  await page.exposeFunction("stopExplorer", (id) => {
    watches.get(id)?.abort();
    watches.delete(id);
  });
  await page.addInitScript(
    ({ rootPath }) => {
      window.penkra = {
        files: {
          async list() {
            return JSON.parse(sessionStorage.getItem("pickerGrants") ?? "[]");
          },
          async revoke(id) {
            const grants = JSON.parse(sessionStorage.getItem("pickerGrants") ?? "[]");
            sessionStorage.setItem(
              "pickerGrants",
              JSON.stringify(grants.filter((grant) => grant.id !== id)),
            );
          },
          async pick() {
            const grant = { id: "chosen", kind: "directory", path: rootPath, name: "Fixture" };
            sessionStorage.setItem("pickerGrants", JSON.stringify([grant]));
            return grant;
          },
        },
        controller: {
          subscribe(name, input, callbacks) {
            const id = crypto.randomUUID();
            const receive = ({ detail }) => {
              if (detail.type === "message") callbacks.message(detail.value);
              else {
                window.removeEventListener(`explorer-stream:${id}`, receive);
                callbacks.end(detail.error);
              }
            };
            window.addEventListener(`explorer-stream:${id}`, receive);
            void window.subscribeExplorer(name, input, id);
            return () => {
              window.removeEventListener(`explorer-stream:${id}`, receive);
              void window.stopExplorer(id);
            };
          },
          async invoke(name, input) {
            const result = await window.invokeExplorer(name, input);
            if (name === "explorer.listDirectory" && input.relativePath === "docs") {
              window.completedSearchCalls = (window.completedSearchCalls ?? 0) + 1;
            }
            return result;
          },
        },
        tab: {
          onNavigate(listener) {
            const route = JSON.parse(sessionStorage.getItem("tabRoute") ?? "null");
            if (route) queueMicrotask(() => listener(route));
          },
          handle() {},
          async setRoute(route) {
            sessionStorage.setItem("tabRoute", JSON.stringify(route));
          },
        },
        shell: {},
      };
    },
    { rootPath },
  );
  const address = server.address();
  return { watches, watching, rootPath, page, url: `http://127.0.0.1:${address.port}` };
}

test("renders CSV, PDF and video previews", async (t) => {
  const { rootPath, page, url } = await openFixture(t);
  await FS.writeFile(Path.join(rootPath, "table.csv"), 'Name,Value\n"Example, row",42\n');
  await FS.writeFile(Path.join(rootPath, "document.pdf"), pdfFixture());
  await FS.copyFile(Path.join(appRoot, "fixtures/preview.mp4"), Path.join(rootPath, "video.mp4"));
  await page.goto(url);
  await page.locator('[data-action="choose"]').click();
  await page.locator('[data-path="table.csv"]').click();
  await page.locator(".data-grid").waitFor();
  assert.equal(await page.locator(".data-grid td").first().textContent(), "Example, row");
  await page.locator('[data-path="document.pdf"]').click();
  await page.locator("canvas.is-ready").waitFor();
  assert.ok(
    await page
      .locator("canvas.is-ready")
      .evaluate((canvas) => canvas.width > 0 && canvas.height > 0),
  );
  await page.locator('[data-path="video.mp4"]').click();
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
  assert.ok(
    await page.locator("video").evaluate((video) => video.videoWidth > 0 && video.controls),
  );
});

test("two quick inputs render only the latest search result", async (t) => {
  let resolveFirst;
  let firstStarted;
  const first = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const started = new Promise((resolve) => {
    firstStarted = resolve;
  });
  let searches = 0;
  const { rootPath, page, url } = await openFixture(t, async (name, input) => {
    if (name !== "explorer.listDirectory" || input.relativePath !== "docs") return undefined;
    searches += 1;
    if (searches === 1) {
      firstStarted();
      await first;
      return [
        {
          kind: "file",
          name: "first.txt",
          relativePath: "docs/first.txt",
          size: 1,
          modifiedAt: "2026-01-01T00:00:00Z",
        },
      ];
    }
    return [
      {
        kind: "file",
        name: "second.txt",
        relativePath: "docs/second.txt",
        size: 1,
        modifiedAt: "2026-01-01T00:00:00Z",
      },
    ];
  });
  await FS.mkdir(Path.join(rootPath, "docs"));
  await page.goto(url);
  await page.locator('[data-action="choose"]').click();
  await page.locator('[data-path="docs"]').waitFor();
  await page.locator("[data-search]").fill("first");
  await started;
  await page.locator("[data-search]").fill("second");
  await page.locator('.search-row[data-path="docs/second.txt"]').waitFor();
  await page.evaluate(() => {
    // Observe rendering until the deferred older search has completed.
    window.firstSearchRendered = false;
    window.searchObserver = new MutationObserver(() => {
      if (document.querySelector('.search-row[data-path="docs/first.txt"]'))
        window.firstSearchRendered = true;
    });
    window.searchObserver.observe(document.querySelector(".tree-scroll"), {
      subtree: true,
      childList: true,
    });
    window.nextPaint = () => new Promise(requestAnimationFrame);
  });
  resolveFirst();
  await page.waitForFunction(() => window.completedSearchCalls === 2);
  await page.evaluate(() => window.nextPaint());
  assert.equal(await page.locator('.search-row[data-path="docs/second.txt"]').count(), 1);
  assert.equal(await page.locator('.search-row[data-path="docs/first.txt"]').count(), 0);
  assert.equal(await page.evaluate(() => window.firstSearchRendered), false);
  assert.equal(searches, 2);
});

test("unavailable entries remain visible, grey and disabled with their error", async (t) => {
  const { page, url } = await openFixture(t, async (name) => {
    if (name === "explorer.listDirectory")
      return [
        {
          kind: "unavailable",
          name: "unreadable.txt",
          relativePath: "unreadable.txt",
          error: "EACCES",
        },
      ];
  });
  await page.goto(url);
  await page.locator('[data-action="choose"]').click();
  const entry = page.locator('[data-path="unreadable.txt"]');
  await entry.waitFor();
  assert.equal(await entry.isDisabled(), true);
  assert.equal(await entry.locator(".entry-error").textContent(), "EACCES");
  assert.equal(
    await entry.evaluate((row) => getComputedStyle(row).color),
    await page.locator("#app").evaluate((app) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--tertiary)";
      app.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }),
  );
});

test("Forget clears the restored route and makes no reads after renderer reload", async (t) => {
  const reads = [];
  const { rootPath, page, url } = await openFixture(t, async (name, input) => {
    if (name !== "explorer.watch") reads.push({ name, rootPath: input.rootPath });
  });
  await FS.writeFile(Path.join(rootPath, "forgotten.txt"), "Fixture");
  await page.goto(url);
  await page.locator('[data-action="choose"]').click();
  await page.locator('[data-path="forgotten.txt"]').waitFor();
  await page.locator('[data-action="menu"]').click();
  await page.locator('[data-action="forget"]').click();
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("tabRoute")).route === "/");
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem("pickerGrants"))),
    [],
  );
  const readCount = reads.length;
  await page.reload();
  await page.locator("[data-location][readonly]").waitFor();
  assert.equal(await page.locator('[data-path="forgotten.txt"]').count(), 0);
  assert.equal(reads.length, readCount);
});

test("persistent native watches refresh both file changes and close with the tab", async (t) => {
  const originalWatch = NodeFS.watch;
  let closed;
  const closing = new Promise((resolve) => {
    closed = resolve;
  });
  t.mock.method(NodeFS, "watch", (...args) => {
    const watcher = originalWatch(...args);
    watcher.once("close", closed);
    return watcher;
  });
  const { rootPath, page, url, watches, watching } = await openFixture(t);
  await page.goto(url);
  await page.locator('[data-action="choose"]').click();
  await watching;
  assert.equal(watches.size, 1);
  await FS.writeFile(Path.join(rootPath, "first.txt"), "first");
  await page.locator('[data-path="first.txt"]').waitFor();
  await FS.writeFile(Path.join(rootPath, "second.txt"), "second");
  await page.locator('[data-path="second.txt"]').waitFor();
  assert.equal(watches.size, 1);
  const [controller] = watches.values();
  await page.close();
  await closing;
  assert.equal(controller.signal.aborted, true);
  assert.equal(watches.size, 0);
});
