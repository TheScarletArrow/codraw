import type { Connection } from "@hocuspocus/server";
import { PERMISSION_DENIED, type CollabGrant, type TokenVerifier } from "./auth.js";

export interface AccessRenewalOptions {
  /** How long before the token of a connection expires its client is asked for a new one, in milliseconds. */
  renewBefore: number;
  /** How long a client has to send a valid token once asked, in milliseconds. */
  answerTimeout: number;
}

/** Closes a connection whose access ended; the client shows that it has no access. */
const ACCESS_ENDED = { code: 4403, reason: PERMISSION_DENIED };

interface Renewal {
  /** Asks for a new token before the current one expires. */
  next?: NodeJS.Timeout;
  /** Closes the connection unless the client answers the request for a token in time. */
  deadline?: NodeJS.Timeout;
}

/**
 * Keeps the access of open connections up to date without reconnecting: asks clients for new tokens before their
 * tokens expire and whenever a participant reports a change of the board, applies the role of each new token and
 * closes connections that do not send a valid one in time.
 */
export class AccessRenewal {
  private readonly renewals = new Map<Connection, Renewal>();

  constructor(
    private readonly verifyToken: TokenVerifier,
    private readonly options: AccessRenewalOptions,
  ) {}

  /** Starts keeping the access of a new connection, whose token is valid until `expiresAt`. */
  track(connection: Connection, expiresAt: number): void {
    this.renewals.set(connection, {});
    connection.onClose(() => this.forget(connection));
    this.scheduleNext(connection, expiresAt);
  }

  /** Asks the client of the connection for a new token, once at a time. */
  request(connection: Connection): void {
    const renewal = this.renewals.get(connection);
    if (!renewal || renewal.deadline) return;
    renewal.deadline = setTimeout(() => connection.close(ACCESS_ENDED), this.options.answerTimeout).unref();
    connection.requestToken();
  }

  /** Checks a token that the client sent: applies its role, or closes the connection if it gives no access. */
  async accept(connection: Connection, token: string, boardId: string): Promise<void> {
    let grant: CollabGrant;
    try {
      grant = await this.verifyToken(token, boardId);
    } catch {
      connection.close(ACCESS_ENDED);
      return;
    }
    const renewal = this.renewals.get(connection);
    if (!renewal) return;
    connection.readOnly = isReadOnly(grant);
    clearTimeout(renewal.deadline);
    renewal.deadline = undefined;
    this.scheduleNext(connection, grant.expiresAt);
  }

  /** Stops all timers, e.g. when the server stops. */
  stop(): void {
    [...this.renewals.keys()].forEach((connection) => this.forget(connection));
  }

  private scheduleNext(connection: Connection, expiresAt: number) {
    const renewal = this.renewals.get(connection)!;
    clearTimeout(renewal.next);
    const delay = Math.max(0, expiresAt - this.options.renewBefore - Date.now());
    renewal.next = setTimeout(() => this.request(connection), delay).unref();
  }

  private forget(connection: Connection) {
    const renewal = this.renewals.get(connection);
    if (!renewal) return;
    clearTimeout(renewal.next);
    clearTimeout(renewal.deadline);
    this.renewals.delete(connection);
  }
}

/** A viewer only reads the document. */
export function isReadOnly({ role }: CollabGrant): boolean {
  return role === "viewer";
}
