import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

class SchemaVersionServerSpike {
  #documents = new Map();
  #sessions = new Map();

  create(documentId, schemaVersion) {
    this.#documents.set(documentId, { schemaVersion, migrating: false, value: 0 });
  }

  connect(documentId, sessionId, schemaVersion) {
    const document = this.#requireDocument(documentId);
    if (document.migrating) throw protocolError("schema-migrating");
    if (schemaVersion < document.schemaVersion) throw protocolError("schema-stale");
    this.#sessions.set(sessionId, { documentId, schemaVersion, connected: true });
  }

  write(sessionId, update) {
    const session = this.#sessions.get(sessionId);
    if (!session?.connected) throw protocolError("session-disconnected");
    const document = this.#requireDocument(session.documentId);
    if (document.migrating) throw protocolError("schema-migrating");
    if (session.schemaVersion < document.schemaVersion) {
      session.connected = false;
      throw protocolError("schema-stale");
    }
    document.value = update(document.value);
  }

  migrate(documentId, from, to, migration) {
    const document = this.#requireDocument(documentId);
    if (document.schemaVersion !== from || to <= from) throw protocolError("schema-version-conflict");
    document.migrating = true;
    for (const session of this.#sessions.values()) {
      if (session.documentId === documentId) session.connected = false;
    }
    try {
      document.value = migration(document.value);
      document.schemaVersion = to;
    } finally {
      document.migrating = false;
    }
  }

  value(documentId) {
    return structuredClone(this.#requireDocument(documentId));
  }

  #requireDocument(documentId) {
    const document = this.#documents.get(documentId);
    if (!document) throw protocolError("not-found");
    return document;
  }
}

function protocolError(code) {
  return Object.assign(new Error(code), { code });
}

test("migration quiesces a document and stale sessions cannot write afterward", () => {
  const server = new SchemaVersionServerSpike();
  server.create("deck", 3);
  server.connect("deck", "old-tab", 3);
  server.connect("deck", "new-tab", 4);
  server.write("old-tab", (value) => value + 1);

  server.migrate("deck", 3, 4, (value) => value + 10);
  assert.deepEqual(server.value("deck"), { schemaVersion: 4, migrating: false, value: 11 });
  assert.throws(() => server.write("old-tab", (value) => value + 100), { code: "session-disconnected" });
  assert.throws(() => server.connect("deck", "reloaded-old-tab", 3), { code: "schema-stale" });

  server.connect("deck", "reloaded-new-tab", 4);
  server.write("reloaded-new-tab", (value) => value + 1);
  assert.equal(server.value("deck").value, 12);
});

class YjsSchemaServerSpike {
  #doc = new Y.Doc();
  #sessions = new Map();
  #migrating = false;

  constructor(schemaVersion, value) {
    this.#doc.getMap("document").set("canvasSchemaVersion", schemaVersion);
    this.#doc.getMap("document").set("value", value);
  }

  connect(sessionId, schemaVersion) {
    if (this.#migrating) throw protocolError("schema-migrating");
    if (schemaVersion < this.schemaVersion) throw protocolError("schema-stale");
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(this.#doc), "server-sync");
    this.#sessions.set(sessionId, { doc, schemaVersion, connected: true });
    return doc;
  }

  write(sessionId, mutate) {
    const session = this.#sessions.get(sessionId);
    if (!session?.connected) throw protocolError("session-disconnected");
    if (this.#migrating) throw protocolError("schema-migrating");
    if (session.schemaVersion < this.schemaVersion) {
      session.connected = false;
      throw protocolError("schema-stale");
    }
    const before = Y.encodeStateVector(session.doc);
    session.doc.transact(() => mutate(session.doc.getMap("document")), sessionId);
    Y.applyUpdate(this.#doc, Y.encodeStateAsUpdate(session.doc, before), sessionId);
    for (const [id, peer] of this.#sessions) {
      if (id !== sessionId && peer.connected) {
        Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(this.#doc, Y.encodeStateVector(peer.doc)), "server-sync");
      }
    }
  }

  migrate(from, to, migration) {
    if (this.schemaVersion !== from || to <= from) throw protocolError("schema-version-conflict");
    this.#migrating = true;
    try {
      this.#doc.transact(() => {
        const state = this.#doc.getMap("document");
        migration(state);
        state.set("canvasSchemaVersion", to);
      }, "schema-migration");
      for (const session of this.#sessions.values()) session.connected = false;
    } finally {
      this.#migrating = false;
    }
  }

  get schemaVersion() {
    return this.#doc.getMap("document").get("canvasSchemaVersion");
  }

  get value() {
    return this.#doc.getMap("document").get("value");
  }
}

test("a live Yjs document rejects stale two-client writes and quiesces migration", () => {
  const server = new YjsSchemaServerSpike(3, 0);
  const alice = server.connect("alice", 3);
  const bob = server.connect("bob", 4);
  server.write("alice", (state) => state.set("value", state.get("value") + 1));
  assert.equal(bob.getMap("document").get("value"), 1);

  server.migrate(3, 4, (state) => {
    assert.throws(
      () => server.write("bob", (nested) => nested.set("value", 999)),
      { code: "schema-migrating" },
    );
    state.set("value", state.get("value") + 10);
  });
  assert.equal(server.value, 11);
  assert.equal(server.schemaVersion, 4);
  assert.throws(
    () => server.write("alice", (state) => state.set("value", 100)),
    { code: "session-disconnected" },
  );
  assert.throws(() => server.connect("stale-reload", 3), { code: "schema-stale" });

  const current = server.connect("current", 4);
  server.write("current", (state) => state.set("value", state.get("value") + 1));
  assert.equal(server.value, 12);
  assert.equal(current.getMap("document").get("value"), 12);
});
