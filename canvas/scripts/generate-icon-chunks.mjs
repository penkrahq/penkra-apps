import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("src/icon-chunks/", root);
const families = {
  material: "@iconify-json/material-symbols",
  phosphor: "@iconify-json/ph",
  feather: "@iconify-json/feather",
};

export function chunkName(name) {
  return /^[a-z0-9-]+$/u.test(name) ? name.slice(0, 3).padEnd(3, "_") : "___";
}

const MAX_CHUNK_BYTES = 32 * 1024;

function resolvedIcon(catalog, name, trail = new Set()) {
  if (trail.has(name)) throw new Error(`Circular icon alias: ${name}`);
  const icon = catalog.icons?.[name];
  if (icon) return {
    body: icon.body,
    width: icon.width ?? catalog.width ?? 16,
    height: icon.height ?? catalog.height ?? 16,
  };
  const parent = catalog.aliases?.[name]?.parent;
  if (!parent) throw new Error(`Broken icon alias: ${name}`);
  trail.add(name);
  return resolvedIcon(catalog, parent, trail);
}

export async function generateIconChunks() {
  const search = {};
  const manifest = {};
  const routing = {};
  for (const [family, dependency] of Object.entries(families)) {
    const catalog = JSON.parse(await readFile(new URL(`node_modules/${dependency}/icons.json`, root), "utf8"));
    const names = [...new Set([...Object.keys(catalog.icons ?? {}), ...Object.keys(catalog.aliases ?? {})])].sort();
    const entries = new Map();
    for (const name of names) {
      entries.set(name, family === "material" ? 1 : resolvedIcon(catalog, name));
    }
    const baseGroups = new Map();
    for (const name of names) {
      const base = chunkName(name);
      if (!baseGroups.has(base)) baseGroups.set(base, []);
      baseGroups.get(base).push(name);
    }
    const chunks = new Map();
    const splitPrefixes = {};
    for (const [base, group] of baseGroups) {
      let length = 3;
      let groups;
      do {
        groups = new Map();
        for (const name of group) {
          const prefix = name.slice(0, length).padEnd(length, "_");
          if (!groups.has(prefix)) groups.set(prefix, {});
          groups.get(prefix)[name] = entries.get(name);
        }
        if ([...groups.values()].every((icons) => Buffer.byteLength(JSON.stringify(icons)) <= MAX_CHUNK_BYTES)) break;
        length += 1;
        if (length > Math.max(...group.map((name) => name.length))) {
          throw new Error(`A single ${family} icon exceeds the chunk byte limit.`);
        }
      } while (true);
      if (length > 3) splitPrefixes[base] = length;
      for (const [prefix, icons] of groups) chunks.set(prefix, icons);
    }
    const directory = new URL(`${family}/`, output);
    await mkdir(directory, { recursive: true });
    // Remove stale prefix files after a dependency update.
    for (const file of await readdir(directory)) {
      if (!chunks.has(file.replace(/\.json$/u, ""))) {
        await unlink(new URL(file, directory));
      }
    }
    await Promise.all([...chunks].map(([prefix, icons]) =>
      writeFile(new URL(`${prefix}.json`, directory), JSON.stringify(icons))));
    // Verify the on-disk output, not just the in-memory map. A dependency
    // update must not silently ship a missing icon or a broken alias.
    for (const [prefix, icons] of chunks) {
      const written = JSON.parse(await readFile(new URL(`${prefix}.json`, directory), "utf8"));
      for (const name of Object.keys(icons)) {
        if (!Object.hasOwn(written, name)) throw new Error(`Missing generated ${family}:${name}`);
      }
    }
    search[family] = names;
    routing[family] = splitPrefixes;
    manifest[family] = { icons: names.length, chunks: chunks.size };
  }
  await writeFile(new URL("search-index.json", output), JSON.stringify(search));
  await writeFile(new URL("manifest.json", output), JSON.stringify(manifest));
  await writeFile(new URL("../icon-chunk-routing.mjs", output), `export default ${JSON.stringify(routing)};\n`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await generateIconChunks()));
}
