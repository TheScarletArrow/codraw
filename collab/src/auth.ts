import { jwtVerify, type JWTVerifyGetKey } from "jose";

/** Audience of the tokens that the backend issues for collab. */
export const COLLAB_AUDIENCE = "codraw-collab";

/** The user that a collab token was issued to. */
export interface CollabUser {
  id: string;
  name: string;
  avatar?: string;
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

/** Verifies collab tokens with the backend keys: signature, audience, expiry and the board they were issued for. */
export function createTokenVerifier(keys: JWTVerifyGetKey): TokenVerifier {
  return async (token, boardId) => {
    // jose errors carry their own `reason`; the client gets the same one whatever is wrong with the token.
    const { payload } = await jwtVerify(token, keys, {
      audience: COLLAB_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "board", "name"],
    }).catch((error: unknown) => {
      throw new AccessDeniedError(boardId, { cause: error });
    });
    if (payload.board !== boardId) {
      throw new AccessDeniedError(boardId);
    }
    return {
      id: payload.sub!,
      name: String(payload.name),
      ...(typeof payload.avatar === "string" && { avatar: payload.avatar }),
    };
  };
}
