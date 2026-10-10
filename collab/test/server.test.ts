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
      // Filling in texts asks the backend on its own; the tests of it turn it on.
      searchTextBackfillInterval: null,
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

  it("delivers cursors of participants to the others", async () => {
    await startServer();
    const first = await connect(board);
    const second = await connect(board);

    first.provider.awareness!.setLocalStateField("cursor", { x: 10, y: 20 });

    await waitFor(() => second.provider.awareness!.getStates().get(first.document.clientID)?.cursor !== undefined);
    expect(second.provider.awareness!.getStates().get(first.document.clientID)?.cursor).toEqual({ x: 10, y: 20 });
  });

  it("holds changes and cursors for the broadcast delay and sends them together", async () => {
    await startServer({ broadcastDelay: 300 });
    const first = await connect(board);
    const second = await connect(board);

    first.document.getMap("meta").set("title", "Batched");
    first.provider.awareness!.setLocalStateField("cursor", { x: 1, y: 2 });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(title(second)).toBeUndefined();
    await waitFor(() => title(second) === "Batched");
    await waitFor(() => second.provider.awareness!.getStates().get(first.document.clientID)?.cursor !== undefined);
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
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view", members: {} });
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

    it("relays decisions-changed to the others", async () => {
      await startServer();
      const sender = await connect(board);
      const toReceiver = statelessOf(await connect(board));
      const toSender = statelessOf(sender);

      sender.provider.sendStateless(JSON.stringify({ type: "decisions-changed", decision: "<script>" }));

      await waitFor(() => toReceiver.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(toReceiver).toEqual(['{"type":"decisions-changed"}']);
      expect(toSender).toEqual([]);
    });

    it("relays issues-changed of a viewer to the others", async () => {
      const BOB = "0199a000-0000-7000-8000-0000000000b1";
      await startServer();
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view", members: {} });
      const owner = await connect(board);
      const viewer = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const [toOwner, toViewer] = [owner, viewer].map(statelessOf);

      viewer.provider.sendStateless(JSON.stringify({ type: "issues-changed", link: "<script>" }));

      await waitFor(() => toOwner!.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(toOwner).toEqual(['{"type":"issues-changed"}']);
      expect(toViewer).toEqual([]);
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
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view", members: {} });
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

      backend.access.set(board, { ownerId: ALICE, linkAccess: "view", members: {} });
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
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view", members: {} });
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

      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: {} });
      owner.provider.sendStateless(JSON.stringify({ type: "board-changed" }));

      await expect(bobClosed).resolves.toBe("access-changed");
    });

    it("closes the connection of a member whose role became viewing, and keeps an editor on a board closed to others", async () => {
      await startServer();
      const CAROL = "0199a000-0000-7000-8000-0000000000c1";
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: { [BOB]: "editor", [CAROL]: "editor" } });
      const owner = await connect(board);
      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const carol = await connect(board, () => backend.issueToken(board, { subject: CAROL }));
      const carolClosed = vi.fn();
      carol.provider.on("close", carolClosed);
      const bobClosed = closeReasonOf(bob);
      const bobResynced = new Promise<void>((resolve) =>
        bob.provider.on("authenticated", ({ scope }: { scope: string }) => scope === "readonly" && resolve()),
      );

      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: { [BOB]: "viewer", [CAROL]: "editor" } });
      owner.provider.sendStateless(JSON.stringify({ type: "board-changed" }));

      await expect(bobClosed).resolves.toBe("access-changed");
      await bobResynced;
      expect(carolClosed).not.toHaveBeenCalled();
      carol.document.getMap("meta").set("title", "By a member");
      await waitFor(() => title(owner) === "By a member");
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
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: {} });

      await expect(bobClosed).resolves.toBe("access-changed");
    });

    it("closes the sockets of a user whose account was deleted at the next check", async () => {
      await startServer({ userCheckInterval: 100 });
      const owner = await connect(board);
      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const bobClosed = closeReasonOf(bob);
      const ownerClosed = vi.fn();
      owner.provider.on("close", ownerClosed);

      // Bob deleted his account on another device; the link of the board still lets anybody edit it.
      backend.missingUsers.add(BOB);

      await expect(bobClosed).resolves.toBe("account-deleted");
      expect(ownerClosed).not.toHaveBeenCalled();
    });

    it("closes the connection of a member taken out of the workspace of the board at the next check", async () => {
      await startServer({ accessCheckInterval: 100 });
      backend.access.set(board, {
        ownerId: ALICE,
        linkAccess: "none",
        members: {},
        workspace: { access: "edit", roles: { [ALICE]: "owner", [BOB]: "editor" } },
      });
      await connect(board);
      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      expect(bob.provider.authorizedScope).toBe("read-write");
      const bobClosed = closeReasonOf(bob);
      const rejected = new Promise<string>((resolve) =>
        bob.provider.on("authenticationFailed", ({ reason }: { reason: string }) => resolve(reason)),
      );

      // An administrator took Bob out of the workspace on its page, without the board open.
      backend.access.set(board, {
        ownerId: ALICE,
        linkAccess: "none",
        members: {},
        workspace: { access: "edit", roles: { [ALICE]: "owner" } },
      });

      await expect(bobClosed).resolves.toBe("access-changed");
      await expect(rejected).resolves.toBe("no-access");
    });
  });

  describe("blocked users", () => {
    const BOB = "0199a000-0000-7000-8000-0000000000b1";

    it("rejects a blocked user whose token was issued before the block, and sends them nothing", async () => {
      await startServer();
      const token = await backend.issueToken(board, { subject: BOB });
      backend.blocked.add(BOB);

      await expect(connect(board, token)).rejects.toThrow("user-blocked");
    });

    it("rejects a user whose account was deleted after the token was issued", async () => {
      await startServer();
      const token = await backend.issueToken(board, { subject: BOB });
      backend.missingUsers.add(BOB);

      await expect(connect(board, token)).rejects.toThrow("account-deleted");
    });

    it("closes the connections of a blocked user to all documents at the next check, and keeps the others", async () => {
      await startServer({ userCheckInterval: 100 });
      const owner = await connect(board);
      const onBoard = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const onOther = await connect(otherBoard, () => backend.issueToken(otherBoard, { subject: BOB }));
      const ownerClosed = vi.fn();
      owner.provider.on("close", ownerClosed);
      const reasons = [onBoard, onOther].map(
        ({ provider }) =>
          new Promise<{ code: number; reason: string }>((resolve) =>
            provider.on("close", ({ event }: { event: CloseEvent }) => resolve({ code: event.code, reason: event.reason })),
          ),
      );

      backend.blocked.add(BOB);

      await expect(Promise.all(reasons)).resolves.toEqual([
        { code: 4401, reason: "user-blocked" },
        { code: 4401, reason: "user-blocked" },
      ]);
      expect(ownerClosed).not.toHaveBeenCalled();
      // One request about all connected users at a time.
      expect(backend.userChecks.at(-1)?.slice().sort()).toEqual([ALICE, BOB].sort());
    });

    it("keeps the connections when the backend cannot tell who is blocked", async () => {
      await startServer({ userCheckInterval: 50 });
      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const closed = vi.fn();
      bob.provider.on("close", closed);
      const checks = backend.userChecks.length;
      backend.failingUserChecks = 1_000;
      backend.blocked.add(BOB);

      await waitFor(() => backend.userChecks.length > checks + 1);
      expect(closed).not.toHaveBeenCalled();
    });
  });

  describe("access on connecting", () => {
    const BOB = "0199a000-0000-7000-8000-0000000000b1";

    it("gives the access that the board gives when the user connects, not when the token was issued", async () => {
      await startServer();
      const owner = await connect(board);
      const token = await backend.issueToken(board, { subject: BOB });
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view", members: {} });

      const bob = await connect(board, token);
      bob.document.getMap("meta").set("title", "With an old token");
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(bob.provider.authorizedScope).toBe("readonly");
      expect(title(owner)).toBeUndefined();
    });

    it("gives a signed-in user a read-only connection to a board that its link shows without a sign-in", async () => {
      await startServer();
      backend.access.set(board, { ownerId: ALICE, linkAccess: "public", members: {} });
      const owner = await connect(board);

      const bob = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      bob.document.getMap("meta").set("title", "Reader");
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
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: {} });

      await expect(connect(board, token)).rejects.toThrow("no-access");

      expect(backend.requests).toEqual([{ method: "GET access", boardId: board }]);
    });

    it("gives a member the higher of their role and what the link gives", async () => {
      await startServer();
      const CAROL = "0199a000-0000-7000-8000-0000000000c1";
      const DAVE = "0199a000-0000-7000-8000-0000000000d1";
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: { [BOB]: "editor", [CAROL]: "viewer" } });
      const as = (subject: string) => connect(board, () => backend.issueToken(board, { subject }));

      expect((await as(BOB)).provider.authorizedScope).toBe("read-write");
      expect((await as(CAROL)).provider.authorizedScope).toBe("readonly");
      await expect(as(DAVE)).rejects.toThrow("no-access");

      backend.access.set(board, { ownerId: ALICE, linkAccess: "edit", members: { [CAROL]: "viewer" } });
      expect((await as(CAROL)).provider.authorizedScope).toBe("read-write");
    });

    it("gives the members of the workspace of a board what the workspace gives them", async () => {
      await startServer();
      const ADMIN = "0199a000-0000-7000-8000-0000000000a2";
      const EDITOR = "0199a000-0000-7000-8000-0000000000e2";
      const VIEWER = "0199a000-0000-7000-8000-0000000000f2";
      const roles = { [ALICE]: "owner", [ADMIN]: "admin", [EDITOR]: "editor", [VIEWER]: "viewer" } as const;
      const as = (subject: string) => connect(board, () => backend.issueToken(board, { subject }));

      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: {}, workspace: { access: "edit", roles } });
      expect((await as(EDITOR)).provider.authorizedScope).toBe("read-write");
      expect((await as(VIEWER)).provider.authorizedScope).toBe("readonly");
      await expect(as(BOB)).rejects.toThrow("no-access");

      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: {}, workspace: { access: "view", roles } });
      expect((await as(EDITOR)).provider.authorizedScope).toBe("readonly");

      backend.access.set(board, {
        ownerId: ALICE,
        linkAccess: "none",
        members: { [VIEWER]: "editor" },
        workspace: { access: "none", roles },
      });
      expect((await as(ADMIN)).provider.authorizedScope).toBe("read-write");
      expect((await as(VIEWER)).provider.authorizedScope).toBe("read-write");
      await expect(as(EDITOR)).rejects.toThrow("no-access");
    });

    it("lets the owner edit whatever the link gives", async () => {
      await startServer();
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: {} });

      expect((await connect(board)).provider.authorizedScope).toBe("read-write");
    });

    it("tells a user that the board does not exist when it was deleted after the token was issued", async () => {
      await startServer();
      const token = await backend.issueToken(board, { subject: BOB });
      backend.boards.delete(board);

      await expect(connect(board, token)).rejects.toThrow("board-not-found");
    });
  });

  describe("who changed the document", () => {
    const BOB = "0199a000-0000-7000-8000-0000000000b1";
    const CAROL = "0199a000-0000-7000-8000-0000000000c1";

    const asUser = (subject: string) => () => backend.issueToken(board, { subject });
    const storedEditors = () => backend.editorsOfStores(board).flat();

    it("names the users who changed the document since the previous store with each store, not the others", async () => {
      await startServer();
      const alice = await connect(board);
      const bob = await connect(board, asUser(BOB));
      await connect(board, asUser(CAROL));

      bob.document.getMap("meta").set("title", "Bob");
      await waitFor(() => backend.storesFor(board) === 1);
      alice.document.getMap("meta").set("title", "Alice");
      bob.document.getMap("meta").set("description", "Bob");
      await waitFor(() => backend.storesFor(board) === 2);

      expect(backend.editorsOfStores(board)[0]).toEqual([BOB]);
      expect(new Set(backend.editorsOfStores(board)[1])).toEqual(new Set([ALICE, BOB]));
    });

    it("does not name a participant who may only view", async () => {
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view", members: {} });
      await startServer();
      const owner = await connect(board);
      const viewer = await connect(board, asUser(BOB));

      viewer.document.getMap("meta").set("title", "Viewer");
      owner.document.getMap("meta").set("description", "Owner");
      await waitFor(() => backend.storesFor(board) > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(storedEditors()).toEqual([ALICE]);
    });

    it("names a member who edits a board closed to others, not a member who may only view", async () => {
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: { [BOB]: "editor", [CAROL]: "viewer" } });
      await startServer();
      await connect(board);
      const editor = await connect(board, asUser(BOB));
      const viewer = await connect(board, asUser(CAROL));

      viewer.document.getMap("meta").set("title", "Viewer");
      editor.document.getMap("meta").set("description", "Member");
      await waitFor(() => backend.storesFor(board) > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(storedEditors()).toEqual([BOB]);
    });

    it("names the users of a store that failed with the next store", async () => {
      await startServer();
      const alice = await connect(board);
      const bob = await connect(board, asUser(BOB));
      backend.failingStores = 1;

      bob.document.getMap("meta").set("title", "Bob");
      await waitFor(() => backend.storesFor(board) === 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      alice.document.getMap("meta").set("description", "Alice");
      await waitFor(() => backend.storesFor(board) === 2);

      expect(backend.editorsOfStores(board)[1]).toEqual([BOB, ALICE]);
    });
  });

  describe("texts for search", () => {
    /** Writes a page named `name` with a shape labelled `label`, as the editor does. */
    function writePage(document: Y.Doc, name: string, label: string) {
      document.transact(() => {
        const page = new Y.Map<unknown>();
        page.set("name", name);
        page.set("order", "a0");
        document.getMap("pages").set("page-1", page);
        const shape = new Y.Map<unknown>();
        shape.set("kind", "vertex");
        shape.set("value", label);
        shape.set("order", "a0");
        document.getMap("cells:page-1").set("shape", shape);
      });
    }

    const relabel = (document: Y.Doc, label: string) =>
      (document.getMap("cells:page-1").get("shape") as Y.Map<unknown>).set("value", label);

    /** A stored state of a board with one page. */
    function storedBoard(name: string) {
      const document = new Y.Doc();
      document.getMap("pages").set("page-1", { name, order: "a0" });
      return Y.encodeStateAsUpdate(document);
    }

    it("sends the text of the board after storing its state, and again only once the text changes", async () => {
      await startServer();
      const writer = await connect(board);

      writePage(writer.document, "Схема", "Kafka<br>топик");
      await waitFor(() => backend.searchTexts.get(board) === "Схема\nKafka топик");
      const putsOf = (method: string) => backend.requests.findIndex((r) => r.method === method && r.boardId === board);
      expect(putsOf("PUT")).toBeLessThan(putsOf("PUT search-text"));

      writer.document.getMap("meta").set("title", "Не текст доски");
      await waitFor(() => backend.storesFor(board) === 2);
      relabel(writer.document, "Redis");
      await waitFor(() => backend.searchTexts.get(board) === "Схема\nRedis");

      expect(backend.storesFor(board)).toBe(3);
      expect(backend.searchTextsSent(board)).toEqual([
        { text: "Схема\nKafka топик", onlyIfMissing: false },
        { text: "Схема\nRedis", onlyIfMissing: false },
      ]);
    });

    it("keeps the stored state when the text is not taken, and sends the text with the next store", async () => {
      await startServer();
      const writer = await connect(board);
      backend.failingSearchTexts = 1;

      writePage(writer.document, "Схема", "Kafka");
      await waitFor(() => backend.searchTextsSent(board).length === 1);
      expect(backend.documents.has(board)).toBe(true);
      expect(backend.searchTexts.has(board)).toBe(false);
      writer.document.getMap("meta").set("title", "Ещё правка");

      await waitFor(() => backend.searchTexts.get(board) === "Схема\nKafka");
      expect(backend.storesFor(board)).toBe(2);
    });

    it("fills in the texts of stored boards without one when it starts, and keeps those that are there", async () => {
      backend.documents.set(board, storedBoard("Старая"));
      backend.documents.set(otherBoard, storedBoard("Другая"));
      backend.searchTexts.set(otherBoard, "Есть");

      await startServer({ searchTextBackfillInterval: 60_000 });

      await waitFor(() => backend.searchTexts.get(board) === "Старая");
      expect(backend.searchTextsSent(board)).toEqual([{ text: "Старая", onlyIfMissing: true }]);
      expect(backend.searchTextsSent(otherBoard)).toEqual([]);
      expect(backend.searchTexts.get(otherBoard)).toBe("Есть");
    });

    it("fills in texts from time to time, from memory for a board open in collab", async () => {
      await startServer({ searchTextBackfillInterval: 50, debounce: 60_000, maxDebounce: 60_000 });
      const writer = await connect(board);
      writePage(writer.document, "Открытая", "Kafka");
      // The backend has a state without a text, e.g. one that a collab before the update stored.
      backend.documents.set(board, storedBoard("Сохранённая"));

      await waitFor(() => backend.searchTexts.has(board));

      expect(backend.searchTexts.get(board)).toBe("Открытая\nKafka");
      expect(backend.storesFor(board)).toBe(0);
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
      backend.access.set(board, { ownerId: ALICE, linkAccess: "none", members: {} });
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

  describe("drafts of proposals", () => {
    const BOB = "0199a000-0000-7000-8000-0000000000b1";
    const CAROL = "0199a000-0000-7000-8000-0000000000c1";
    const proposal = "0199a000-0000-7000-8000-000000000301";
    const draft = `proposal:${proposal}`;

    /** A proposal of Bob on the board of Alice, which Bob may only view and Carol edits as a member. */
    beforeEach(() => {
      backend.proposals.set(proposal, {
        authorId: BOB,
        open: true,
        board: { ownerId: ALICE, linkAccess: "view", members: { [CAROL]: "editor" } },
      });
    });

    /** Connects to the draft as the user, with a fresh token of the draft before every connection. */
    const connectToDraft = (subject: string) => connect(draft, () => backend.issueProposalToken(proposal, { subject }));

    function closeReasonOf({ provider }: Connection): Promise<string> {
      return new Promise((resolve) => provider.on("close", ({ event }: { event: CloseEvent }) => resolve(event.reason)));
    }

    const storedDraftTitle = () => {
      const stored = new Y.Doc();
      Y.applyUpdate(stored, backend.drafts.get(proposal)!);
      return stored.getMap("meta").get("title");
    };

    it("loads the draft and lets its author edit it, stored as the draft and not as the board", async () => {
      const stored = new Y.Doc();
      stored.getMap("meta").set("title", "Base");
      backend.drafts.set(proposal, Y.encodeStateAsUpdate(stored));
      await startServer();

      const author = await connectToDraft(BOB);
      expect(title(author)).toBe("Base");
      expect(author.provider.authorizedScope).toBe("read-write");
      author.document.getMap("meta").set("title", "Draft");

      await waitFor(() => backend.storesFor(draft) > 0);
      expect(storedDraftTitle()).toBe("Draft");
      expect(backend.storesFor(board)).toBe(0);
      expect(backend.editorsOfStores(board)).toEqual([]);
    });

    it("gives whoever edits the board a read-only connection, and nobody else any", async () => {
      await startServer();
      const author = await connectToDraft(BOB);

      const owner = await connectToDraft(ALICE);
      const editor = await connectToDraft(CAROL);
      expect(owner.provider.authorizedScope).toBe("readonly");
      expect(editor.provider.authorizedScope).toBe("readonly");
      await expect(connectToDraft("0199a000-0000-7000-8000-0000000000d1")).rejects.toThrow("no-access");

      owner.document.getMap("meta").set("title", "By the owner");
      author.document.getMap("meta").set("description", "By the author");
      await waitFor(() => owner.document.getMap("meta").get("description") === "By the author");
      expect(title(author)).toBeUndefined();
    });

    it("opens a draft only with a token of the proposal, and a board only with a token of the board", async () => {
      await startServer();

      await expect(connect(draft, () => backend.issueToken(proposal, { subject: BOB }))).rejects.toThrow(
        "permission-denied",
      );
      await expect(connect(board, () => backend.issueProposalToken(board))).rejects.toThrow("permission-denied");
      await expect(connect(draft, () => backend.issueProposalToken(otherBoard, { subject: BOB }))).rejects.toThrow(
        "permission-denied",
      );
    });

    it("rejects the draft of a proposal that does not exist, and names that are no drafts, without storing", async () => {
      await startServer();
      backend.proposals.delete(proposal);

      await expect(connectToDraft(BOB)).rejects.toThrow("proposal-not-found");
      await expect(connect("proposal:not-a-uuid")).rejects.toThrow("board-not-found");

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(backend.storesFor(draft)).toBe(0);
    });

    it("makes the author view a closed proposal, whose draft no longer changes", async () => {
      backend.proposals.set(proposal, { ...backend.proposals.get(proposal)!, open: false });
      await startServer();

      const author = await connectToDraft(BOB);

      expect(author.provider.authorizedScope).toBe("readonly");
    });

    it("relays proposals-changed in a draft and makes the author view it once the proposal is closed", async () => {
      await startServer();
      const author = await connectToDraft(BOB);
      const owner = await connectToDraft(ALICE);
      const told: string[] = [];
      author.provider.on("stateless", ({ payload }: { payload: string }) => told.push(payload));
      const authorClosed = closeReasonOf(author);
      const authorResynced = new Promise<void>((resolve) =>
        author.provider.on("authenticated", ({ scope }: { scope: string }) => scope === "readonly" && resolve()),
      );

      backend.proposals.set(proposal, { ...backend.proposals.get(proposal)!, open: false });
      owner.provider.sendStateless(JSON.stringify({ type: "proposals-changed", id: "<script>" }));

      await expect(authorClosed).resolves.toBe("access-changed");
      await authorResynced;
      expect(told).toContain('{"type":"proposals-changed"}');
    });

    it("drops changes that the backend refuses to store for a closed proposal, and checks the connections", async () => {
      await startServer();
      const author = await connectToDraft(BOB);
      author.document.getMap("meta").set("title", "Before");
      await waitFor(() => backend.storesFor(draft) > 0);
      const authorClosed = closeReasonOf(author);

      backend.proposals.set(proposal, { ...backend.proposals.get(proposal)!, open: false });
      author.document.getMap("meta").set("title", "After");

      await expect(authorClosed).resolves.toBe("access-changed");
      expect(storedDraftTitle()).toBe("Before");
    });

    it("closes the connections of the draft of a proposal deleted meanwhile", async () => {
      await startServer();
      const author = await connectToDraft(BOB);
      const closed = closeReasonOf(author);

      backend.proposals.delete(proposal);
      author.document.getMap("meta").set("title", "After deletion");

      await expect(closed).resolves.toBe("proposal-not-found");
      expect(backend.drafts.has(proposal)).toBe(false);
    });

    it("keeps a draft within the size limit of a board document", async () => {
      await startServer({ documentSizeLimit: 2_000 });
      const author = await connectToDraft(BOB);
      const closed = new Promise<string>((resolve) =>
        author.provider.on("close", ({ event }: { event: CloseEvent }) => resolve(event.reason)),
      );

      author.document.getMap("meta").set("title", "x".repeat(3_000));

      await expect(closed).resolves.toBe("document-too-large");
    });

    it("relays proposals-changed of a viewer to the other participants of the board", async () => {
      backend.access.set(board, { ownerId: ALICE, linkAccess: "view", members: {} });
      await startServer();
      const owner = await connect(board);
      const viewer = await connect(board, () => backend.issueToken(board, { subject: BOB }));
      const told: string[] = [];
      owner.provider.on("stateless", ({ payload }: { payload: string }) => told.push(payload));

      viewer.provider.sendStateless(JSON.stringify({ type: "proposals-changed" }));

      await waitFor(() => told.length > 0);
      expect(told).toEqual(['{"type":"proposals-changed"}']);
    });
  });
});
