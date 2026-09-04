import { access, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function writeAtomicFile(destination, bytes) {
  assertAbsolute(destination); await assertMissing(destination);
  const directory = dirname(destination); await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(destination)}.${crypto.randomUUID()}.tmp`);
  try { await writeFile(temporary, bytes); await rename(temporary, destination); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
  return destination;
}

export async function writeAtomicBundle(destination, files) {
  assertAbsolute(destination); await assertMissing(destination);
  const parent = dirname(destination); await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, `.${basename(destination)}.`));
  try {
    const names = new Set();
    for (const [name, value] of files) {
      validateRelativeFile(name);
      const normalized = name.normalize("NFC").toLowerCase();
      if (names.has(normalized)) throw new Error(`Export filename collision: ${name}.`);
      names.add(normalized); const path = join(temporary, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, value);
    }
    await rename(temporary, destination);
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
  return destination;
}

export function validateOutputSegment(value) {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC") || /[\/\\\0-\x1f]/u.test(value) || value === "." || value === ".." || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value) || new TextEncoder().encode(value).length > 255) throw new Error(`Unsafe output segment ${JSON.stringify(value)}.`);
  return value;
}
async function assertMissing(path) { try { await access(path); const error = new Error(`Destination already exists: ${path}.`); error.code = "CANVAS_EXPORT_EXISTS"; throw error; } catch (error) { if (error.code !== "ENOENT") throw error; } }
function assertAbsolute(path) { if (typeof path !== "string" || !path.startsWith("/")) throw new Error("Export destination must be an absolute path."); }
function validateRelativeFile(name) {
  if (name.startsWith("/")) throw new Error(`Unsafe bundle filename ${name}.`);
  for (const part of name.split("/")) validateOutputSegment(part);
}
