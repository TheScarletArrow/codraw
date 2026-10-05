import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Server } from "@hocuspocus/server";
import { createRemoteJWKSet, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createTokenVerifier } from "../src/auth.js";
import { createBackendClient } from "../src/backend-client.js";
import { createCollabServer, type CollabServerOptions } from "../src/server.js";
import { ALICE, FakeBackend } from "./fake-backend.js";

const board = "0199a000-0000-7000-8000-000000000001";
const otherBoard = "0199a000-0000-7000-8000-000000000002";

describe("collab server", () => {
  let backend: FakeBackend;
  let server: Server | undefined;
  const providers: HocuspocusProvider[] = [];

  beforeEach(async () => {
    backend = new FakeBackend();
    backend.boards.add(board).add(otherBoard);
    await backend.start();
  });

  afterEach(async () => {
    providers.splice(0).forEach((provider) => provider.destroy());
    await server?.destroy();
    await backend.stop();
  });

  async function startServer(options: Partial<CollabServerOptions> = {}): Promise<Server> {
    server = createCollabServer({
      port: 0,
      quiet: true,
      stopOnSignals: false,
      backend: createBackendClient({ baseUrl: backend.url, internalToken: backend.token }),
      // Without a cooldown a token with an unknown key id refetches the keys at once.
      verifyToken: createTokenVerifier(createRemoteJWKSet(new URL(backend.jwksUrl), { cooldownDuration: 0 })),
      debounce: 50,
      maxDebounce: 200,
      ...options,
    });
    await server.listen();
    return server;
  }

  type Connection = { document: Y.Doc; provider: HocuspocusProvider };

  /** Connects to the document; by default with a fresh valid token for it before every connection, like the app. */
  function connect(name: string, token: string | (() => Promise<string>) = () => backend.issueToken(name)) {
    const document = new Y.Doc();
    return new Promise<Connection>((resolve, reject) => {
      const provider = new HocuspocusProvider({
        url: `ws://127.0.0.1:${server!.address.port}`,
        name,
        document,
        token,
        onSynced: () => resolve({ document, provider }),
        onAuthenticationFailed: ({ reason }) => reject(new Error(reason)),
      });
      providers.push(provider);
    });
  }

  async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("Condition was not met in time");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  const title = ({ document }: Connection) => document.getMap("meta").get("title");

  it("reports health", async () => {
    await startServer();

    const response = await fetch(`http://127.0.0.1:${server!.address.port}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "UP" });
  });

  it("delivers changes to participants of the same board only", async () => {
    await startServer();
    const first = await connect(board);
    const second = await connect(board);
    const other = await connect(otherBoard);
    const received = new Promise<unknown>((resolve) =>
      second.document.getMap("meta").observe((event) => resolve(event.target.get("title"))),
    );

    first.document.getMap("meta").set("title", "Architecture");

    await expect(received).resolves.toBe("Architecture");
    expect(title(other)).toBeUndefined();
  });

  it("loads the stored document when a participant connects", async () => {
    const stored = new Y.Doc();
    stored.getMap("meta").set("title", "Stored");
    backend.documents.set(board, Y.encodeStateAsUpdate(stored));
    await startServer();

    expect(title(await connect(board))).toBe("Stored");
  });

  it("stores changes after the debounce delay while participants stay connected", async () => {
    await startServer();
    const participant = await connect(board);

    participant.document.getMap("meta").set("title", "Saved");

    await waitFor(() => backend.storesFor(board) > 0);
  });

  it("stores within the maximum delay while changes keep coming", async () => {
    await startServer({ debounce: 100, maxDebounce: 200 });
    const participant = await connect(board);
    const startedAt = Date.now();

    while (backend.storesFor(board) === 0 && Date.now() - startedAt < 1_000) {
      participant.document.getMap("meta").set("title", `Edit ${Date.now()}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(backend.storesFor(board)).toBeGreaterThan(0);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it("keeps the document across a collab restart", async () => {
    await startServer();
    const before = await connect(board);
    before.document.getMap("meta").set("title", "Survives restart");
    await waitFor(() => backend.storesFor(board) > 0);

    providers.splice(0).forEach((provider) => provider.destroy());
    await server!.destroy();
    await startServer();

    expect(title(await connect(board))).toBe("Survives restart");
  });

  it("stores the document when the last participant leaves", async () => {
    await startServer({ debounce: 10_000, maxDebounce: 60_000 });
    const participant = await connect(board);
    participant.document.getMap("meta").set("title", "Left");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backend.storesFor(board)).toBe(0);

    participant.provider.destroy();

    await waitFor(() => backend.storesFor(board) > 0);
    expect(title(await connect(board))).toBe("Left");
  });

  it.each([
    ["an unknown board", "0199a000-0000-7000-8000-000000000099"],
    ["a name that is not a UUID", "not-a-uuid"],
  ])("rejects %s without storing anything", async (_, name) => {
    await startServer();

    await expect(connect(name)).rejects.toThrow("board-not-found");

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(backend.storesFor(name)).toBe(0);
  });

  it("does not ask the backend about names that are not UUIDs", async () => {
    await startServer();

    await expect(connect("not-a-uuid")).rejects.toThrow("board-not-found");

    expect(backend.requests).toEqual([]);
  });

  describe("changes of the board", () => {
    /** Collects the stateless messages that reach a participant. */
    function statelessOf({ provider }: Connection): string[] {
      const payloads: string[] = [];
      provider.on("stateless", ({ payload }: { payload: string }) => payloads.push(payload));
      return payloads;
    }

    it("relays board-changed to the other participants of the board only, as its own message", async () => {
      await startServer();
      const sender = await connect(board);
      const receiver = await connect(board);
      const other = await connect(otherBoard);
      const [toSender, toReceiver, toOther] = [sender, receiver, other].map(statelessOf);

      sender.provider.sendStateless(JSON.stringify({ type: "board-changed", note: "<script>" }));

      await waitFor(() => toReceiver!.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(toReceiver).toEqual(['{"type":"board-changed"}']);
      expect(toSender).toEqual([]);
      expect(toOther).toEqual([]);
    });

    it("relays comments-changed of a viewer to the others without checking the access", async () => {
      const BOB = "0199a000-0000-7000-8000-0000000000b1";
      await startServer();
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view" });
      const owner = await connect(board);
      const viewer = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const [toOwner, toViewer] = [owner, viewer].map(statelessOf);
      const before = backend.accessRequestsFor(board);

      viewer.provider.sendStateless(JSON.stringify({ type: "comments-changed", thread: "<script>" }));

      await waitFor(() => toOwner!.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(toOwner).toEqual(['{"type":"comments-changed"}']);
      expect(toViewer).toEqual([]);
      expect(backend.accessRequestsFor(board)).toBe(before);
    });

    it("does not relay other stateless messages", async () => {
      await startServer();
      const sender = await connect(board);
      const toReceiver = statelessOf(await connect(board));

      sender.provider.sendStateless("hello");
      sender.provider.sendStateless(JSON.stringify({ type: "something-else" }));
      sender.provider.sendStateless(JSON.stringify(["board-changed"]));

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(toReceiver).toEqual([]);
    });

    it("closes the connections of a board deleted while participants work on it and drops its changes", async () => {
      await startServer();
      const editing = await connect(board);
      const watching = await connect(board);
      const closed = [editing, watching].map(
        ({ provider }) => new Promise<string>((resolve) => provider.on("close", ({ event }: { event: CloseEvent }) => resolve(event.reason))),
      );
      backend.boards.delete(board);

      editing.document.getMap("meta").set("title", "After deletion");

      await expect(Promise.all(closed)).resolves.toEqual(["board-not-found", "board-not-found"]);
      expect(backend.documents.has(board)).toBe(false);
    });
  });

  describe("viewing only", () => {
    const BOB = "0199a000-0000-7000-8000-0000000000b1";

    beforeEach(() => {
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view" });
    });

    it("does not apply changes of a participant who may only view, who still gets the changes of others", async () => {
      await startServer();
      const editor = await connect(board);
      const viewer = await connect(board, () => backend.issueToken(board, { subject: BOB }));

      viewer.document.getMap("meta").set("title", "Viewer");
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(title(editor)).toBeUndefined();

      editor.document.getMap("meta").set("description", "Editor");
      await waitFor(() => viewer.document.getMap("meta").get("description") === "Editor");
      await waitFor(() => backend.storesFor(board) > 0);
      const stored = new Y.Doc();
      Y.applyUpdate(stored, backend.documents.get(board)!);
      expect(stored.getMap("meta").toJSON()).toEqual({ description: "Editor" });
    });

    it("shows the cursor of a participant who may only view to the others", async () => {
      await startServer();
      const editor = await connect(board);
      const viewer = await connect(board, () => backend.issueToken(board, { subject: BOB }));

      viewer.provider.setAwarenessField("cursor", { x: 10, y: 20 });

      await waitFor(() =>
        [...editor.provider.awareness!.getStates().values()].some((state) => state.cursor?.x === 10),
      );
    });

    it("tells the client that its connection is read-only", async () => {
      await startServer();
      const viewer = await connect(board, () => backend.issueToken(board, { subject: BOB }));

      expect(viewer.provider.authorizedScope).toBe("readonly");
      expect((await connect(board)).provider.authorizedScope).toBe("read-write");
    });
  });

  describe("changes of access", () => {
    const BOB = "0199a000-0000-7000-8000-0000000000b1";

    function closeReasonOf({ provider }: Connection): Promise<string> {
      return new Promise((resolve) => provider.on("close", ({ event }: { event: CloseEvent }) => resolve(event.reason)));
    }

    it("closes the connections whose access changed, and their clients reconnect with the new access", async () => {
      await startServer();
      const owner = await connect(board);
      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const ownerClosed = vi.fn();
      owner.provider.on("close", ownerClosed);
      const bobClosed = closeReasonOf(bob);
      const bobResynced = new Promise<void>((resolve) =>
        bob.provider.on("authenticated", ({ scope }: { scope: string }) => scope === "readonly" && resolve()),
      );

      backend.access.set(board, { ownerId: ALICE, linkAccess: "view" });
      owner.provider.sendStateless(JSON.stringify({ type: "board-changed" }));

      await expect(bobClosed).resolves.toBe("access-changed");
      await bobResynced;
      expect(ownerClosed).not.toHaveBeenCalled();
      bob.document.getMap("meta").set("title", "After the change");
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(title(owner)).toBeUndefined();
    });

    it("keeps the connections whose access stays the same", async () => {
      await startServer();
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view" });
      const owner = await connect(board);
      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const closed = vi.fn();
      owner.provider.on("close", closed);
      bob.provider.on("close", closed);
      const before = backend.accessRequestsFor(board);

      bob.provider.sendStateless(JSON.stringify({ type: "board-changed" }));

      await waitFor(() => backend.accessRequestsFor(board) > before);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(closed).not.toHaveBeenCalled();
    });

    it("closes the connections of others when the owner closes the link", async () => {
      await startServer();
      const owner = await connect(board);
      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const bobClosed = closeReasonOf(bob);

      backend.access.set(board, { ownerId: ALICE, linkAccess: "none" });
      owner.provider.sendStateless(JSON.stringify({ type: "board-changed" }));

      await expect(bobClosed).resolves.toBe("access-changed");
    });

    it("closes the connections of a deleted board when it is checked", async () => {
      await startServer();
      const owner = await connect(board);
      const watching = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const closed = closeReasonOf(watching);

      backend.boards.delete(board);
      owner.provider.sendStateless(JSON.stringify({ type: "board-changed" }));

      await expect(closed).resolves.toBe("board-not-found");
    });

    it("checks the access of a document once at a time, however many participants ask", async () => {
      await startServer();
      const owner = await connect(board);
      const before = backend.accessRequestsFor(board);

      for (let i = 0; i < 10; i++) owner.provider.sendStateless(JSON.stringify({ type: "board-changed" }));

      await waitFor(() => backend.accessRequestsFor(board) > before);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(backend.accessRequestsFor(board) - before).toBeLessThanOrEqual(2);
    });

    it("checks the open documents from time to time, also when nobody tells about a change", async () => {
      await startServer({ accessCheckInterval: 100 });
      await connect(board);
      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const bobClosed = closeReasonOf(bob);

      // E.g. the owner closed the link through the API, without the board open.
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none" });

      await expect(bobClosed).resolves.toBe("access-changed");
    });
  });

  describe("access on connecting", () => {
    const BOB = "0199a000-0000-7000-8000-0000000000b1";

    it("gives the access that the board gives when the user connects, not when the token was issued", async () => {
      await startServer();
      const owner = await connect(board);
      const token = await backend.issueToken(board, { subject: BOB });
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view" });

      const bob = await connect(board, token);
      bob.document.getMap("meta").set("title", "With an old token");
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(bob.provider.authorizedScope).toBe("readonly");
      expect(title(owner)).toBeUndefined();
    });

    it("rejects a user whom the board no longer gives access, whatever their token, and sends them nothing", async () => {
      await startServer();
      const stored = new Y.Doc();
      stored.getMap("meta").set("title", "Secret");
      backend.documents.set(board, Y.encodeStateAsUpdate(stored));
      const token = await backend.issueToken(board, { subject: BOB });
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none" });

      await expect(connect(board, token)).rejects.toThrow("no-access");

      expect(backend.requests).toEqual([{ method: "GET access", boardId: board }]);
    });

    it("lets the owner edit whatever the link gives", async () => {
      await startServer();
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none" });

      expect((await connect(board)).provider.authorizedScope).toBe("read-write");
    });

    it("tells a user that the board does not exist when it was deleted after the token was issued", async () => {
      await startServer();
      const token = await backend.issueToken(board, { subject: BOB });
      backend.boards.delete(board);

      await expect(connect(board, token)).rejects.toThrow("board-not-found");
    });
  });

  describe("size of documents", () => {
    function closeReasonOf({ provider }: Connection): Promise<{ code: number; reason: string }> {
      return new Promise((resolve) =>
        provider.on("close", ({ event }: { event: CloseEvent }) => resolve({ code: event.code, reason: event.reason })),
      );
    }

    const storedTitle = () => {
      const stored = new Y.Doc();
      Y.applyUpdate(stored, backend.documents.get(board)!);
      return stored.getMap("meta").get("title");
    };

    it("rejects a change that would make the document larger than the limit, which nobody else gets", async () => {
      await startServer({ documentSizeLimit: 2_000 });
      const writer = await connect(board);
      const other = await connect(board);
      writer.document.getMap("meta").set("title", "Small");
      await waitFor(() => title(other) === "Small");
      const closed = closeReasonOf(writer);

      writer.document.getMap("meta").set("title", "x".repeat(3_000));

      await expect(closed).resolves.toMatchObject({ reason: "document-too-large" });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(title(other)).toBe("Small");
      expect(storedTitle()).toBe("Small");
    });

    it("lets a participant delete from a document that is larger than the limit", async () => {
      const large = new Y.Doc();
      large.getMap("meta").set("title", "x".repeat(3_000));
      backend.documents.set(board, Y.encodeStateAsUpdate(large));
      await startServer({ documentSizeLimit: 2_000 });
      const writer = await connect(board);
      const other = await connect(board);

      writer.document.getMap("meta").delete("title");

      await waitFor(() => title(other) === undefined);
      await waitFor(() => storedTitle() === undefined);
    });

    it("counts the document exactly again once it is stored", async () => {
      await startServer({ documentSizeLimit: 2_000 });
      const writer = await connect(board);
      const other = await connect(board);
      writer.document.getMap("meta").set("title", "a".repeat(1_500));
      await waitFor(() => backend.storesFor(board) > 0);
      writer.document.getMap("meta").delete("title");
      await waitFor(() => backend.storesFor(board) > 1);

      // Counted change by change, the document would have 1 500 bytes of the deleted title and these.
      writer.document.getMap("meta").set("title", "b".repeat(1_500));

      await waitFor(() => title(other) === "b".repeat(1_500));
    });

    it("closes the socket of a message that cannot fit into a document", async () => {
      await startServer({ documentSizeLimit: 1_000 });
      const writer = await connect(board);
      const closed = closeReasonOf(writer);

      writer.document.getMap("meta").set("title", "x".repeat(100_000));

      await expect(closed).resolves.toMatchObject({ code: 1009 });
    });
  });

  describe("metrics", () => {
    const scrape = async () => {
      const response = await fetch(`http://127.0.0.1:${server!.address.port}/metrics`);
      expect(response.headers.get("content-type")).toContain("text/plain");
      return response.text();
    };

    /** The value of a sample of the metrics, e.g. `codraw_collab_stores_total{result="stored"}`. */
    const sample = (text: string, name: string) => {
      const line = text.split("\n").find((line) => line.startsWith(`${name} `));
      return line === undefined ? undefined : Number(line.slice(name.length + 1));
    };

    it("counts the connections and the open documents, next to the metrics of the process", async () => {
      await startServer();
      await connect(board);
      await connect(board);

      const text = await scrape();

      expect(sample(text, "codraw_collab_connections")).toBe(2);
      expect(sample(text, "codraw_collab_documents")).toBe(1);
      expect(text).toContain("process_cpu_user_seconds_total");
    });

    it("counts the stores of documents by result, with their time", async () => {
      await startServer();
      const writer = await connect(board);

      writer.document.getMap("meta").set("title", "Stored");

      await vi.waitFor(async () => {
        const text = await scrape();
        expect(sample(text, 'codraw_collab_stores_total{result="stored"}')).toBeGreaterThan(0);
        expect(sample(text, "codraw_collab_store_duration_seconds_count")).toBeGreaterThan(0);
        expect(sample(text, 'codraw_collab_stores_total{result="failed"}')).toBe(0);
      });
    });

    it("counts the refusals by reason", async () => {
      const BOB = "0199a000-0000-7000-8000-0000000000b1";
      await startServer({ documentSizeLimit: 2_000 });
      await expect(connect(board, "")).rejects.toThrow("permission-denied");
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none" });
      await expect(connect(board, () => backend.issueToken(board, { subject: BOB }))).rejects.toThrow("no-access");
      const writer = await connect(board);

      writer.document.getMap("meta").set("title", "x".repeat(3_000));

      await vi.waitFor(async () => {
        const text = await scrape();
        expect(sample(text, 'codraw_collab_rejections_total{reason="permission-denied"}')).toBe(1);
        expect(sample(text, 'codraw_collab_rejections_total{reason="no-access"}')).toBe(1);
        expect(sample(text, 'codraw_collab_rejections_total{reason="document-too-large"}')).toBe(1);
        expect(sample(text, 'codraw_collab_rejections_total{reason="board-not-found"}')).toBe(0);
      });
    });
  });

  describe("access to documents", () => {
    async function expectRejected(token: string, name = board) {
      await startServer();
      const stored = new Y.Doc();
      stored.getMap("meta").set("title", "Secret");
      backend.documents.set(board, Y.encodeStateAsUpdate(stored));

      await expect(connect(name, token)).rejects.toThrow("permission-denied");

      expect(backend.requests).toEqual([]);
    }

    it("rejects a connection without a token", async () => {
      await expectRejected("");
    });

    it("rejects an expired token", async () => {
      await expectRejected(await backend.issueToken(board, { expiresAt: Math.floor(Date.now() / 1000) - 1 }));
    });

    it("rejects a token issued for another board", async () => {
      await expectRejected(await backend.issueToken(otherBoard));
    });

    it("rejects a token with a forged signature", async () => {
      const { privateKey } = await generateKeyPair("RS256");

      await expectRejected(await backend.issueToken(board, { signWith: privateKey }));
    });

    it("rejects a token for another audience", async () => {
      await expectRejected(await backend.issueToken(board, { audience: "another-service" }));
    });

    it("rejects a value that is not a token", async () => {
      await expectRejected("not-a-jwt");
    });

    it("does not send changes of the document to a rejected client", async () => {
      await startServer();
      const owner = await connect(board);
      const intruder = new Y.Doc();
      const rejected = new Promise<string>((resolve) => {
        providers.push(
          new HocuspocusProvider({
            url: `ws://127.0.0.1:${server!.address.port}`,
            name: board,
            document: intruder,
            token: "",
            onAuthenticationFailed: ({ reason }) => resolve(reason),
          }),
        );
      });
      await expect(rejected).resolves.toBe("permission-denied");

      owner.document.getMap("meta").set("title", "Private");
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(intruder.getMap("meta").get("title")).toBeUndefined();
    });

    it("accepts tokens signed with a new key after the backend rotates its key", async () => {
      await startServer();
      await connect(board);

      await backend.rotateKey();

      expect(title(await connect(otherBoard))).toBeUndefined();
    });

    it("reconnects with a new token after the previous one has expired", async () => {
      await startServer();
      // The first token is valid for one to two seconds only.
      const expiresAt = Math.ceil(Date.now() / 1000) + 1;
      let issued = 0;
      const participant = await connect(board, () => {
        issued++;
        return backend.issueToken(board, issued === 1 ? { expiresAt } : {});
      });
      await new Promise((resolve) => setTimeout(resolve, expiresAt * 1000 - Date.now() + 50));
      const resynced = new Promise<void>((resolve) => participant.provider.on("synced", () => resolve()));

      // The connection drops; the provider reconnects on its own.
      participant.provider.configuration.websocketProvider.webSocket!.close();

      await resynced;
      expect(issued).toBe(2);
    }, 10_000);
  });
});
