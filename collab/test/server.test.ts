import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Server } from "@hocuspocus/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createBackendClient } from "../src/backend-client.js";
import { createCollabServer, type CollabServerOptions } from "../src/server.js";
import { FakeBackend } from "./fake-backend.js";

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
      debounce: 50,
      maxDebounce: 200,
      ...options,
    });
    await server.listen();
    return server;
  }

  type Connection = { document: Y.Doc; provider: HocuspocusProvider };

  function connect(name: string): Promise<Connection> {
    const document = new Y.Doc();
    return new Promise((resolve, reject) => {
      const provider = new HocuspocusProvider({
        url: `ws://127.0.0.1:${server!.address.port}`,
        name,
        document,
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
});
