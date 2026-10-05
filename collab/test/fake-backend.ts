import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { BoardAccess } from "../src/backend-client.js";

/** The user that tokens are issued to by default, and the owner of the boards. */
export const ALICE = "0199a000-0000-7000-8000-0000000000a1";

export interface TokenOptions {
  audience?: string;
  /** Expiry as a timestamp in seconds or a period from now, e.g. "5m". */
  expiresAt?: number | string;
  /** Signs with this key instead of the published one, keeping the published key id. */
  signWith?: CryptoKey;
  /** The access the token gives; `null` leaves the claim out. */
  access?: "edit" | "view" | null;
  /** The user the token is issued to. */
  subject?: string;
}

/** In-memory stand-in for the backend: the internal API, the collab token keys and token issuing. */
export class FakeBackend {
  readonly boards = new Set<string>();
  readonly documents = new Map<string, Uint8Array>();
  /** Access to the boards; a board without an entry is owned by {@link ALICE} and editable through its link. */
  readonly access = new Map<string, BoardAccess>();
  readonly requests: { method: string; boardId: string }[] = [];
  private keys: { kid: string; privateKey: CryptoKey; publicJwk: JWK }[] = [];
  private server?: Server;

  constructor(readonly token = "test-token") {}

  get url(): string {
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  get jwksUrl(): string {
    return `${this.url}/.well-known/jwks.json`;
  }

  /** Starts signing with a new key and publishes it in front of the previous ones. */
  async rotateKey(): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const kid = `key-${this.keys.length + 1}`;
    this.keys.unshift({ kid, privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" } });
  }

  /** Issues a collab token for the board like the backend does; options build invalid tokens. */
  issueToken(
    board: string,
    { audience = "codraw-collab", expiresAt = "5m", signWith, access = "edit", subject = ALICE }: TokenOptions = {},
  ): Promise<string> {
    const key = this.keys[0]!;
    return new SignJWT({ board, name: "Alice", avatar: "https://avatars.example.com/alice.png", ...(access && { access }) })
      .setProtectedHeader({ alg: "RS256", kid: key.kid })
      .setSubject(subject)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(signWith ?? key.privateKey);
  }

  storesFor(boardId: string): number {
    return this.requests.filter((r) => r.method === "PUT" && r.boardId === boardId).length;
  }

  accessRequestsFor(boardId: string): number {
    return this.requests.filter((r) => r.method === "GET access" && r.boardId === boardId).length;
  }

  async start(): Promise<void> {
    await this.rotateKey();
    this.server = createServer(async (request, response) => {
      if (request.url === "/.well-known/jwks.json") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ keys: this.keys.map((key) => key.publicJwk) }));
        return;
      }
      const match = /^\/internal\/boards\/([^/]+)\/(document|access)$/.exec(request.url ?? "");
      if (!match) {
        response.writeHead(404).end();
        return;
      }
      const boardId = decodeURIComponent(match[1]!);
      const isAccess = match[2] === "access";
      this.requests.push({ method: `${request.method ?? ""}${isAccess ? " access" : ""}`, boardId });

      if (request.headers["x-internal-token"] !== this.token) {
        response.writeHead(401).end();
        return;
      }
      if (!this.boards.has(boardId)) {
        response.writeHead(404).end();
        return;
      }
      if (isAccess) {
        const access = this.access.get(boardId) ?? { ownerId: ALICE, linkAccess: "edit" };
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(access));
        return;
      }
      if (request.method === "GET") {
        const state = this.documents.get(boardId);
        if (state) {
          response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(state);
        } else {
          response.writeHead(204).end();
        }
        return;
      }
      if (request.method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        this.documents.set(boardId, new Uint8Array(Buffer.concat(chunks)));
        response.writeHead(204).end();
        return;
      }
      response.writeHead(405).end();
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server?.close((error) => (error ? reject(error) : resolve())));
  }
}
