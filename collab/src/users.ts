import type { Hocuspocus } from "@hocuspocus/server";
import type { ConnectionContext } from "./access.js";
import type { BackendClient } from "./backend-client.js";
import { log } from "./log.js";
import type { Metrics } from "./metrics.js";

/** Reason of refusing a user whom an administrator of the installation blocked, and of closing their connections. */
export const USER_BLOCKED = "user-blocked" as const;

/** Reason of refusing a user whose account is gone, and of closing their connections. */
export const ACCOUNT_DELETED = "account-deleted" as const;

/** Closes the socket of a user whose account was deleted; the client finds itself signed out. */
export const ACCOUNT_DELETED_CLOSE = { code: 4401, reason: ACCOUNT_DELETED } as const;

/** Closes the socket of a blocked user; the client connects no more. */
export const USER_BLOCKED_CLOSE = { code: 4401, reason: USER_BLOCKED } as const;

export class UserBlockedError extends Error {
  /** Sent to the client when Hocuspocus rejects the connection because of this error. */
  readonly reason = USER_BLOCKED;

  constructor(userId: string) {
    super(`User ${userId} is blocked`);
    this.name = "UserBlockedError";
  }
}

export class AccountDeletedError extends Error {
  /** Sent to the client when Hocuspocus rejects the connection because of this error. */
  readonly reason = ACCOUNT_DELETED;

  constructor(userId: string) {
    super(`User ${userId} is gone`);
    this.name = "AccountDeletedError";
  }
}

/**
 * Throws {@link UserBlockedError} or {@link AccountDeletedError} when the user may not connect: a token issued before an
 * administrator blocked them or before they deleted their account still opens documents for some minutes.
 */
export async function checkUserOnConnect(backend: Pick<BackendClient, "checkUsers">, userId: string): Promise<void> {
  const { missing, blocked } = await backend.checkUsers([userId]);
  if (missing.includes(userId)) throw new AccountDeletedError(userId);
  if (blocked.includes(userId)) throw new UserBlockedError(userId);
}

/**
 * Closes the sockets of users who are gone, e.g. deleted their accounts on another device, and of users whom an
 * administrator blocked: the access of a board does not name everybody it lets in, e.g. through its link, so the backend
 * is asked about the users of all connections of this instance with one request. A check that fails leaves the
 * connections to the next one, and a check that is still running is not started again.
 */
export function createUserChecks(backend: Pick<BackendClient, "checkUsers">, metrics?: Pick<Metrics, "rejected">) {
  let running = false;
  return async (hocuspocus: Pick<Hocuspocus, "documents">): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const connections = Array.from(hocuspocus.documents.values()).flatMap((document) => document.getConnections());
      const userIds = new Set(connections.map((connection) => (connection.context as ConnectionContext).user.id));
      if (userIds.size === 0) return;
      let missing: Set<string>;
      let blocked: Set<string>;
      try {
        const checks = await backend.checkUsers([...userIds]);
        missing = new Set(checks.missing);
        blocked = new Set(checks.blocked);
      } catch (error) {
        log.error("Failed to check the users of the connections", error);
        return;
      }
      for (const connection of connections) {
        const userId = (connection.context as ConnectionContext).user.id;
        // The whole socket: it is the user's, and so are all the documents on it; the client does not come back.
        const close = missing.has(userId) ? ACCOUNT_DELETED_CLOSE : blocked.has(userId) ? USER_BLOCKED_CLOSE : null;
        if (!close) continue;
        connection.webSocket.close(close.code, close.reason);
        metrics?.rejected(close.reason);
      }
    } finally {
      running = false;
    }
  };
}
