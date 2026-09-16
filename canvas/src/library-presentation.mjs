export const COLLECTION_SORT_OPTIONS = Object.freeze([
  { id: "updated", label: "Last edited" },
  { id: "name", label: "Name" },
  { id: "created", label: "Date created" },
]);

export function sortCollection(items, order = "updated") {
  const copy = [...items];
  if (order === "name") {
    return copy.sort((left, right) => collectionName(left).localeCompare(collectionName(right), undefined, { sensitivity: "base" }));
  }
  const field = order === "created" ? "createdAt" : "updatedAt";
  return copy.sort((left, right) => timestamp(right, field) - timestamp(left, field));
}

export function searchableDocumentText(source, limit = 100_000) {
  const parts = [];
  let length = 0;
  const visit = (value) => {
    if (length >= limit || value === null || value === undefined) return;
    if (typeof value === "string") {
      if (value.startsWith("data:") || value.length > 10_000) return;
      const remaining = limit - length;
      const text = value.slice(0, remaining);
      parts.push(text);
      length += text.length;
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (typeof value === "object") {
      for (const entry of Object.values(value)) visit(entry);
    }
  };
  visit(source);
  return parts.join(" ").toLocaleLowerCase();
}

function collectionName(item) {
  return String(item.title ?? item.name ?? "");
}

function timestamp(item, field) {
  const value = Date.parse(item[field] ?? item.updatedAt ?? item.lastOpenedAt ?? 0);
  return Number.isFinite(value) ? value : 0;
}
