const runtime = globalThis.penkra;

if (!runtime?.operations) throw new Error("Explorer requires the Penkra App runtime.");

export async function openResource(input, context) {
  const navigation = { route: "/open", state: input };
  if (context.tab) {
    await context.tab.navigate(navigation);
    return { tabId: context.tab.id };
  }
  const tab = await context.tabs.open(navigation);
  return { tabId: tab.id };
}

runtime.operations.handle("resources.open", openResource);
