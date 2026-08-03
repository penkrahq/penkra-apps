export function normalizeAddress(value) {
  const address = String(value ?? "").trim();
  if (!address) return "about:blank";
  if (/^[a-z][a-z\d+.-]*:/i.test(address)) return address;
  if (/^[^\s/]+\.[^\s]+/.test(address)) return `https://${address}`;
  return `https://www.google.com/search?q=${encodeURIComponent(address)}`;
}

export function displayAddress(url) {
  return url === "about:blank" ? "" : url;
}

export function pageLabel(page) {
  if (page.title && page.title !== "about:blank") return page.title;
  if (page.url === "about:blank") return "New tab";
  try { return new URL(page.url).hostname || page.url; } catch { return page.url; }
}
