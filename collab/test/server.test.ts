import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Server } from "@hocuspocus/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabServer } from "../src/server.js";

describe("collab server", () => {
  let server: Server;
  const providers: HocuspocusProvider[] = [];

  beforeEach(async () => {
    server = createCollabServer({ port: 0, quiet: true });
    await server.listen();
  });

  afterEach(async () => {
    providers.splice(0).forEach((provider) => provider.destroy());
    await server.destroy();
  });

  function connect(name: string): Promise<Y.Doc> {
    const document = new Y.Doc();
    return new Promise((resolve) => {
      const provider = new HocuspocusProvider({
        url: `ws://127.0.0.1:${server.address.port}`,
        name,
        document,
        onSynced: () => resolve(document),
      });
      providers.push(provider);
    });
  }

  it("reports health", async () => {
    const response = await fetch(`http://127.0.0.1:${server.address.port}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "UP" });
  });

  it("delivers changes from one client to another", async () => {
    const first = await connect("board-1");
    const second = await connect("board-1");
    const received = new Promise<unknown>((resolve) =>
      second.getMap("meta").observe((event) => resolve(event.target.get("title"))),
    );

    first.getMap("meta").set("title", "Architecture");

    await expect(received).resolves.toBe("Architecture");
  });
});
