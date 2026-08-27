const APPS_APP_ID = "com.penkra.apps";

export function registerAppsOperations(runtime) {
  if (!runtime?.operations?.handle || !runtime?.installations) {
    throw new Error("The Apps operation runtime is unavailable.");
  }
  const registrations = [
    runtime.operations.handle("list", async (_input, context) => {
      const snapshot = await runtime.installations.getState();
      const spaceId = context.invocation.spaceId;
      const present = new Set(
        snapshot.spaces
          .filter((space) => space.spaceId === spaceId && space.enabled === true)
          .map((space) => space.appId),
      );
      return {
        apps: snapshot.installed
          .filter((app) => app.spaceId === spaceId && present.has(app.id))
          .map((app) => ({
            id: app.id,
            slug: app.slug,
            name: app.name,
            description: app.summary,
            version: app.version,
          }))
          .sort((left, right) => left.slug.localeCompare(right.slug)),
        pageInfo: { nextCursor: null },
      };
    }),
    runtime.operations.handle("listings.open", async (input, context) => {
      const appId = requireCanonicalAppId(requireString(requireRecord(input), "appId"));
      if (context.tab) {
        await context.tab.navigate({ route: "/detail", state: { appId } });
        return { appId, tabId: context.tab.id };
      }
      const tab = await context.tabs.open({ route: "/detail", state: { appId } });
      return { appId, tabId: tab.id };
    }),
    runtime.operations.handle("installations.install", async (input, context) => {
      assertInstallationCaller(context);
      const value = requireRecord(input);
      const snapshot = await runtime.installations.installRegistry({
        slug: requireString(value, "slug"),
        version: requireString(value, "version"),
        spaceId: context.invocation.spaceId,
        permissions: requirePermissions(value.permissions),
      });
      const installed = requireInstalledBySlug(snapshot, value.slug);
      return result(installed.id, context.invocation.spaceId, "installed", installed.version);
    }),
    runtime.operations.handle("installations.update", async (input, context) => {
      assertInstallationCaller(context);
      const value = requireRecord(input);
      const snapshot = await runtime.installations.updateRegistry({
        slug: requireString(value, "slug"),
        version: requireString(value, "version"),
        spaceId: context.invocation.spaceId,
        permissions: requirePermissions(value.permissions),
      });
      const installed = requireInstalledBySlug(snapshot, value.slug);
      return result(installed.id, context.invocation.spaceId, "updated", installed.version);
    }),
    runtime.operations.handle("installations.uninstall", async (input, context) => {
      assertInstallationCaller(context);
      const value = requireRecord(input);
      const appId = requireManagedAppId(value);
      await runtime.installations.uninstall({
        appId,
        spaceId: context.invocation.spaceId,
        retainData: requireBoolean(value, "retainData"),
      });
      return result(appId, context.invocation.spaceId, "uninstalled");
    }),
    runtime.operations.handle("installations.remove-data", async (input, context) => {
      assertInstallationCaller(context);
      const appId = requireManagedAppId(requireRecord(input));
      await runtime.installations.removeData({
        appId,
        spaceId: context.invocation.spaceId,
      });
      return result(appId, context.invocation.spaceId, "data-removed");
    }),
  ];
  return () => registrations.forEach((unregister) => unregister());
}

function assertInstallationCaller(context) {
  if (context?.caller?.kind === "app") {
    const error = new Error("Apps cannot change installations on behalf of another App.");
    error.code = "CALLER_NOT_ALLOWED";
    throw error;
  }
}

function requireRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Operation input must be an object.");
  }
  return value;
}

function requireString(value, key) {
  if (typeof value[key] !== "string" || value[key].trim().length === 0) {
    throw new TypeError(`${key} must be a non-empty string.`);
  }
  return value[key];
}

function requireBoolean(value, key) {
  if (typeof value[key] !== "boolean") throw new TypeError(`${key} must be a boolean.`);
  return value[key];
}

function requireManagedAppId(value) {
  const appId = requireString(value, "appId");
  if (appId === APPS_APP_ID) throw new Error("Apps cannot manage its own installation.");
  return appId;
}

function requireCanonicalAppId(value) {
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){2,}$/.test(value)) {
    throw new TypeError("appId must be a canonical reverse-domain App ID.");
  }
  return value;
}

function requirePermissions(value) {
  const permissions = requireRecord(value);
  return Object.fromEntries(
    Object.entries(permissions).map(([name, grant]) => {
      if (!name || (grant !== "granted" && grant !== "denied")) {
        throw new TypeError("Permission grants must be granted or denied.");
      }
      return [name, grant];
    }),
  );
}

function requireInstalledBySlug(snapshot, slug) {
  const installed = snapshot.installed.find(
    (candidate) =>
      candidate.slug === slug &&
      (!snapshot.currentSpaceId || candidate.spaceId === snapshot.currentSpaceId),
  );
  if (!installed) throw new Error(`${slug} is not installed.`);
  return installed;
}

function result(appId, spaceId, state, version) {
  return { appId, spaceId, state, ...(version === undefined ? {} : { version }) };
}

if (globalThis.penkra) registerAppsOperations(globalThis.penkra);
