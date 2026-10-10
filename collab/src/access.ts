import type { Document } from "@hocuspocus/server";
import type { CollabUser } from "./auth.js";
import {
  BOARD_NOT_FOUND,
  BoardNotFoundError,
  PROPOSAL_NOT_FOUND,
  ProposalNotFoundError,
  type BackendClient,
  type BoardAccess,
  type DraftAccess,
  type WorkspaceBoardAccess,
} from "./backend-client.js";
import { documentOf, type CollabDocument } from "./documents.js";
import { log } from "./log.js";
import type { Metrics } from "./metrics.js";

/** What a user may do with a document: a connection with `view` is read-only. */
export type DocumentAccess = "edit" | "view";

/** What collab keeps about a connection: its user and the access they had to the document when they connected. */
export interface ConnectionContext {
  user: CollabUser;
  access: DocumentAccess;
}

/** Closes the socket of a participant whose access changed; the client reconnects and gets its new access. */
export const ACCESS_CHANGED = { code: 4403, reason: "access-changed" };

/** Closes the socket of a user whose account was deleted; the client finds itself signed out. */
export const ACCOUNT_DELETED = { code: 4401, reason: "account-deleted" };

/** Closes the connections of a deleted board; the client shows that the board does not exist. */
export const BOARD_DELETED = { code: 4404, reason: BOARD_NOT_FOUND };

/** Closes the connections of the draft of a deleted proposal, e.g. of a deleted board. */
export const PROPOSAL_DELETED = { code: 4404, reason: PROPOSAL_NOT_FOUND };

/**
 * Reason of rejecting a user whom the board gives no access, e.g. its owner closed the link or removed them after the
 * token was issued.
 */
export const NO_ACCESS = "no-access";

export class NoAccessError extends Error {
  /** Sent to the client when Hocuspocus rejects the connection because of this error. */
  readonly reason = NO_ACCESS;

  constructor(documentId: string, userId: string) {
    super(`User ${userId} has no access to document ${documentId}`);
    this.name = "NoAccessError";
  }
}

/**
 * The access the user has to the document of a board now, or `null` when they have none. Like the role on the board
 * that the backend gives: the owner edits, anybody else gets the highest of their role as a member, what the link gives
 * and what the workspace of the board gives them.
 */
export function accessOf({ ownerId, linkAccess, members, workspace }: BoardAccess, userId: string): DocumentAccess | null {
  const member = members[userId];
  const inherited = workspace ? inheritedAccessOf(workspace, userId) : null;
  if (userId === ownerId || member === "editor" || linkAccess === "edit" || inherited === "edit") return "edit";
  if (member === "viewer" || linkAccess === "view" || linkAccess === "public" || inherited === "view") return "view";
  return null;
}

/**
 * What the workspace of a board gives the user on it: owners and administrators of the workspace manage its boards,
 * editors and viewers get what the access of the board to the workspace says.
 */
function inheritedAccessOf({ access, roles }: WorkspaceBoardAccess, userId: string): DocumentAccess | null {
  const role = roles[userId];
  if (role === "owner" || role === "admin") return "edit";
  if (!role || access === "none") return null;
  return access === "edit" && role === "editor" ? "edit" : "view";
}

/**
 * The access the user has to the draft of a proposal now, or `null` when they have none: its author edits it while the
 * proposal is open and views it once it is closed, as long as the board gives them a role; whoever edits the board, the
 * owner and the editors who review proposals, views it.
 */
export function draftAccessOf({ authorId, open, board }: DraftAccess, userId: string): DocumentAccess | null {
  const onBoard = accessOf(board, userId);
  if (userId === authorId && onBoard) return open ? "edit" : "view";
  return onBoard === "edit" ? "view" : null;
}

/**
 * What every user may do with the document now, from one request to the backend. Throws {@link BoardNotFoundError} or
 * {@link ProposalNotFoundError} when the board or the proposal does not exist.
 */
async function accessRule(
  backend: Pick<BackendClient, "loadAccess" | "loadDraftAccess">,
  document: CollabDocument,
): Promise<(userId: string) => DocumentAccess | null> {
  if (document.kind === "board") {
    const access = await backend.loadAccess(document.id);
    return (userId) => accessOf(access, userId);
  }
  const access = await backend.loadDraftAccess(document.id);
  return (userId) => draftAccessOf(access, userId);
}

/**
 * The access the user has to the document when they connect. A token only tells who the user is: the owner may have
 * changed the link or the role of the user, or the proposal may have closed, since it was issued. Throws
 * {@link NoAccessError} when the user has no access, and {@link BoardNotFoundError} or {@link ProposalNotFoundError}
 * when the board or the proposal does not exist.
 */
export async function accessOnConnect(
  backend: Pick<BackendClient, "loadAccess" | "loadDraftAccess">,
  document: CollabDocument,
  userId: string,
): Promise<DocumentAccess> {
  const access = (await accessRule(backend, document))(userId);
  if (!access) throw new NoAccessError(document.id, userId);
  return access;
}

/**
 * Brings the connections of a document in line with the current access to it: a connection whose access differs from
 * what the board or the proposal gives its user now is closed, so that its client reconnects with the new access.
 *
 * Any participant may ask for a check, so a document has at most one running check; requests that come while it runs
 * make exactly one more.
 */
export function createAccessChecks(
  backend: Pick<BackendClient, "loadAccess" | "loadDraftAccess">,
  metrics?: Pick<Metrics, "rejected">,
) {
  const running = new Map<string, { again: boolean }>();

  const check = async (document: Document) => {
    const target = documentOf(document.name);
    // Collab opens no document with any other name.
    if (!target) return;
    let accessOfUser: (userId: string) => DocumentAccess | null;
    try {
      accessOfUser = await accessRule(backend, target);
    } catch (error) {
      if (error instanceof BoardNotFoundError) {
        document.getConnections().forEach((connection) => connection.close(BOARD_DELETED));
      } else if (error instanceof ProposalNotFoundError) {
        document.getConnections().forEach((connection) => connection.close(PROPOSAL_DELETED));
      } else {
        log.error(`Failed to check access to document ${document.name}`, error, { "codraw.document": document.name });
      }
      return;
    }
    document.getConnections().forEach((connection) => {
      const context = connection.context as ConnectionContext;
      if (accessOfUser(context.user.id) !== context.access) {
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

/**
 * Closes the sockets of users who are gone, e.g. deleted their accounts on another device: the access of a board does
 * not name everybody it lets in, e.g. through its link, so the backend is asked about the users of all connections at
 * once. A check that fails leaves the connections to the next one.
 */
export function createAccountChecks(backend: Pick<BackendClient, "missingUsers">, metrics?: Pick<Metrics, "rejected">) {
  return async (documents: Iterable<Document>): Promise<void> => {
    const connections = Array.from(documents).flatMap((document) => document.getConnections());
    const userIds = new Set(connections.map((connection) => (connection.context as ConnectionContext).user.id));
    if (userIds.size === 0) return;
    let missing: Set<string>;
    try {
      missing = new Set(await backend.missingUsers(Array.from(userIds)));
    } catch (error) {
      log.error("Failed to check the users of the connections", error);
      return;
    }
    for (const connection of connections) {
      if (!missing.has((connection.context as ConnectionContext).user.id)) continue;
      // The whole socket: it is the user's, and so are all the documents on it.
      connection.webSocket.close(ACCOUNT_DELETED.code, ACCOUNT_DELETED.reason);
      metrics?.rejected("account-deleted");
    }
  };
}
