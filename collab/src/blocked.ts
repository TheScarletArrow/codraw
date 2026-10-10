import type { Hocuspocus } from "@hocuspocus/server";
import type { ConnectionContext } from "./access.js";
import type { BackendClient } from "./backend-client.js";
import { log } from "./log.js";
import type { Metrics } from "./metrics.js";

/** Reason of refusing a user whom an administrator of the installation blocked, and of closing their connections. */
export const USER_BLOCKED = "user-blocked";

/** Closes the socket of a blocked user; the client connects no more. */
export const USER_BLOCKED_CLOSE = { code: 4401, reason: USER_BLOCKED };

export class UserBlockedError extends Error {
  /** Sent to the client when Hocuspocus rejects the connection because of this error. */
  readonly reason = USER_BLOCKED;

  constructor(userId: string) {
    super(`User ${userId} is blocked`);
    this.name = "UserBlockedError";
  }
}

/**
 * Throws {@link UserBlockedError} when an administrator blocked the user: a token issued before the block still opens
 * documents for some minutes, so collab asks when the user connects.
 */
export async function checkNotBlocked(backend: Pick<BackendClient, "blockedUsers">, userId: string): Promise<void> {
  if ((await backend.blockedUsers([userId])).includes(userId)) throw new UserBlockedError(userId);
}

/**
 * Closes the connections of blocked users to all open documents, asking the backend about all users connected to this
 * instance with one request. When the backend does not answer, nothing is closed. A check that is still running is not
 * started again.
 */
export function createBlockedUserChecks(
  backend: Pick<BackendClient, "blockedUsers">,
  metrics?: Pick<Metrics, "rejected">,
) {
  let running = false;
  return async (hocuspocus: Pick<Hocuspocus, "documents">): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const connections = Array.from(hocuspocus.documents.values()).flatMap((document) => document.getConnections());
      const userIds = new Set(connections.map((connection) => (connection.context as ConnectionContext).user.id));
      if (userIds.size === 0) return;
      let blocked: Set<string>;
      try {
        blocked = new Set(await backend.blockedUsers([...userIds]));
      } catch (error) {
        log.error("Failed to check for blocked users", error);
        return;
      }
      connections.forEach((connection) => {
        if (blocked.has((connection.context as ConnectionContext).user.id)) {
          // The whole socket: every document of the client over it goes, and the client does not come back.
          connection.webSocket.close(USER_BLOCKED_CLOSE.code, USER_BLOCKED_CLOSE.reason);
          metrics?.rejected(USER_BLOCKED);
        }
      });
    } finally {
      running = false;
    }
  };
}
