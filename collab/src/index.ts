import { createBackendClient } from "./backend-client.js";
import { loadConfig } from "./config.js";
import { createCollabServer } from "./server.js";

const config = loadConfig();
const backend = createBackendClient({ baseUrl: config.backendUrl, internalToken: config.internalToken });

await createCollabServer({ port: config.port, backend }).listen();
