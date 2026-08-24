export const TEXT_EXTENSIONS = new Set([
  "bash", "c", "cc", "conf", "cpp", "cs", "css", "csv", "go", "h", "hpp", "html", "ini",
  "java", "js", "json", "json5", "jsonc", "jsx", "log", "md", "mdown", "mjs", "mts", "php",
  "properties", "py", "rb", "rs", "scss", "sh", "sql", "toml", "ts", "tsv", "tsx", "txt",
  "xml", "yaml", "yml", "zsh",
]);
export const IMAGE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "webp"]);

export function extensionOf(name) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function previewKind(entry) {
  if (entry.kind === "directory") return "directory";
  const extension = extensionOf(entry.name);
  if (extension === "md") return "markdown";
  if (extension === "svg") return "svg";
  if (extension === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  return "unsupported";
}

export function looksLikeText(bytes, truncated = false) {
  if (!(bytes instanceof Uint8Array)) return false;
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: truncated });
    return true;
  } catch {
    return false;
  }
}

export function joinRelative(...parts) {
  return parts.flatMap((part) => String(part ?? "").split(/[\\/]+/)).filter((part) => part && part !== ".").join("/");
}

export function parentRelative(path) {
  const parts = joinRelative(path).split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function treeRowIndent(depth) {
  const normalizedDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
  return `${normalizedDepth * 16}px`;
}

export function finderRelativePath(entry) {
  return entry.kind === "directory" ? entry.relativePath : parentRelative(entry.relativePath);
}

export function fileIconName(entry, expanded = false) {
  if (entry.kind === "directory") return expanded ? "folder-open" : "folder";
  const name = entry.name.toLowerCase();
  const extension = extensionOf(name);
  if ([".gitignore", ".gitattributes", ".gitmodules"].includes(name)) return "git";
  if (/^(package-lock|bun|yarn|pnpm-lock|cargo)\./.test(name) || name.endsWith(".lock")) return "lock";
  if (/^(tsconfig|jsconfig|vite\.config|vitest\.config|eslint\.config)/.test(name)) return "settings";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"].includes(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (["md", "mdown", "markdown", "rst"].includes(extension)) return "markdown";
  if (extension === "tsx") return "react_ts";
  if (["ts", "mts", "cts", "tsbuildinfo"].includes(extension)) return "typescript";
  if (["js", "mjs", "cjs", "jsx"].includes(extension)) return "javascript";
  if (["json", "json5", "jsonc", "jsonl"].includes(extension)) return "json";
  if (["html", "htm", "xml"].includes(extension)) return "html";
  if (["css", "scss", "less"].includes(extension)) return "css";
  if (["yaml", "yml"].includes(extension)) return "yaml";
  if (extension === "toml") return "toml";
  if (extension === "py") return "python";
  if (extension === "rs") return "rust";
  if (extension === "go") return "go";
  if (["db", "sqlite", "sqlite3", "sql"].includes(extension)) return "database";
  return null;
}

export function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function matchesQuery(entry, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const haystack = `${entry.name} ${entry.relativePath}`.toLocaleLowerCase();
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

export function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
