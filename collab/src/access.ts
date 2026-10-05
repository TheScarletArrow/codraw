import type { Document } from "@hocuspocus/server";
import type { CollabUser, DocumentAccess } from "./auth.js";
import { BOARD_NOT_FOUND, BoardNotFoundError, type BackendClient, type BoardAccess } from "./backend-client.js";

/** Closes the socket of a participant whose access changed; the client reconnects and gets a token for its new access. */
export const ACCESS_CHANGED = { code: 4403, reason: "access-changed" };

/** Closes the connections of a deleted board; the client shows that the board does not exist. */
export const BOARD_DELETED = { code: 4404, reason: BOARD_NOT_FOUND };

/** The access the user has to the document of a board now, or `null` when they have none. */
export function accessOf({ ownerId, linkAccess }: BoardAccess, userId: string): DocumentAccess | null {
  if (userId === ownerId) return "edit";
  return linkAccess === "none" ? null : linkAccess;
}

/**
 * Brings the connections of a document in line with the current access to its board: a connection whose token gives
 * another access than the board gives its user now is closed, so that its client reconnects with a new token.
 *
 * Any participant may ask for a check, so a document has at most one running check; requests that come while it runs
 * make exactly one more.
 */
export function createAccessChecks(backend: Pick<BackendClient, "loadAccess">) {
  const running = new Map<string, { again: boolean }>();

  const check = async (document: Document) => {
    let access: BoardAccess;
    try {
      access = await backend.loadAccess(document.name);
    } catch (error) {
      if (error instanceof BoardNotFoundError) {
        document.getConnections().forEach((connection) => connection.close(BOARD_DELETED));
      } else {
        console.error(`Failed to check access to board ${document.name}`, error);
      }
      return;
    }
    document.getConnections().forEach((connection) => {
      const { user } = connection.context as { user: CollabUser };
      if (accessOf(access, user.id) !== user.access) {
        // The whole socket: the provider reconnects only after the socket closes, and asks for a new token then.
        connection.webSocket.close(ACCESS_CHANGED.code, ACCESS_CHANGED.reason);
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
