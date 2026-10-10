import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { collabUrl } from "./api.js";
import { report } from "./report.js";
import {
  crowdedBoard,
  largeDocuments,
  manyBoards,
  reconnectAll,
  type RunOptions,
  type StepResult,
} from "./scenarios.js";
import { Stack } from "./stack.js";

const SCENARIOS = ["boards", "crowd", "large", "reconnect"] as const;

const { values } = parseArgs({
  options: {
    url: { type: "string", default: process.env.STACK_URL ?? "http://localhost:8080" },
    "collab-url": { type: "string" },
    scenarios: { type: "string", default: SCENARIOS.join(",") },
    boards: { type: "string", default: "50,100,200,400" },
    "board-participants": { type: "string", default: "3" },
    crowd: { type: "string", default: "25,50,100" },
    "large-boards": { type: "string", default: "3" },
    "large-participants": { type: "string", default: "3" },
    "document-size": { type: "string", default: String(16 * 1024 * 1024) },
    "large-fill": { type: "string", default: "0.9" },
    "reconnect-boards": { type: "string", default: "100" },
    duration: { type: "string", default: "60" },
    warmup: { type: "string", default: "10" },
    "edit-interval": { type: "string", default: "3000" },
    "cursor-interval": { type: "string", default: "250" },
    shapes: { type: "string", default: "20" },
    workers: { type: "string", default: String(Math.min(8, availableParallelism())) },
    slo: { type: "string", default: "200" },
    "compose-project": { type: "string", default: "codraw-prod" },
    "collab-metrics-url": { type: "string" },
    out: { type: "string", default: new URL("../results/", import.meta.url).pathname },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`Load test of collaboration against a running stack (docs/load-testing.md).

  pnpm load [--url http://localhost:8080] [--scenarios ${SCENARIOS.join(",")}] [options]

  --boards 50,100,200,400     boards of the scenario boards, one step each
  --board-participants 3      participants of each of those boards
  --crowd 25,50,100           participants of the one board of the scenario crowd, one step each
  --large-boards 3            boards near the size limit; --large-participants 3, --document-size, --large-fill 0.9
  --reconnect-boards 100      boards whose participants come back after collab restarts (needs Docker)
  --duration 60 --warmup 10   seconds of each step
  --edit-interval 3000        mean milliseconds between edits of a participant
  --cursor-interval 250       mean milliseconds between cursor moves of a participant
  --slo 200                   the p95 of delivering an edit, in milliseconds, that a step must keep
  --workers N                 threads of the load client
  --compose-project codraw-prod  where the containers of the stack are; --collab-metrics-url without Docker
  --collab-url ws://…         collab outside the app address, e.g. a process under a profiler`);
  process.exit(0);
}

const numbers = (value: string) =>
  value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((number) => number > 0);
const number = (value: string) => Number(value);

const stack = await Stack.find({
  composeProject: values["compose-project"],
  collabMetricsUrl: values["collab-metrics-url"],
});
const options: RunOptions = {
  baseUrl: values.url,
  collabUrl: values["collab-url"] ?? collabUrl(values.url),
  stack,
  workers: number(values.workers),
  behaviour: {
    editInterval: number(values["edit-interval"]),
    cursorInterval: number(values["cursor-interval"]),
    shapes: number(values.shapes),
  },
  warmup: number(values.warmup),
  duration: number(values.duration),
  connectTimeout: 120_000,
  log: (line) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${line}`),
};
const scenarios = new Set(values.scenarios.split(",").map((scenario) => scenario.trim()));
const perBoard = number(values["board-participants"]);
const slo = number(values.slo);

options.log(
  `stack ${options.baseUrl}: ${stack.docker ? `containers of ${values["compose-project"]}` : "no containers"}, ` +
    `${stack.collabMetrics ? "metrics of collab" : "no metrics of collab"}`,
);
const results: StepResult[] = [];
if (scenarios.has("boards")) results.push(...(await manyBoards(options, numbers(values.boards), perBoard)));
if (scenarios.has("crowd")) results.push(...(await crowdedBoard(options, numbers(values.crowd))));
if (scenarios.has("large")) {
  const bytes = Math.floor(number(values["document-size"]) * number(values["large-fill"]));
  results.push(
    await largeDocuments(options, number(values["large-boards"]), number(values["large-participants"]), bytes),
  );
}
if (scenarios.has("reconnect")) {
  if (stack.canRestartCollab) results.push(await reconnectAll(options, number(values["reconnect-boards"]), perBoard));
  else options.log("reconnect: skipped, the run restarts collab through Docker and sees no container of it");
}

const text = report(results, { options, slo });
console.log(text);
await mkdir(values.out, { recursive: true });
const name = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(new URL(`${name}.md`, `file://${values.out}/`), text);
await writeFile(
  new URL(`${name}.json`, `file://${values.out}/`),
  JSON.stringify({ options: { ...options, stack: undefined }, slo, results }, null, 2),
);
options.log(`report: ${values.out}${name}.md`);
// Sockets of the API may linger in keep-alive.
process.exit(0);
