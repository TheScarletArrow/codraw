import { jwtVerify, type JWTVerifyGetKey } from "jose";

/** Audience of the tokens that the backend issues for collab. */
export const COLLAB_AUDIENCE = "codraw-collab";

/** What a token lets its user do with the document: a connection with `view` is read-only. */
export type DocumentAccess = "edit" | "view";

/** The user that a collab token was issued to. */
export interface CollabUser {
  id: string;
  name: string;
  avatar?: string;
  access: DocumentAccess;
}

/** Checks that the token grants access to the document of the board and returns its user; throws otherwise. */
export type TokenVerifier = (token: string, boardId: string) => Promise<CollabUser>;

/** Rejects a connection; Hocuspocus sends the reason to the client. */
export class AccessDeniedError extends Error {
  readonly reason = "permission-denied";

  constructor(boardId: string, options?: ErrorOptions) {
    super(`Access to board ${boardId} denied`, options);
    this.name = "AccessDeniedError";
  }
}

/**
 * Verifies collab tokens with the backend keys: signature, audience, expiry, the board they were issued for and the
 * access they give.
 */
export function createTokenVerifier(keys: JWTVerifyGetKey): TokenVerifier {
  return async (token, boardId) => {
    // jose errors carry their own `reason`; the client gets the same one whatever is wrong with the token.
    const { payload } = await jwtVerify(token, keys, {
      audience: COLLAB_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "board", "name", "access"],
    }).catch((error: unknown) => {
      throw new AccessDeniedError(boardId, { cause: error });
    });
    if (payload.board !== boardId || (payload.access !== "edit" && payload.access !== "view")) {
      throw new AccessDeniedError(boardId);
    }
    return {
      id: payload.sub!,
      name: String(payload.name),
      ...(typeof payload.avatar === "string" && { avatar: payload.avatar }),
      access: payload.access,
    };
  };
}
