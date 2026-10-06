import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { BoardAccess, DraftAccess } from "../src/backend-client.js";

/** The user that tokens are issued to by default, and the owner of the boards. */
export const ALICE = "0199a000-0000-7000-8000-0000000000a1";

export interface TokenOptions {
  audience?: string;
  /** Expiry as a timestamp in seconds or a period from now, e.g. "5m". */
  expiresAt?: number | string;
  /** Signs with this key instead of the published one, keeping the published key id. */
  signWith?: CryptoKey;
  /** The user the token is issued to. */
  subject?: string;
}

/** In-memory stand-in for the backend: the internal API, the collab token keys and token issuing. */
export class FakeBackend {
  readonly boards = new Set<string>();
  readonly documents = new Map<string, Uint8Array>();
  /** Access to the boards; a board without an entry is owned by {@link ALICE} and editable through its link. */
  readonly access = new Map<string, BoardAccess>();
  /** Proposals by their ids: who wrote them, whether they are open and the access to their boards. */
  readonly proposals = new Map<string, DraftAccess>();
  /** The stored drafts of the proposals by their ids. */
  readonly drafts = new Map<string, Uint8Array>();
  /** Requests to the internal API; those about a draft name it as collab does, `proposal:<id>`. */
  readonly requests: { method: string; boardId: string; editors?: string[] }[] = [];
  /** How many of the next stores fail with 500, as when the database is down. */
  failingStores = 0;
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
  issueToken(board: string, options: TokenOptions = {}): Promise<string> {
    return this.sign({ board }, options);
  }

  /** Issues a collab token for the draft of the proposal like the backend does: it names the proposal, not a board. */
  issueProposalToken(proposal: string, options: TokenOptions = {}): Promise<string> {
    return this.sign({ proposal }, options);
  }

  private sign(
    document: { board: string } | { proposal: string },
    { audience = "codraw-collab", expiresAt = "5m", signWith, subject = ALICE }: TokenOptions,
  ): Promise<string> {
    const key = this.keys[0]!;
    return new SignJWT({ ...document, name: "Alice", avatar: "https://avatars.example.com/alice.png" })
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

  /** The users that each store of the board named as having changed it, in the order of the stores. */
  editorsOfStores(boardId: string): string[][] {
    return this.requests.filter((r) => r.method === "PUT" && r.boardId === boardId).map((r) => r.editors ?? []);
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
      const draft = /^\/internal\/proposals\/([^/]+)\/(document|access)$/.exec(request.url ?? "");
      if (draft) {
        await this.handleDraft(request, response, decodeURIComponent(draft[1]!), draft[2] === "access");
        return;
      }
      const match = /^\/internal\/boards\/([^/]+)\/(document|access)$/.exec(request.url ?? "");
      if (!match) {
        response.writeHead(404).end();
        return;
      }
      const boardId = decodeURIComponent(match[1]!);
      const isAccess = match[2] === "access";
      const editors = request.headers["x-editors"];
      this.requests.push({
        method: `${request.method ?? ""}${isAccess ? " access" : ""}`,
        boardId,
        ...(typeof editors === "string" && { editors: editors.split(",").map((id) => id.trim()) }),
      });

      if (request.headers["x-internal-token"] !== this.token) {
        response.writeHead(401).end();
        return;
      }
      if (!this.boards.has(boardId)) {
        response.writeHead(404).end();
        return;
      }
      if (isAccess) {
        const access = this.access.get(boardId) ?? { ownerId: ALICE, linkAccess: "edit", members: {} };
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
        if (this.failingStores > 0) {
          this.failingStores--;
          response.writeHead(500).end();
          return;
        }
        this.documents.set(boardId, new Uint8Array(Buffer.concat(chunks)));
        response.writeHead(204).end();
        return;
      }
      response.writeHead(405).end();
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
  }

  private async handleDraft(request: IncomingMessage, response: ServerResponse, proposalId: string, isAccess: boolean) {
    this.requests.push({ method: `${request.method ?? ""}${isAccess ? " access" : ""}`, boardId: `proposal:${proposalId}` });
    if (request.headers["x-internal-token"] !== this.token) {
      response.writeHead(401).end();
      return;
    }
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      response.writeHead(404).end();
      return;
    }
    if (isAccess) {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(proposal));
      return;
    }
    if (request.method === "GET") {
      const state = this.drafts.get(proposalId);
      if (state) response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(state);
      else response.writeHead(204).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    if (!proposal.open) {
      response.writeHead(409).end();
      return;
    }
    this.drafts.set(proposalId, new Uint8Array(Buffer.concat(chunks)));
    response.writeHead(204).end();
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server?.close((error) => (error ? reject(error) : resolve())));
  }
}
