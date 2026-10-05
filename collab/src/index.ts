import { createRemoteJWKSet } from "jose";
import { createTokenVerifier } from "./auth.js";
import { createBackendClient } from "./backend-client.js";
import { loadConfig } from "./config.js";
import { createCollabServer } from "./server.js";

const config = loadConfig();
const backend = createBackendClient({ baseUrl: config.backendUrl, internalToken: config.internalToken });

// The key set is cached; a token signed with an unknown key makes it fetch the keys again.
const verifyToken = createTokenVerifier(createRemoteJWKSet(new URL(config.jwksUrl)));

await createCollabServer({
  port: config.port,
  backend,
  verifyToken,
  accessCheckInterval: config.accessCheckInterval,
}).listen();
