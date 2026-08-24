const runtime = globalThis.penkra;
if (!runtime?.operations)
  throw new Error("Browser requires the Penkra App runtime.");

export async function deliver(input, context, operation) {
  if (context.tab) {
    const result = await context.tab.invoke({ operation, input });
    return operation === "pages.open"
      ? { tabId: context.tab.id, ...result }
      : result;
  }
  const tab = await context.tabs.open({
    route: "/",
    state: operation === "pages.open" ? input : undefined,
  });
  if (operation === "pages.open") {
    const result = await tab.invoke({ operation: "pages.state", input: {} });
    return { tabId: tab.id, ...result };
  }
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
