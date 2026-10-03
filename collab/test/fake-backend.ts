import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** In-memory stand-in for the backend internal API. */
export class FakeBackend {
  readonly boards = new Set<string>();
  readonly documents = new Map<string, Uint8Array>();
  readonly requests: { method: string; boardId: string }[] = [];
  private server?: Server;

  constructor(readonly token = "test-token") {}

  get url(): string {
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  storesFor(boardId: string): number {
    return this.requests.filter((r) => r.method === "PUT" && r.boardId === boardId).length;
  }

  async start(): Promise<void> {
    this.server = createServer(async (request, response) => {
      const match = /^\/internal\/boards\/([^/]+)\/document$/.exec(request.url ?? "");
      if (!match) {
        response.writeHead(404).end();
        return;
      }
      const boardId = decodeURIComponent(match[1]!);
      this.requests.push({ method: request.method ?? "", boardId });

      if (request.headers["x-internal-token"] !== this.token) {
        response.writeHead(401).end();
        return;
      }
      if (!this.boards.has(boardId)) {
        response.writeHead(404).end();
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
