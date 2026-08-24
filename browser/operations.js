const runtime = globalThis.penkra;
if (!runtime?.operations)
  throw new Error("Browser requires the Penkra App runtime.");

export async function deliver(input, context, operation) {
  if (context.tab) return context.tab.invoke({ operation, input });
  const tab = await context.tabs.open({
    route: "/",
    state: operation === "pages.open" ? input : undefined,
  });
  if (operation === "pages.open") return { tabId: tab.id };
  return tab.invoke({ operation, input });
}

export async function deliverToExistingTab(input, context, operation) {
  if (!context.tab) {
    throw new Error(
      `${operation} requires an exact Browser tabId. List Browser tabs and retry against the tab that owns the page.`,
    );
  }
  return context.tab.invoke({ operation, input });
}

runtime.operations.handle("pages.open", (input, context) =>
  deliver(input, context, "pages.open"),
);
runtime.operations.handle("pages.navigate", (input, context) =>
  deliver(input, context, "pages.navigate"),
);
runtime.operations.handle("pages.evaluate", (input, context) =>
  deliver(input, context, "pages.evaluate"),
);
runtime.operations.handle("pages.close", (input, context) =>
  deliverToExistingTab(input, context, "pages.close"),
);
