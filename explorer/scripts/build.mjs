import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_ROOT = new URL("../", import.meta.url);
const DEFAULT_OUTPUT = new URL("../dist/", import.meta.url);

export const EXPLORER_PACKAGE_FILES = [
  "app.html",
  "app.js",
  "explorer-files.mjs",
  "explorer-model.mjs",
  "INSTRUCTIONS.md",
  "operations.js",
  "pdf-preview-model.mjs",
  "penkra-app.json",
  "README.md",
  "styles.css",
  "THIRD_PARTY_NOTICES.md",
];

export const EXPLORER_PACKAGE_DIRECTORIES = ["assets", "operations", "vendor"];

export async function buildExplorerPackage({ root = DEFAULT_ROOT, output = DEFAULT_OUTPUT } = {}) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  await Promise.all(
    EXPLORER_PACKAGE_FILES.map((file) => cp(new URL(file, root), new URL(file, output))),
  );
  await Promise.all(
    EXPLORER_PACKAGE_DIRECTORIES.map((directory) =>
      cp(new URL(`${directory}/`, root), new URL(`${directory}/`, output), { recursive: true }),
    ),
  );
  await writeFile(new URL("package.json", output), '{"type":"module"}\n');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await buildExplorerPackage();
}
