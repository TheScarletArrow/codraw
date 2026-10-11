import { createRemoteJWKSet } from "jose";
import { createTokenVerifier } from "./auth.js";
import { createBackendClient } from "./backend-client.js";
import { loadConfig } from "./config.js";
import { configureLogging, log } from "./log.js";
import { createCollabServer } from "./server.js";
import { createSnapshots } from "./snapshots.js";

const config = loadConfig();
configureLogging(config.logFormat);
const backend = createBackendClient({ baseUrl: config.backendUrl, internalToken: config.internalToken });

// The key set is cached; a token signed with an unknown key makes it fetch the keys again.
const verifyToken = createTokenVerifier(createRemoteJWKSet(new URL(config.jwksUrl)));

await createCollabServer({
  port: config.port,
  backend,
  snapshots: createSnapshots({ backendUrl: config.backendUrl, internalToken: config.internalToken }),
  verifyToken,
  accessCheckInterval: config.accessCheckInterval,
  userCheckInterval: config.userCheckInterval,
  documentSizeLimit: config.documentSizeLimit,
  broadcastDelay: config.broadcastDelay,
  // With a JSON log the start banner of Hocuspocus would be a stray line of text; the server tells it started instead.
  quiet: config.logFormat === "json",
}).listen();
log.info(`collab listens on port ${config.port}`, { "server.port": config.port });
