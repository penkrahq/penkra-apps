export const MAX_README_BYTES = 2 * 1024 * 1024;

export function shouldShowOffline(registryError, registryCount, installedCount) {
  return Boolean(registryError) && registryCount === 0 && installedCount === 0;
}

export function launcherApps(apps) {
  return apps.filter((app) => Boolean(app.installed && app.enabled));
}

export function appIconSource(app, registryIconUrl = null) {
  return app.installed?.iconDataUrl ?? registryIconUrl;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] - b.numbers[index];
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

export function appAction(app, installedApp, busyAppId, busyKind = "install", enabled = true) {
  if (busyAppId === app.id) {
    const labels = { install: "Installing…", enable: "Installing…", update: "Updating…", open: "Opening…" };
    return { kind: "busy", label: labels[busyKind] ?? "Working…", disabled: true };
  }
  if (installedApp) {
    if (!enabled) return { kind: "enable", label: "Install", disabled: false };
    if (app.latestVersion && compareVersions(app.latestVersion, installedApp.version) > 0) {
      return { kind: "update", label: "Update", disabled: false };
    }
    return { kind: "open", label: "Open", disabled: false };
  }
  if (app.availability === "registry") return { kind: "install", label: "Install", disabled: false };
  return { kind: "unavailable", label: "Unavailable", disabled: true };
}

export function permissionGrants(permissions, existing = {}, selections = {}) {
  return Object.fromEntries(permissions.map((permission) => [
    permission.permission,
    permission.required || selections[permission.permission] === true || existing[permission.permission] === "granted"
      ? "granted"
      : "denied",
  ]));
}

export function renderMarkdown(markdown) {
  const source = String(markdown ?? "").slice(0, MAX_README_BYTES).replace(/\r\n?/g, "\n");
  if (!source.trim()) return '<p class="markdown-empty">No README is available for this version.</p>';
  const lines = source.split("\n");
  const output = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    output.push(`<${list.tag}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flushCode = () => {
    if (!code) return;
    const language = code.language ? ` data-language="${escapeHtml(code.language)}"` : "";
    output.push(`<pre><code${language}>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
    code = null;
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([^\s`]*)\s*$/);
    if (fence) {
      flushParagraph();
      flushList();
      if (code) flushCode();
      else code = { language: fence[1] ?? "", lines: [] };
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      output.push("<hr>");
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const tag = unordered ? "ul" : "ol";
      if (list?.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((unordered ?? ordered)[1]);
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      output.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  flushCode();
  return output.join("");
}

function parseVersion(value) {
  const match = String(value ?? "").trim().replace(/^v/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([^+]+))?/);
  return {
    numbers: [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0), Number(match?.[3] ?? 0)],
    prerelease: match?.[4] ?? "",
  };
}

function renderInline(value) {
  const tokens = [];
  const token = (html) => {
    const key = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };
  let text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt) => token(`<span class="markdown-image-label">Image: ${escapeHtml(alt || "unnamed")}</span>`));
  text = text.replace(/`([^`]+)`/g, (_match, content) => token(`<code>${escapeHtml(content)}</code>`));
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safeHref = sanitizeHref(href);
    if (!safeHref) return escapeHtml(label);
    const external = /^(https?:|mailto:)/i.test(safeHref);
    return token(`<a href="${escapeHtml(safeHref)}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${escapeHtml(label)}</a>`);
  });
  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1<em>$2</em>");
  return text.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)] ?? "");
}

function sanitizeHref(value) {
  const href = String(value).trim();
  if (href.startsWith("#")) return href;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  return null;
}
