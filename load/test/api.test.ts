import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError, collabUrl, User } from "../src/api.js";

describe("User", () => {
  let server: Server;
  let baseUrl: string;
  const requests: { method: string; url: string; cookie?: string; csrf?: string }[] = [];

  beforeEach(async () => {
    requests.length = 0;
    // The backend as the app sees it: a CSRF cookie on every answer, a session after the guest sign-in.
    server = createServer((request: IncomingMessage, response) => {
      requests.push({
        method: request.method!,
        url: request.url!,
        cookie: request.headers.cookie,
        csrf: request.headers["x-xsrf-token"] as string | undefined,
      });
      const signedIn = request.headers.cookie?.includes("SESSION=s1");
      response.setHeader("Set-Cookie", ["XSRF-TOKEN=t1; Path=/"]);
      if (request.method === "POST" && request.url === "/api/guest") {
        if (request.headers["x-xsrf-token"] !== "t1") return void response.writeHead(403).end();
        response.setHeader("Set-Cookie", ["SESSION=s1; Path=/; HttpOnly"]);
        return void response.writeHead(204).end();
      }
      if (!signedIn) return void response.writeHead(401).end();
      if (request.url === "/api/me") return void response.writeHead(200).end(JSON.stringify({ name: "Гость 7" }));
      if (request.url === "/api/boards/b1/collab-token")
        return void response.writeHead(200).end(JSON.stringify({ token: "jwt" }));
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("signs in as a guest with the CSRF token and asks for tokens of collab with the session", async () => {
    const user = new User(baseUrl);
    await user.signInAsGuest();
    expect(user.name).toBe("Гость 7");
    expect(requests[1]).toMatchObject({ method: "POST", url: "/api/guest", csrf: "t1" });

    // A worker thread gets the session of the user.
    const restored = User.restore(baseUrl, user.state());
    expect(await restored.collabToken("b1")).toBe("jwt");
    expect(requests.at(-1)?.cookie).toContain("SESSION=s1");
  });

  it("fails with the status of a refused request", async () => {
    const user = new User(baseUrl);
    await user.signInAsGuest();
    await expect(user.collabToken("other")).rejects.toEqual(new ApiError(404, "Getting a token"));
  });
});

describe("collabUrl", () => {
  it("is /collab at the app address, over wss behind https", () => {
    expect(collabUrl("http://localhost:8080")).toBe("ws://localhost:8080/collab");
    expect(collabUrl("https://codraw.example.com/")).toBe("wss://codraw.example.com/collab");
  });
});
