export const TEXT_EXTENSIONS = new Set([
  "css", "html", "js", "json", "md", "mjs", "toml", "ts", "tsx", "txt", "yaml", "yml",
]);
export const IMAGE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "svg", "webp"]);

export function extensionOf(name) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function previewKind(entry) {
  if (entry.kind === "directory") return "directory";
  const extension = extensionOf(entry.name);
  if (extension === "md") return "markdown";
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

export function renderMarkdown(source) {
  return escapeHtml(source).split("\n").map((line) => {
    if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
    if (line.startsWith("```")) return "";
    return line ? `<p>${line}</p>` : "";
  }).join("");
}
