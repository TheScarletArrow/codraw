import { jwtVerify, type JWTVerifyGetKey } from "jose";
import type { CollabDocument } from "./documents.js";

/** Audience of the tokens that the backend issues for collab. */
export const COLLAB_AUDIENCE = "codraw-collab";

/** The user that a collab token was issued to. */
export interface CollabUser {
  id: string;
  name: string;
  avatar?: string;
}

/** Checks that the token was issued for the document and returns its user; throws otherwise. */
export type TokenVerifier = (token: string, document: CollabDocument) => Promise<CollabUser>;

/** Rejects a connection; Hocuspocus sends the reason to the client. */
export class AccessDeniedError extends Error {
  readonly reason = "permission-denied";

  constructor(documentId: string, options?: ErrorOptions) {
    super(`Access to document ${documentId} denied`, options);
    this.name = "AccessDeniedError";
  }
}

/**
 * The claim that names the document a token opens: a token of a board names the board, a token of a draft names the
 * proposal. Each kind of document requires its own claim, so a token of one kind never opens the other.
 */
const DOCUMENT_CLAIMS = { board: "board", proposal: "proposal" } as const;

/**
 * Verifies collab tokens with the backend keys: signature, audience, expiry and the document they were issued for. What
 * the user may do with the document is not in the token: collab asks the backend when the user connects.
 */
export function createTokenVerifier(keys: JWTVerifyGetKey): TokenVerifier {
  return async (token, document) => {
    const claim = DOCUMENT_CLAIMS[document.kind];
    // jose errors carry their own `reason`; the client gets the same one whatever is wrong with the token.
    const { payload } = await jwtVerify(token, keys, {
      audience: COLLAB_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", claim, "name"],
    }).catch((error: unknown) => {
      throw new AccessDeniedError(document.id, { cause: error });
    });
    if (payload[claim] !== document.id) {
      throw new AccessDeniedError(document.id);
    }
    return {
      id: payload.sub!,
      name: String(payload.name),
      ...(typeof payload.avatar === "string" && { avatar: payload.avatar }),
    };
  };
}
