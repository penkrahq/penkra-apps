const runtime = globalThis.penkra;
if (!runtime?.operations) throw new Error("Browser requires the Penkra App runtime.");

export async function deliver(input, context, operation) {
  if (context.tab) return context.tab.invoke({ operation, input });
  const tab = await context.tabs.open({ route: "/", state: operation === "pages.open" ? input : undefined });
  if (operation === "pages.open") return { tabId: tab.id };
  return tab.invoke({ operation, input });
}

runtime.operations.handle("pages.open", (input, context) => deliver(input, context, "pages.open"));
runtime.operations.handle("pages.navigate", (input, context) => deliver(input, context, "pages.navigate"));
runtime.operations.handle("pages.evaluate", (input, context) => deliver(input, context, "pages.evaluate"));
runtime.operations.handle("pages.screenshot", (input, context) => deliver(input, context, "pages.screenshot"));
runtime.operations.handle("pages.snapshot", (input, context) => deliver(input, context, "pages.snapshot"));
runtime.operations.handle("pages.click", (input, context) => deliver(input, context, "pages.click"));
runtime.operations.handle("pages.type", (input, context) => deliver(input, context, "pages.type"));
runtime.operations.handle("pages.scroll", (input, context) => deliver(input, context, "pages.scroll"));
runtime.operations.handle("pages.wait", (input, context) => deliver(input, context, "pages.wait"));
