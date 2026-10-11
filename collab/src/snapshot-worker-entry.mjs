// Worker threads do not get the loader of tsx from the main thread: when collab runs from its sources (tests, `pnpm
// dev`), the thread registers it, then loads the worker. The build runs dist/snapshot-worker.js instead.
import { register } from "tsx/esm/api";

register();
await import("./snapshot-worker.ts");
