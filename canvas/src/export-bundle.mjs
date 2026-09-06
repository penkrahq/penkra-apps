import { lstat, link, mkdir, mkdtemp, open, realpath, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export async function writeAtomicFile(destination, bytes) {
  const receipt = await publishAtomicFile(destination, bytes);
  return receipt.destination;
}

export async function publishAtomicFile(destination, bytes) {
  assertAbsolute(destination); await assertMissing(destination);
  const directory = dirname(destination); await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(destination)}.${crypto.randomUUID()}.tmp`);
  const handle = await open(temporary, "wx");
  let publishedIdentity;
  try {
    await handle.writeFile(bytes);
    await handle.close();
    // Linking publishes complete bytes atomically and fails if any destination
    // entry already exists, including a dangling symlink or a concurrent writer.
    await link(temporary, destination);
    publishedIdentity = identity(await lstat(destination));
  } catch (error) {
    if (error.code === "EEXIST") error.code = "CANVAS_EXPORT_EXISTS";
    throw error;
  } finally { await handle.close(); await rm(temporary, { force: true }); }
  return { destination, files: [{ path: destination, identity: publishedIdentity }], directories: [] };
}

export async function writeExclusiveBundle(destination, files) {
  const receipt = await publishExclusiveBundle(destination, files);
  return receipt.destination;
}

export async function publishExclusiveBundle(destination, files) {
  const entries = [...files];
  const names = new Set();
  for (const [name] of entries) {
    validateRelativeFile(name);
    const normalized = name.normalize("NFC").toLowerCase();
    if (names.has(normalized)) throw new Error(`Export filename collision: ${name}.`);
    names.add(normalized);
  }
  for (const name of names) {
    const parts = name.split("/");
    for (let index = 1; index < parts.length; index++) {
      if (names.has(parts.slice(0, index).join("/"))) throw new Error(`Export file/directory collision: ${name}.`);
    }
  }
  assertAbsolute(destination); await assertMissing(destination);
  const parent = dirname(destination); await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, `.${basename(destination)}.`));
  let reserved = false;
  const published = [];
  const directories = [];
  try {
    for (const [name, value] of entries) {
      const path = join(temporary, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, value, { flag: "wx" });
    }
    // Node has no exclusive directory rename. Reserve the destination with
    // mkdir, then link complete staged files without replacement. The bundle
    // becomes visible incrementally, not atomically as a whole.
    await mkdir(destination);
    reserved = true;
    directories.push({ path: destination, identity: identity(await lstat(destination)) });
    for (const [name] of entries) {
      const path = join(destination, name);
      await makeTrackedDirectories(dirname(path), destination, directories);
      await link(join(temporary, name), path);
      published.push({ path, identity: identity(await lstat(path)) });
    }
  } catch (error) {
    if (reserved) {
      // Do not recursively remove a published directory: another actor may
      // already have placed unrelated data there. Report exactly what remains.
      error.code = "CANVAS_EXPORT_PARTIAL";
      error.destination = destination;
      error.artifacts = published.map((entry) => entry.path);
      error.receipt = { destination, files: published, directories };
      error.message = `Export failed after reserving ${destination}; ${published.length} complete artifact(s) remain. ${error.message}`;
    } else if (error.code === "EEXIST") error.code = "CANVAS_EXPORT_EXISTS";
    throw error;
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return { destination, files: published, directories };
}

export async function preflightExportDestinations(destinations) {
  const seen = new Map();
  for (let index = 0; index < destinations.length; index += 1) {
    const destination = destinations[index];
    assertAbsolute(destination);
    await assertMissing(destination);
    const key = await canonicalDestinationKey(destination);
    const collision = [...seen].find(([other]) => other === key || other.startsWith(`${key}/`) || key.startsWith(`${other}/`));
    if (collision) {
      const error = new Error(`Export destinations ${collision[1]} and ${index} collide at ${destination}.`);
      error.code = "CANVAS_EXPORT_COLLISION";
      throw error;
    }
    seen.set(key, index);
  }
}

export async function cleanupPublishedExport(receipt) {
  const failures = [];
  for (const entry of [...(receipt?.files ?? [])].reverse()) {
    try {
      const current = await lstat(entry.path);
      if (!sameIdentity(current, entry.identity)) {
        failures.push({ path: entry.path, reason: "identity-changed" });
        continue;
      }
      await unlink(entry.path);
    } catch (error) {
      if (error.code !== "ENOENT") failures.push({ path: entry.path, reason: error.code ?? error.message });
    }
  }
  for (const entry of [...(receipt?.directories ?? [])].reverse()) {
    try {
      const current = await lstat(entry.path);
      if (!sameIdentity(current, entry.identity)) {
        failures.push({ path: entry.path, reason: "identity-changed" });
        continue;
      }
      await rmdir(entry.path);
    } catch (error) { if (error.code !== "ENOENT") failures.push({ path: entry.path, reason: error.code ?? error.message }); }
  }
  return failures;
}

export function validateOutputSegment(value) {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC") || /[\/\\\0-\x1f]/u.test(value) || value === "." || value === ".." || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value) || new TextEncoder().encode(value).length > 255) throw new Error(`Unsafe output segment ${JSON.stringify(value)}.`);
  return value;
}
async function assertMissing(path) { try { await lstat(path); const error = new Error(`Destination already exists: ${path}.`); error.code = "CANVAS_EXPORT_EXISTS"; throw error; } catch (error) { if (error.code !== "ENOENT") throw error; } }
function assertAbsolute(path) { if (typeof path !== "string" || !path.startsWith("/")) throw new Error("Export destination must be an absolute path."); }
function validateRelativeFile(name) {
  if (name.startsWith("/")) throw new Error(`Unsafe bundle filename ${name}.`);
  for (const part of name.split("/")) validateOutputSegment(part);
}

async function canonicalDestinationKey(destination) {
  const missing = [];
  let parent = resolve(destination);
  while (true) {
    try {
      const canonical = await realpath(parent);
      return join(canonical, ...missing.reverse()).normalize("NFC").toLowerCase();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.push(basename(parent));
      const next = dirname(parent);
      if (next === parent) throw error;
      parent = next;
    }
  }
}

async function makeTrackedDirectories(directory, root, directories) {
  if (resolve(directory) === resolve(root)) return;
  const parent = dirname(directory);
  await makeTrackedDirectories(parent, root, directories);
  try {
    await mkdir(directory);
    directories.push({ path: directory, identity: identity(await lstat(directory)) });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw error;
  }
}

function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function sameIdentity(stat, expected) { return stat.dev === expected?.dev && stat.ino === expected?.ino; }
