/**
 * The API of CoDraw as the app uses it: a guest signs in, creates and opens boards and gets tokens of collab for them.
 * Each user keeps their own cookies, as a browser does, and sends the CSRF token back on every change.
 */

const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    what: string,
  ) {
    super(`${what} failed: ${status}`);
    this.name = "ApiError";
  }
}

/** A signed-in user as it passes to a worker thread: their name and the cookies of their session. */
export interface UserState {
  name: string;
  cookies: [string, string][];
}

/** A user of the app with the cookies of their session. */
export class User {
  private readonly cookies = new Map<string, string>();
  name = "";

  constructor(readonly baseUrl: string) {}

  static restore(baseUrl: string, state: UserState): User {
    const user = new User(baseUrl);
    user.name = state.name;
    state.cookies.forEach(([name, value]) => user.cookies.set(name, value));
    return user;
  }

  state(): UserState {
    return { name: this.name, cookies: Array.from(this.cookies) };
  }

  /** Continues without a provider as a new guest, as «Продолжить без входа» does. */
  async signInAsGuest(): Promise<void> {
    // Any answer of the API carries the CSRF cookie; without a session /api/me answers 401.
    await this.send("GET", "/api/me", "Reading the CSRF token", [200, 401]);
    await this.send("POST", "/api/guest", "Signing in as a guest");
    const me = (await (await this.send("GET", "/api/me", "Reading the user")).json()) as { name: string };
    this.name = me.name;
  }

  async createBoard(title: string): Promise<string> {
    const response = await this.send("POST", "/api/boards", "Creating a board", [200, 201], { title });
    return ((await response.json()) as { id: string }).id;
  }

  /** Opens the board page: a board opened by its link becomes the user's, and collab lets them in. */
  async openBoard(boardId: string): Promise<void> {
    await this.send("GET", `/api/boards/${encodeURIComponent(boardId)}`, "Opening a board");
  }

  /** The token that collab takes for the board, the same the app asks for before every connection. */
  async collabToken(boardId: string): Promise<string> {
    const response = await this.send(
      "POST",
      `/api/boards/${encodeURIComponent(boardId)}/collab-token`,
      "Getting a token",
    );
    return ((await response.json()) as { token: string }).token;
  }

  async deleteBoard(boardId: string): Promise<void> {
    await this.send("DELETE", `/api/boards/${encodeURIComponent(boardId)}`, "Deleting a board", [200, 204]);
  }

  private async send(
    method: string,
    path: string,
    what: string,
    expected: number[] = [200, 204],
    body?: unknown,
  ): Promise<Response> {
    const csrf = this.cookies.get(CSRF_COOKIE);
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: {
        Accept: "application/json",
        ...(this.cookies.size > 0 && { Cookie: this.cookieHeader() }),
        ...(method !== "GET" && csrf && { [CSRF_HEADER]: csrf }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) this.keep(cookie);
    if (!expected.includes(response.status)) {
      await response.body?.cancel();
      throw new ApiError(response.status, what);
    }
    return response;
  }

  private keep(setCookie: string) {
    const [pair] = setCookie.split(";");
    const at = pair!.indexOf("=");
    if (at <= 0) return;
    const name = pair!.slice(0, at).trim();
    const value = pair!.slice(at + 1).trim();
    if (value === "" || /max-age=0/i.test(setCookie)) this.cookies.delete(name);
    else this.cookies.set(name, value);
  }

  private cookieHeader(): string {
    return Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join("; ");
  }
}

/** The address of collab behind the app address, as the app connects to it. */
export function collabUrl(baseUrl: string): string {
  const url = new URL("/collab", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
