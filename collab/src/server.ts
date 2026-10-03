import { Server } from "@hocuspocus/server";

export interface CollabServerOptions {
  port: number;
  quiet?: boolean;
}

export function createCollabServer({ port, quiet = false }: CollabServerOptions): Server {
  return new Server({
    port,
    quiet,
    async onRequest({ request, response }) {
      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "UP" }));
        // Hocuspocus stops its default HTTP handling when the hook rejects without an error.
        return Promise.reject();
      }
    },
  });
}
