const SHIPPED_ENGINE = "/vendor/open-pencil/engine.mjs";

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (!resolved.url.endsWith(SHIPPED_ENGINE)) return resolved;
  return {
    ...resolved,
    url: resolved.url.replace(SHIPPED_ENGINE, "/vendor/open-pencil/engine.source.mjs"),
    shortCircuit: true,
  };
}
