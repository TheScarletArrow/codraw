/** Header of a store that names the users who changed the document since the previous store. */
export const EDITORS_HEADER = "X-Editors";

/** Reason that the client gets when the board does not exist. */
export const BOARD_NOT_FOUND = "board-not-found";

export class BoardNotFoundError extends Error {
  /** Sent to the client when Hocuspocus rejects the connection because of this error. */
  readonly reason = BOARD_NOT_FOUND;

  constructor(boardId: string) {
    super(`Board ${boardId} does not exist`);
    this.name = "BoardNotFoundError";
  }
}

/** What a link to a board gives to users other than its owner and its members. */
export type LinkAccess = "none" | "view" | "edit";

/** The role that the owner of a board gives a member of it. */
export type MemberRole = "editor" | "viewer";

/**
 * Who may do what with the document of a board now: its owner edits, anybody else gets the higher of their role as a
 * member and what its link gives.
 */
export interface BoardAccess {
  ownerId: string;
  linkAccess: LinkAccess;
  /** The roles of the members by their ids. */
  members: Record<string, MemberRole>;
}

/** Client for the backend internal API that stores board documents. */
export interface BackendClient {
  /** Returns the stored Yjs state of the board, or `null` when the board has no state yet. */
  loadDocument(boardId: string): Promise<Uint8Array | null>;
  /** Stores the Yjs state of the board, which the users `editors` changed since the previous store. */
  storeDocument(boardId: string, state: Uint8Array, editors?: readonly string[]): Promise<void>;
  loadAccess(boardId: string): Promise<BoardAccess>;
}

export interface BackendClientOptions {
  baseUrl: string;
  internalToken: string;
}

export function createBackendClient({ baseUrl, internalToken }: BackendClientOptions): BackendClient {
  const boardUrl = (boardId: string, resource: "document" | "access") =>
    new URL(`/internal/boards/${encodeURIComponent(boardId)}/${resource}`, baseUrl);
  const documentUrl = (boardId: string) => boardUrl(boardId, "document");
  const headers = { "X-Internal-Token": internalToken };

  return {
    async loadDocument(boardId) {
      const response = await fetch(documentUrl(boardId), { headers });
      switch (response.status) {
        case 200:
          return new Uint8Array(await response.arrayBuffer());
        case 204:
          return null;
        case 404:
          throw new BoardNotFoundError(boardId);
        default:
          throw new Error(`Loading board ${boardId} failed: backend responded with ${response.status}`);
      }
    },

    async storeDocument(boardId, state, editors = []) {
      const response = await fetch(documentUrl(boardId), {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
          // A list in a header, as HTTP has them; the state stays the plain body that the backend reads with a limit.
          ...(editors.length > 0 && { [EDITORS_HEADER]: editors.join(", ") }),
        },
        // Copy into a plain ArrayBuffer-backed array, which is what fetch accepts as a body.
        body: new Uint8Array(state),
      });
      if (response.status === 404) {
        throw new BoardNotFoundError(boardId);
      }
      if (!response.ok) {
        throw new Error(`Storing board ${boardId} failed: backend responded with ${response.status}`);
      }
    },

    async loadAccess(boardId) {
      const response = await fetch(boardUrl(boardId, "access"), { headers });
      if (response.status === 404) {
        throw new BoardNotFoundError(boardId);
      }
      if (!response.ok) {
        throw new Error(`Loading access to board ${boardId} failed: backend responded with ${response.status}`);
      }
      return (await response.json()) as BoardAccess;
    },
  };
}
