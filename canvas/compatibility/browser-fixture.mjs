import { spawn } from "node:child_process";

export async function openBrowser(directory, signal, options = {}) {
  const child = spawn(options.command ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", options.args ?? ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${directory}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"], signal });
  child.on("error", () => {});
  let didClose = false;
  const closed = new Promise(resolve => child.once("close", (exitCode, terminationSignal) => {
    didClose = true;
    resolve({ pid: child.pid, exitCode, signal: terminationSignal, closed: true });
  }));
  let browser, page;
  let cleanup;
  const lifetime = new AbortController();
  const stop = () => cleanup ??= (async () => {
    lifetime.abort();
    page?.close(); browser?.close();
    if (!didClose) child.kill("SIGTERM");
    const escalation = setTimeout(() => { if (!didClose) child.kill("SIGKILL"); }, options.terminateGraceMs ?? 2000);
    try { return await deadline(closed, options.terminationTimeoutMs ?? 5000, "BROWSER_TERMINATION_UNCONFIRMED"); }
    finally { clearTimeout(escalation); }
  })();
  try {
    await deadline((async () => {
      const url = await devtoolsUrl(child);
      if (cleanup) throw new Error("Browser startup was cancelled");
      browser = connectCdp(url);
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
      const target = await waitForTarget(url, targetId, lifetime.signal);
      if (cleanup) throw new Error("Browser startup was cancelled");
      page = connectCdp(target.webSocketDebuggerUrl);
      await page.send("Page.enable");
    })(), options.startupTimeoutMs ?? 15_000, "BROWSER_STARTUP_TIMEOUT");
    return {
      async screenshot(url, width, height, scale) {
        try {
          return await deadline((async () => {
            await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
            const loaded = page.once("Page.loadEventFired");
            // Navigation failure can close the socket before this event is awaited.
            loaded.catch(() => {});
            await page.send("Page.navigate", { url });
            await loaded;
            await settle(page);
            const result = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
            return Buffer.from(result.data, "base64");
          })(), options.screenshotTimeoutMs ?? 15_000, "BROWSER_SCREENSHOT_TIMEOUT");
        } catch (error) { error.termination = await stop(); throw error; }
      },
      close: stop,
    };
  } catch (error) { error.termination = await stop(); throw error; }
}

async function deadline(promise, milliseconds, code) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), milliseconds);
  })]); }
  finally { clearTimeout(timer); }
}

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

async function waitForTarget(browserWs, targetId, signal) {
  const endpoint = new URL(browserWs);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    signal.throwIfAborted();
    const response = await fetch(`http://${endpoint.host}/json/list`, { signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]) }).catch(() => null);
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
  socket.addEventListener("close", () => {
    const error = new Error("Browser connection closed");
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    for (const waiters of events.values()) for (const waiter of waiters) waiter.reject(error);
    events.clear();
  });
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
    waiter?.resolve(message.params);
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
        const waiters = events.get(method) ?? [];
        waiters.push({ resolve, reject });
        events.set(method, waiters);
      });
    },
    close() { try { socket.close(); } catch {} },
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
