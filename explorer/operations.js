import * as FS from "node:fs";
import * as Path from "node:path";

const runtime = globalThis.penkra;

if (!runtime?.operations || !runtime?.controller) {
  throw new Error("Explorer requires the Penkra App controller runtime.");
}

export async function openResource(input, context) {
  const sourcePath = await FS.promises.realpath(requireAbsolutePath(input.path));
  const stats = await FS.promises.stat(sourcePath);
  if (!stats.isFile() && !stats.isDirectory()) {
    throw new Error("Explorer can open only regular files and directories.");
  }
  const rootPath = stats.isDirectory() ? sourcePath : Path.dirname(sourcePath);
  const navigation = {
    route: "/open",
    state: {
      path: rootPath,
      ...(stats.isFile() ? { selectedRelativePath: Path.basename(sourcePath) } : {}),
    },
  };
  if (context.tab) {
    await context.tab.invoke({ operation: "resources.open", input: navigation.state });
    return { tabId: context.tab.id };
  }
  const tab = await context.tabs.open({ route: "/" });
  await tab.invoke({ operation: "resources.open", input: navigation.state });
  return { tabId: tab.id };
}

runtime.operations.handle("resources.open", openResource);

runtime.controller.handle("explorer.stat", async ({ rootPath, relativePath }) =>
  entry(rootPath, await resolveExisting(rootPath, relativePath)),
);

runtime.controller.handle("explorer.resolvePath", ({ rootPath, relativePath }) =>
  resolveExisting(rootPath, relativePath),
);

runtime.controller.handle("explorer.listDirectory", async ({ rootPath, relativePath }) => {
  const path = await resolveExisting(rootPath, relativePath);
  const entries = await FS.promises.readdir(path, { withFileTypes: true });
  const resolved = await Promise.allSettled(
    entries.map((item) => entry(rootPath, Path.join(path, item.name))),
  );
  return resolved.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
});

runtime.controller.handle("explorer.readBinary", async ({ rootPath, relativePath, offset = 0, length = 1024 * 1024 }) => {
  const path = await resolveExisting(rootPath, relativePath);
  const stats = await FS.promises.stat(path);
  if (!stats.isFile()) throw new Error("The selected Explorer entry is not a file.");
  if (stats.size > 64 * 1024 * 1024) throw new Error("Preview exceeds Explorer's 64 MB limit.");
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(length) || length < 1 || length > 1024 * 1024) {
    throw new Error("Explorer binary read range is invalid.");
  }
  const file = await FS.promises.open(path, "r");
  try {
    const buffer = Buffer.alloc(Math.max(0, Math.min(length, stats.size - offset)));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
    return {
      base64: buffer.subarray(0, bytesRead).toString("base64"),
      totalBytes: stats.size,
      complete: offset + bytesRead >= stats.size,
    };
  } finally {
    await file.close();
  }
});

runtime.controller.handle("explorer.writeText", async ({ rootPath, relativePath, source }) => {
  if (typeof source !== "string") throw new Error("File contents must be text.");
  if (Buffer.byteLength(source) > 16 * 1024 * 1024) {
    throw new Error("Text file exceeds the 16 MB limit.");
  }
  await FS.promises.writeFile(resolveWritable(rootPath, relativePath), source, "utf8");
});

runtime.controller.handle("explorer.createDirectory", async ({ rootPath, relativePath }) => {
  const path = resolveWritable(rootPath, relativePath);
  await FS.promises.mkdir(path);
  return entry(rootPath, path);
});

runtime.controller.handle("explorer.watch", async ({ rootPath, relativePath }, context) => {
  const path = await resolveExisting(rootPath, relativePath);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const watcher = FS.watch(path, { persistent: false }, () => finish(true));
    const finish = (changed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      watcher.close();
      context.signal.removeEventListener("abort", abort);
      resolve({ changed });
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      watcher.close();
      reject(context.signal.reason ?? new Error("Explorer watch cancelled."));
    };
    timeout = setTimeout(() => finish(false), 25_000);
    context.signal.addEventListener("abort", abort, { once: true });
  });
});

function requireAbsolutePath(value) {
  if (typeof value !== "string" || !Path.isAbsolute(value)) {
    throw new Error("Explorer requires an absolute path.");
  }
  return Path.resolve(value);
}

function resolveWritable(rootPath, relativePath = "") {
  const root = requireAbsolutePath(rootPath);
  const candidate = Path.resolve(root, typeof relativePath === "string" ? relativePath : "");
  if (candidate !== root && !candidate.startsWith(`${root}${Path.sep}`)) {
    throw new Error("Explorer path escapes its root.");
  }
  return candidate;
}

async function resolveExisting(rootPath, relativePath = "") {
  const root = await FS.promises.realpath(requireAbsolutePath(rootPath));
  const candidate = await FS.promises.realpath(resolveWritable(root, relativePath));
  if (candidate !== root && !candidate.startsWith(`${root}${Path.sep}`)) {
    throw new Error("Explorer path escapes its root.");
  }
  return candidate;
}

async function entry(rootPath, path) {
  const stats = await FS.promises.stat(path);
  return {
    kind: stats.isDirectory() ? "directory" : "file",
    name: Path.basename(path),
    relativePath: Path.relative(rootPath, path).split(Path.sep).join("/"),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}
