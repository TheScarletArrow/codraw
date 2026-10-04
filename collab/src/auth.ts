import { jwtVerify, type JWTVerifyGetKey } from "jose";

/** Audience of the tokens that the backend issues for collab. */
export const COLLAB_AUDIENCE = "codraw-collab";

/** The user that a collab token was issued to. */
export interface CollabUser {
  id: string;
  name: string;
  avatar?: string;
}

/** What the user may do on the board; a viewer only reads its document. */
export type BoardRole = "owner" | "editor" | "viewer";

const ROLES: readonly string[] = ["owner", "editor", "viewer"] satisfies BoardRole[];

/** What a valid collab token gives. */
export interface CollabGrant {
  user: CollabUser;
  role: BoardRole;
  /** When the token expires, in milliseconds since the epoch. */
  expiresAt: number;
}

/** Checks that the token grants access to the document of the board and returns what it gives; throws otherwise. */
export type TokenVerifier = (token: string, boardId: string) => Promise<CollabGrant>;

/** Reason that the client gets when its token gives no access to the board. */
export const PERMISSION_DENIED = "permission-denied";

/** Rejects a connection; Hocuspocus sends the reason to the client. */
export class AccessDeniedError extends Error {
  readonly reason = PERMISSION_DENIED;

  constructor(boardId: string, options?: ErrorOptions) {
    super(`Access to board ${boardId} denied`, options);
    this.name = "AccessDeniedError";
  }
}

/** Verifies collab tokens with the backend keys: signature, audience, expiry, the board they were issued for and the role. */
export function createTokenVerifier(keys: JWTVerifyGetKey): TokenVerifier {
  return async (token, boardId) => {
    // jose errors carry their own `reason`; the client gets the same one whatever is wrong with the token.
    const { payload } = await jwtVerify(token, keys, {
      audience: COLLAB_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "board", "name", "role"],
    }).catch((error: unknown) => {
      throw new AccessDeniedError(boardId, { cause: error });
    });
    if (payload.board !== boardId || typeof payload.role !== "string" || !ROLES.includes(payload.role)) {
      throw new AccessDeniedError(boardId);
    }
    return {
      user: {
        id: payload.sub!,
        name: String(payload.name),
        ...(typeof payload.avatar === "string" && { avatar: payload.avatar }),
      },
      role: payload.role as BoardRole,
      expiresAt: payload.exp! * 1000,
    };
  };
}
