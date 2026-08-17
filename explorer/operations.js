const runtime = globalThis.penkra;

if (!runtime?.operations) throw new Error("Explorer requires the Penkra App runtime.");

export async function openResource(input, context) {
  const navigation = {
    route: "/open",
    state: { id: input.handleId, kind: input.kind, name: input.name },
  };
  if (context.tab) {
    await context.tab.navigate(navigation);
    return { tabId: context.tab.id };
  }
  const tab = await context.tabs.open(navigation);
  return { tabId: tab.id };
}

runtime.operations.handle("resources.open", openResource);
