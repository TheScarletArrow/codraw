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

/** Reason that the client gets when the proposal of a draft does not exist, e.g. its board was deleted. */
export const PROPOSAL_NOT_FOUND = "proposal-not-found";

export class ProposalNotFoundError extends Error {
  /** Sent to the client when Hocuspocus rejects the connection because of this error. */
  readonly reason = PROPOSAL_NOT_FOUND;

  constructor(proposalId: string) {
    super(`Proposal ${proposalId} does not exist`);
    this.name = "ProposalNotFoundError";
  }
}

/** The proposal is closed: its draft no longer changes, and the backend does not store it. */
export class ProposalClosedError extends Error {
  constructor(proposalId: string) {
    super(`Proposal ${proposalId} is closed`);
    this.name = "ProposalClosedError";
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

/** Who may do what with the draft of a proposal of changes now. */
export interface DraftAccess {
  /** The author edits the draft while the proposal is open and the board gives them a role. */
  authorId: string;
  open: boolean;
  /** Whoever edits the board views the draft. */
  board: BoardAccess;
}

/** Client for the backend internal API that stores board documents and the drafts of proposals. */
export interface BackendClient {
  /** Returns the stored Yjs state of the board, or `null` when the board has no state yet. */
  loadDocument(boardId: string): Promise<Uint8Array | null>;
  /** Stores the Yjs state of the board, which the users `editors` changed since the previous store. */
  storeDocument(boardId: string, state: Uint8Array, editors?: readonly string[]): Promise<void>;
  loadAccess(boardId: string): Promise<BoardAccess>;
  /** Returns the stored Yjs state of the draft, or `null` while it is empty; throws {@link ProposalNotFoundError}. */
  loadDraft(proposalId: string): Promise<Uint8Array | null>;
  /**
   * Stores the Yjs state of the draft; throws {@link ProposalClosedError} once the proposal is closed and
   * {@link ProposalNotFoundError} once it is gone.
   */
  storeDraft(proposalId: string, state: Uint8Array): Promise<void>;
  loadDraftAccess(proposalId: string): Promise<DraftAccess>;
}

export interface BackendClientOptions {
  baseUrl: string;
  internalToken: string;
}

export function createBackendClient({ baseUrl, internalToken }: BackendClientOptions): BackendClient {
  const boardUrl = (boardId: string, resource: "document" | "access") =>
    new URL(`/internal/boards/${encodeURIComponent(boardId)}/${resource}`, baseUrl);
  const proposalUrl = (proposalId: string, resource: "document" | "access") =>
    new URL(`/internal/proposals/${encodeURIComponent(proposalId)}/${resource}`, baseUrl);
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

    async loadDraft(proposalId) {
      const response = await fetch(proposalUrl(proposalId, "document"), { headers });
      switch (response.status) {
        case 200:
          return new Uint8Array(await response.arrayBuffer());
        case 204:
          return null;
        case 404:
          throw new ProposalNotFoundError(proposalId);
        default:
          throw new Error(`Loading the draft of proposal ${proposalId} failed: backend responded with ${response.status}`);
      }
    },

    async storeDraft(proposalId, state) {
      const response = await fetch(proposalUrl(proposalId, "document"), {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/octet-stream" },
        body: new Uint8Array(state),
      });
      if (response.status === 404) throw new ProposalNotFoundError(proposalId);
      if (response.status === 409) throw new ProposalClosedError(proposalId);
      if (!response.ok) {
        throw new Error(`Storing the draft of proposal ${proposalId} failed: backend responded with ${response.status}`);
      }
    },

    async loadDraftAccess(proposalId) {
      const response = await fetch(proposalUrl(proposalId, "access"), { headers });
      if (response.status === 404) throw new ProposalNotFoundError(proposalId);
      if (!response.ok) {
        throw new Error(`Loading access to proposal ${proposalId} failed: backend responded with ${response.status}`);
      }
      return (await response.json()) as DraftAccess;
    },
  };
}
