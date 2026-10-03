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

  it("reports a missing board", async () => {
    const missing = "0199a000-0000-7000-8000-000000000002";

    await expect(client.loadDocument(missing)).rejects.toBeInstanceOf(BoardNotFoundError);
    await expect(client.storeDocument(missing, new Uint8Array([1]))).rejects.toBeInstanceOf(BoardNotFoundError);
  });

  it("fails on other backend errors", async () => {
    const unauthorized = createBackendClient({ baseUrl: backend.url, internalToken: "wrong" });

    await expect(unauthorized.loadDocument(board)).rejects.toThrow("backend responded with 401");
    await expect(unauthorized.storeDocument(board, new Uint8Array([1]))).rejects.toThrow("backend responded with 401");
  });
});

describe("config", () => {
  it("reads settings from the environment", () => {
    expect(loadConfig({ PORT: "4321", BACKEND_URL: "http://backend:8080", CODRAW_INTERNAL_TOKEN: "secret" })).toEqual({
      port: 4321,
      backendUrl: "http://backend:8080",
      internalToken: "secret",
    });
  });

  it("defaults the port to 1234", () => {
    expect(loadConfig({ BACKEND_URL: "http://backend:8080", CODRAW_INTERNAL_TOKEN: "secret" }).port).toBe(1234);
  });

  it.each(["BACKEND_URL", "CODRAW_INTERNAL_TOKEN"])("requires %s", (name) => {
    const env: NodeJS.ProcessEnv = { BACKEND_URL: "http://backend:8080", CODRAW_INTERNAL_TOKEN: "secret", [name]: " " };

    expect(() => loadConfig(env)).toThrow(`Environment variable ${name} is required`);
  });
});
