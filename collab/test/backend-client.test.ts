import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BoardNotFoundError, createBackendClient, type BackendClient } from "../src/backend-client.js";
import { loadConfig } from "../src/config.js";
import { FakeBackend } from "./fake-backend.js";

const board = "0199a000-0000-7000-8000-000000000001";

describe("backend client", () => {
  let backend: FakeBackend;
  let client: BackendClient;

  beforeEach(async () => {
    backend = new FakeBackend();
    await backend.start();
    backend.boards.add(board);
    client = createBackendClient({ baseUrl: backend.url, internalToken: backend.token });
  });

  afterEach(async () => {
    await backend.stop();
  });

  it("returns null for a board without a document", async () => {
    await expect(client.loadDocument(board)).resolves.toBeNull();
  });

  it("stores a document and loads it back", async () => {
    await client.storeDocument(board, new Uint8Array([1, 2, 3, 0, 255]));

    await expect(client.loadDocument(board)).resolves.toEqual(new Uint8Array([1, 2, 3, 0, 255]));
  });

  it("names the users who changed the document in a header of the store, only when there are any", async () => {
    await client.storeDocument(board, new Uint8Array([1]), ["0199a000-0000-7000-8000-0000000000a1", "0199a000-0000-7000-8000-0000000000b1"]);
    await client.storeDocument(board, new Uint8Array([2]));

    expect(backend.requests.filter((request) => request.method === "PUT").map((request) => request.editors)).toEqual([
      ["0199a000-0000-7000-8000-0000000000a1", "0199a000-0000-7000-8000-0000000000b1"],
      undefined,
    ]);
  });

  it("reports a missing board", async () => {
    const missing = "0199a000-0000-7000-8000-000000000002";

    await expect(client.loadDocument(missing)).rejects.toBeInstanceOf(BoardNotFoundError);
    await expect(client.storeDocument(missing, new Uint8Array([1]))).rejects.toBeInstanceOf(BoardNotFoundError);
  });

  it("loads the access to a board with the roles of its members", async () => {
    backend.access.set(board, {
      ownerId: "0199a000-0000-7000-8000-0000000000b1",
      linkAccess: "view",
      members: { "0199a000-0000-7000-8000-0000000000c1": "editor" },
    });

    await expect(client.loadAccess(board)).resolves.toEqual({
      ownerId: "0199a000-0000-7000-8000-0000000000b1",
      linkAccess: "view",
      members: { "0199a000-0000-7000-8000-0000000000c1": "editor" },
    });
    await expect(client.loadAccess("0199a000-0000-7000-8000-000000000002")).rejects.toBeInstanceOf(BoardNotFoundError);
  });

  it("asks which users are gone and which are blocked with one request, and nothing without users", async () => {
    backend.missingUsers.add("0199a000-0000-7000-8000-0000000000b1");
    backend.blocked.add("0199a000-0000-7000-8000-0000000000c1");

    await expect(
      client.checkUsers([
        "0199a000-0000-7000-8000-0000000000b1",
        "0199a000-0000-7000-8000-0000000000c1",
        "0199a000-0000-7000-8000-0000000000d1",
      ]),
    ).resolves.toEqual({ missing: ["0199a000-0000-7000-8000-0000000000b1"], blocked: ["0199a000-0000-7000-8000-0000000000c1"] });
    await expect(client.checkUsers([])).resolves.toEqual({ missing: [], blocked: [] });
    expect(backend.userChecks).toHaveLength(1);
  });

  it("fails when the backend cannot tell about the users", async () => {
    backend.failingUserChecks = 1;

    await expect(client.checkUsers(["alice"])).rejects.toThrow("500");
  });

  it("fails on other backend errors", async () => {
    const unauthorized = createBackendClient({ baseUrl: backend.url, internalToken: "wrong" });

    await expect(unauthorized.loadDocument(board)).rejects.toThrow("backend responded with 401");
    await expect(unauthorized.storeDocument(board, new Uint8Array([1]))).rejects.toThrow("backend responded with 401");
    await expect(unauthorized.loadAccess(board)).rejects.toThrow("backend responded with 401");
    await expect(unauthorized.storeSearchText(board, "Схема")).rejects.toThrow("backend responded with 401");
    await expect(unauthorized.boardsWithoutSearchText(null, 10)).rejects.toThrow("backend responded with 401");
    await expect(unauthorized.checkUsers([board])).rejects.toThrow("backend responded with 401");
  });

  it("stores the text of a board for search in UTF-8, and only while it has none when asked so", async () => {
    await client.storeDocument(board, new Uint8Array([1]));

    await expect(client.storeSearchText(board, "Схема\nЁлка 😀")).resolves.toBe(true);
    await expect(client.storeSearchText(board, "Старее", { onlyIfMissing: true })).resolves.toBe(false);

    expect(backend.searchTexts.get(board)).toBe("Схема\nЁлка 😀");
    expect(backend.searchTextsSent(board)).toEqual([
      { text: "Схема\nЁлка 😀", onlyIfMissing: false },
      { text: "Старее", onlyIfMissing: true },
    ]);
  });

  it("reports a board without a stored document when storing its text", async () => {
    await expect(client.storeSearchText(board, "Схема")).rejects.toBeInstanceOf(BoardNotFoundError);
  });

  it("lists the boards without a text page by page", async () => {
    const boards = ["0199a000-0000-7000-8000-000000000003", "0199a000-0000-7000-8000-000000000004"];
    for (const id of [board, ...boards]) {
      backend.boards.add(id);
      await client.storeDocument(id, new Uint8Array([1]));
    }
    await client.storeSearchText(board, "Есть");

    await expect(client.boardsWithoutSearchText(null, 1)).resolves.toEqual([boards[0]]);
    await expect(client.boardsWithoutSearchText(boards[0]!, 5)).resolves.toEqual([boards[1]]);
  });
});

describe("config", () => {
  const env: NodeJS.ProcessEnv = {
    BACKEND_URL: "http://backend:8080",
    CODRAW_INTERNAL_TOKEN: "secret",
    BACKEND_JWKS_URL: "http://backend:8080/.well-known/jwks.json",
  };

  it("reads settings from the environment", () => {
    expect(loadConfig({ ...env, PORT: "4321", ACCESS_CHECK_INTERVAL_MS: "5000" })).toEqual({
      port: 4321,
      backendUrl: "http://backend:8080",
      internalToken: "secret",
      jwksUrl: "http://backend:8080/.well-known/jwks.json",
      accessCheckInterval: 5000,
      userCheckInterval: 10_000,
      documentSizeLimit: 16 * 1024 * 1024,
      broadcastDelay: 0,
      logFormat: "text",
    });
  });

  it("sends changes at once unless a delay of the broadcast is set", () => {
    expect(loadConfig({ ...env, BROADCAST_DELAY_MS: "25" }).broadcastDelay).toBe(25);
    expect(loadConfig({ ...env, BROADCAST_DELAY_MS: "0" }).broadcastDelay).toBe(0);
    expect(() => loadConfig({ ...env, BROADCAST_DELAY_MS: "-5" })).toThrow("BROADCAST_DELAY_MS");
  });

  it("defaults the port to 1234, the access check to once a minute and the document size to 16 MiB", () => {
    expect(loadConfig(env)).toMatchObject({ port: 1234, accessCheckInterval: 60_000, documentSizeLimit: 16_777_216 });
    expect(loadConfig({ ...env, DOCUMENT_SIZE_LIMIT_BYTES: "1048576" }).documentSizeLimit).toBe(1_048_576);
  });

  it("reads the format of the log", () => {
    expect(loadConfig({ ...env, LOG_FORMAT: "json" }).logFormat).toBe("json");
    expect(() => loadConfig({ ...env, LOG_FORMAT: "xml" })).toThrow("LOG_FORMAT");
  });

  it("reads the period of checking the users of the connections", () => {
    expect(loadConfig({ ...env, USER_CHECK_INTERVAL_MS: "2000" }).userCheckInterval).toBe(2_000);
    expect(() => loadConfig({ ...env, USER_CHECK_INTERVAL_MS: "0" })).toThrow("USER_CHECK_INTERVAL_MS");
  });

  it.each(["0", "-1", "1.5", "minute"])("rejects an access check interval of %s", (value) => {
    expect(() => loadConfig({ ...env, ACCESS_CHECK_INTERVAL_MS: value })).toThrow("ACCESS_CHECK_INTERVAL_MS");
  });

  it.each(["BACKEND_URL", "CODRAW_INTERNAL_TOKEN", "BACKEND_JWKS_URL"])("requires %s", (name) => {
    expect(() => loadConfig({ ...env, [name]: " " })).toThrow(`Environment variable ${name} is required`);
  });
});
