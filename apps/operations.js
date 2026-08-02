const installations = globalThis.penkra?.installations;

function requireInstallations() {
  if (!installations) throw new Error("The trusted Apps installation binding is unavailable.");
  return installations;
}

globalThis.penkra.operations.handle("installations.install", (input) =>
  requireInstallations().install({ appId: input.appId }),
);
globalThis.penkra.operations.handle("installations.update", (input) =>
  requireInstallations().update({ appId: input.appId }),
);
globalThis.penkra.operations.handle("installations.uninstall", (input) =>
  requireInstallations().uninstall({ appId: input.appId, retainData: input.retainData }),
);
