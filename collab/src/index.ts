import { createCollabServer } from "./server.js";

const port = Number(process.env.PORT ?? 1234);

await createCollabServer({ port }).listen();
