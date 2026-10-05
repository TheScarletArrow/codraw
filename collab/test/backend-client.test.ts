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

  it("loads the access to a board", async () => {
    backend.access.set(board, { ownerId: "0199a000-0000-7000-8000-0000000000b1", linkAccess: "view" });

    await expect(client.loadAccess(board)).resolves.toEqual({
      ownerId: "0199a000-0000-7000-8000-0000000000b1",
      linkAccess: "view",
    });
    await expect(client.loadAccess("0199a000-0000-7000-8000-000000000002")).rejects.toBeInstanceOf(BoardNotFoundError);
  });

  it("fails on other backend errors", async () => {
    const unauthorized = createBackendClient({ baseUrl: backend.url, internalToken: "wrong" });

    await expect(unauthorized.loadDocument(board)).rejects.toThrow("backend responded with 401");
    await expect(unauthorized.storeDocument(board, new Uint8Array([1]))).rejects.toThrow("backend responded with 401");
    await expect(unauthorized.loadAccess(board)).rejects.toThrow("backend responded with 401");
  });
});

describe("config", () => {
  const env: NodeJS.ProcessEnv = {
    BACKEND_URL: "http://backend:8080",
    CODRAW_INTERNAL_TOKEN: "secret",
    BACKEND_JWKS_URL: "http://backend:8080/.well-known/jwks.json",
  };

  it("reads settings from the environment", () => {
    expect(loadConfig({ ...env, PORT: "4321" })).toEqual({
      port: 4321,
      backendUrl: "http://backend:8080",
      internalToken: "secret",
      jwksUrl: "http://backend:8080/.well-known/jwks.json",
    });
  });

  it("defaults the port to 1234", () => {
    expect(loadConfig(env).port).toBe(1234);
  });

  it.each(["BACKEND_URL", "CODRAW_INTERNAL_TOKEN", "BACKEND_JWKS_URL"])("requires %s", (name) => {
    expect(() => loadConfig({ ...env, [name]: " " })).toThrow(`Environment variable ${name} is required`);
  });
});
