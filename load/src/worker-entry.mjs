// Worker threads do not get the loader of tsx from the main thread: the thread registers it, then loads the worker.
import { register } from "tsx/esm/api";

register();
await import("./worker.ts");
