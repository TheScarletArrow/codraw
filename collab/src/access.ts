import type { Document } from "@hocuspocus/server";
import type { CollabUser } from "./auth.js";
import { BOARD_NOT_FOUND, BoardNotFoundError, type BackendClient, type BoardAccess } from "./backend-client.js";
import { log } from "./log.js";
import type { Metrics } from "./metrics.js";

/** What a user may do with the document of a board: a connection with `view` is read-only. */
export type DocumentAccess = "edit" | "view";

/** What collab keeps about a connection: its user and the access they had to the board when they connected. */
export interface ConnectionContext {
  user: CollabUser;
  access: DocumentAccess;
}

/** Closes the socket of a participant whose access changed; the client reconnects and gets its new access. */
export const ACCESS_CHANGED = { code: 4403, reason: "access-changed" };

/** Closes the connections of a deleted board; the client shows that the board does not exist. */
export const BOARD_DELETED = { code: 4404, reason: BOARD_NOT_FOUND };

/**
 * Reason of rejecting a user whom the board gives no access, e.g. its owner closed the link or removed them after the
 * token was issued.
 */
export const NO_ACCESS = "no-access";

export class NoAccessError extends Error {
  /** Sent to the client when Hocuspocus rejects the connection because of this error. */
  readonly reason = NO_ACCESS;

  constructor(boardId: string, userId: string) {
    super(`User ${userId} has no access to board ${boardId}`);
    this.name = "NoAccessError";
  }
}

/**
 * The access the user has to the document of a board now, or `null` when they have none. Like the role on the board
 * that the backend gives: the owner edits, anybody else gets the higher of their role as a member and what the link
 * gives.
 */
export function accessOf({ ownerId, linkAccess, members }: BoardAccess, userId: string): DocumentAccess | null {
  const member = members[userId];
  if (userId === ownerId || member === "editor" || linkAccess === "edit") return "edit";
  if (member === "viewer" || linkAccess === "view") return "view";
  return null;
}

/**
 * The access the user has to the document of the board when they connect. A token only tells who the user is: the
 * owner may have changed the link or the role of the user since it was issued. Throws {@link NoAccessError} when the
 * user has no access, and {@link BoardNotFoundError} when the board does not exist.
 */
export async function accessOnConnect(
  backend: Pick<BackendClient, "loadAccess">,
  boardId: string,
  userId: string,
): Promise<DocumentAccess> {
  const access = accessOf(await backend.loadAccess(boardId), userId);
  if (!access) throw new NoAccessError(boardId, userId);
  return access;
}

/**
 * Brings the connections of a document in line with the current access to its board: a connection whose access differs
 * from what the board gives its user now is closed, so that its client reconnects with the new access.
 *
 * Any participant may ask for a check, so a document has at most one running check; requests that come while it runs
 * make exactly one more.
 */
export function createAccessChecks(backend: Pick<BackendClient, "loadAccess">, metrics?: Pick<Metrics, "rejected">) {
  const running = new Map<string, { again: boolean }>();

  const check = async (document: Document) => {
    let access: BoardAccess;
    try {
      access = await backend.loadAccess(document.name);
    } catch (error) {
      if (error instanceof BoardNotFoundError) {
        document.getConnections().forEach((connection) => connection.close(BOARD_DELETED));
      } else {
        log.error(`Failed to check access to board ${document.name}`, error, { "codraw.board": document.name });
      }
      return;
    }
    document.getConnections().forEach((connection) => {
      const context = connection.context as ConnectionContext;
      if (accessOf(access, context.user.id) !== context.access) {
        // The whole socket: the provider reconnects only after the socket closes, and connects with the new access then.
        connection.webSocket.close(ACCESS_CHANGED.code, ACCESS_CHANGED.reason);
        metrics?.rejected("access-changed");
      }
    });
  };

  return (document: Document): Promise<void> => {
    const current = running.get(document.name);
    if (current) {
      current.again = true;
      return Promise.resolve();
    }
    const state = { again: false };
    running.set(document.name, state);
    return (async () => {
      try {
        do {
          state.again = false;
          await check(document);
        } while (state.again);
      } finally {
        running.delete(document.name);
      }
    })();
  };
}
