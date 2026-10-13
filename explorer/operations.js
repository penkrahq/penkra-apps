import FS from "node:fs";
import * as Path from "node:path";

const MAX_BINARY_READ_BYTES = 1024 * 1024;
const MAX_PREVIEW_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_WRITE_BYTES = 16 * 1024 * 1024;

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
  const tab = context.tab ?? (await context.tabs.open({ route: "/" }));
  await tab.invoke({ operation: "resources.open", input: navigation.state });
  return { tabId: tab.id };
}

runtime.operations.handle("resources.open", openResource);

runtime.controller.handle("explorer.location", async ({ rootPath, path }) => {
  if (typeof path !== "string" || !path.trim()) throw new Error("Enter a file or folder path.");
  const sourcePath = await FS.promises.realpath(
    Path.resolve(requireAbsolutePath(rootPath), path.trim()),
  );
  const stats = await FS.promises.stat(sourcePath);
  if (!stats.isFile() && !stats.isDirectory())
    throw new Error("Explorer can open only regular files and directories.");
  const directory = stats.isDirectory() ? sourcePath : Path.dirname(sourcePath);
  return {
    path: directory,
    name: Path.basename(directory) || directory,
    ...(stats.isFile() ? { selectedRelativePath: Path.basename(sourcePath) } : {}),
  };
});

runtime.controller.handle("explorer.parent", async ({ rootPath }) => {
  const path = await FS.promises.realpath(requireAbsolutePath(rootPath));
  const parent = Path.dirname(path);
  if (parent === path) return null;
  return { path: parent, name: Path.basename(parent) || parent, childName: Path.basename(path) };
});

runtime.controller.handle("explorer.stat", async ({ rootPath, relativePath }) => {
  const root = await resolveRoot(rootPath);
  return entry(root, resolveRelative(root, relativePath));
});

runtime.controller.handle("explorer.resolvePath", async ({ rootPath, relativePath }) => {
  const root = await resolveRoot(rootPath);
  return resolveExisting(root, relativePath);
});

runtime.controller.handle("explorer.listDirectory", async ({ rootPath, relativePath }) => {
  const root = await resolveRoot(rootPath);
  const path = await resolveExisting(root, relativePath);
  const entries = await FS.promises.readdir(path, { withFileTypes: true });
  return Promise.all(
    entries.map(async (item) => {
      const entryPath = Path.join(path, item.name);
      try {
        return await entry(root, entryPath);
      } catch (error) {
        return {
          kind: "unavailable",
          name: item.name,
          relativePath: Path.relative(root, entryPath).split(Path.sep).join("/"),
          error: error.message,
        };
      }
    }),
  );
});

runtime.controller.handle(
  "explorer.readBinary",
  async ({ rootPath, relativePath, offset, length }) => {
    const root = await resolveRoot(rootPath);
    const path = await resolveExisting(root, relativePath);
    const stats = await FS.promises.stat(path);
    if (!stats.isFile()) throw new Error("The selected Explorer entry is not a file.");
    if (stats.size > MAX_PREVIEW_BYTES) throw new Error("Preview exceeds Explorer's 64 MiB limit.");
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(length) ||
      length < 1 ||
      length > MAX_BINARY_READ_BYTES
    ) {
      throw new Error(
        "Explorer binary read requires a non-negative offset and a length from 1 byte to 1 MiB.",
      );
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
  },
);

runtime.controller.handle("explorer.writeText", async ({ rootPath, relativePath, source }) => {
  if (typeof source !== "string") throw new Error("File contents must be text.");
  if (Buffer.byteLength(source) > MAX_TEXT_WRITE_BYTES) {
    throw new Error("Text file exceeds the 16 MiB limit.");
  }
  const root = await resolveRoot(rootPath);
  await FS.promises.writeFile(await resolveWritable(root, relativePath), source, "utf8");
});

runtime.controller.handle("explorer.createDirectory", async ({ rootPath, relativePath }) => {
  const root = await resolveRoot(rootPath);
  const path = await resolveWritable(root, relativePath);
  await FS.promises.mkdir(path);
  return entry(root, path);
});

runtime.controller.subscription("explorer.watch", async ({ rootPath, relativePath }, context) => {
  context.signal.throwIfAborted();
  const root = await resolveRoot(rootPath);
  const path = await resolveExisting(root, relativePath);
  context.signal.throwIfAborted();
  const watcher = FS.watch(path, { persistent: false }, () => {
    if (!context.signal.aborted) context.send({ changed: true });
  });
  const cleanup = () => {
    watcher.close();
    context.signal.removeEventListener("abort", cleanup);
  };
  context.signal.addEventListener("abort", cleanup, { once: true });
  watcher.on("error", (error) => {
    console.warn("[explorer] Watch ended.", error);
    context.end();
  });
  if (context.signal.aborted) cleanup();
});

function requireAbsolutePath(value) {
  if (typeof value !== "string" || !Path.isAbsolute(value)) {
    throw new Error("Explorer requires an absolute path.");
  }
  return Path.resolve(value);
}

function requireInsideRoot(root, candidate) {
  const relative = Path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${Path.sep}`) || Path.isAbsolute(relative)) {
    throw new Error("Explorer path escapes its root.");
  }
  return candidate;
}

function resolveRelative(root, relativePath) {
  if (typeof relativePath !== "string" || Path.isAbsolute(relativePath)) {
    throw new Error("Explorer requires a relative entry path.");
  }
  return requireInsideRoot(root, Path.resolve(root, relativePath));
}

function resolveRoot(rootPath) {
  return FS.promises.realpath(requireAbsolutePath(rootPath));
}

async function resolveWritable(root, relativePath) {
  const candidate = resolveRelative(root, relativePath);
  const parent = requireInsideRoot(root, await FS.promises.realpath(Path.dirname(candidate)));
  try {
    await FS.promises.lstat(candidate);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // Only the new entry may be absent; its existing parent is resolved above.
    return requireInsideRoot(root, Path.join(parent, Path.basename(candidate)));
  }
  return requireInsideRoot(root, await FS.promises.realpath(candidate));
}

async function resolveExisting(root, relativePath) {
  return requireInsideRoot(root, await FS.promises.realpath(resolveRelative(root, relativePath)));
}

async function entry(root, path) {
  const linkStats = await FS.promises.lstat(path);
  const target = await resolveExisting(root, Path.relative(root, path));
  const stats = linkStats.isSymbolicLink() ? await FS.promises.stat(target) : linkStats;
  return {
    kind: stats.isDirectory() ? "directory" : "file",
    name: Path.basename(path),
    relativePath: Path.relative(root, path).split(Path.sep).join("/"),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}
