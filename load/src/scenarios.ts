import { User } from "./api.js";
import { now, type Behaviour, type Measurements, type ParticipantSpec } from "./participant.js";
import { Pool } from "./pool.js";
import { UsageSampler, type Service, type Stack } from "./stack.js";
import { delta, histogramQuantile, percentiles, type Percentiles, type Samples } from "./stats.js";
import type { CollectResult, ConnectResult, OfflineMarksResult, ResyncResult } from "./worker.js";

export interface RunOptions {
  baseUrl: string;
  /** Where participants connect to collab: behind the app address, as in the app, unless the run says otherwise. */
  collabUrl: string;
  stack: Stack;
  workers: number;
  behaviour: Behaviour;
  /** Seconds of load before measuring, and seconds of measuring. */
  warmup: number;
  duration: number;
  /** How long a participant may take to get its board in sync, in milliseconds. */
  connectTimeout: number;
  log: (line: string) => void;
}

/** What one step of a scenario measured. */
export interface StepResult {
  scenario: string;
  step: string;
  boards: number;
  participants: number;
  connect: Percentiles;
  connectFailures: number;
  edits: Percentiles;
  cursors: Percentiles;
  editsSent: number;
  /** Edits delivered of those that should have been, 1 when none was lost. */
  delivered: number;
  cursorsSent: number;
  disconnects: number;
  authenticationFailures: number;
  tokenFailures: number;
  /** The worst delay of the event loop of a worker thread of the load client, in milliseconds. */
  clientEventLoopDelayP99: number;
  collab: CollabResult | null;
  usage: Partial<Record<Service, { cpuMean: number; cpuPeak: number; memoryPeak: number }>>;
  /** Anything else the step found, e.g. how participants came back after collab restarted. */
  notes: Record<string, number | string>;
}

/** What the metrics of collab say about a step: stores of documents in the backend and refusals. */
export interface CollabResult {
  stores: number;
  storeFailures: number;
  storeMean: number | null;
  storeP95: number | null;
  rejections: number;
  connections: number;
  documents: number;
  /** Processor time of collab per second of the step, in percent of one core, and its resident memory in MiB. */
  cpu: number | null;
  memory: number | null;
}

/** The boards of a step, with the users who own and open them. */
interface Boards {
  owners: User[];
  ids: string[];
  participants: ParticipantSpec[];
}

/** Signs in `perBoard` guests for each of `count` boards; the first creates the board, the others open its link. */
async function prepareBoards(options: RunOptions, count: number, perBoard: number, title: string): Promise<Boards> {
  const owners: User[] = [];
  const ids: string[] = [];
  const participants: ParticipantSpec[] = [];
  await inBatches(count, 16, async (board) => {
    const owner = new User(options.baseUrl);
    await owner.signInAsGuest();
    const id = await owner.createBoard(`${title} ${board + 1}`);
    owners[board] = owner;
    ids[board] = id;
    const members = [owner];
    for (let index = 1; index < perBoard; index++) {
      const member = new User(options.baseUrl);
      await member.signInAsGuest();
      await member.openBoard(id);
      members.push(member);
    }
    members.forEach((member, index) =>
      participants.push({ boardId: id, user: member.state(), initializes: index === 0 }),
    );
  });
  return { owners, ids, participants };
}

/** Runs `task` for 0…count−1, at most `parallel` at a time. */
async function inBatches(count: number, parallel: number, task: (index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(parallel, count) }, async () => {
      while (next < count) await task(next++);
    }),
  );
}

async function deleteBoards(boards: Boards) {
  await inBatches(boards.ids.length, 16, async (index) => {
    await boards.owners[index]!.deleteBoard(boards.ids[index]!).catch(() => undefined);
  });
}

const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/** Connects the participants, spread over the workers of the pool. */
async function connect(pool: Pool, options: RunOptions, participants: ParticipantSpec[]): Promise<ConnectResult> {
  const perBoard: Record<string, number> = {};
  participants.forEach(({ boardId }) => (perBoard[boardId] = (perBoard[boardId] ?? 0) + 1));
  const shares = pool.spread(participants);
  const results = await pool.all<ConnectResult>((index) => ({
    type: "connect",
    participants: shares[index]!,
    boardParticipants: perBoard,
    timeout: options.connectTimeout,
  }));
  return {
    connectTimes: results.flatMap((result) => result.connectTimes),
    failures: results.flatMap((result) => result.failures),
  };
}

/**
 * Lets the participants work: warms up, then measures for the duration of the step, and stops editing. Participants
 * get a few seconds to receive what is in flight before they are counted.
 */
async function measure(pool: Pool, options: RunOptions, behaviour: Behaviour) {
  await pool.all({ type: "start", behaviour });
  await sleep(options.warmup);
  await pool.all({ type: "reset", since: now() });
  const sampler = new UsageSampler(options.stack);
  const before = await options.stack.scrapeCollab();
  const started = now();
  sampler.start();
  await sleep(options.duration);
  await pool.all({ type: "stop" });
  const usage = await sampler.stop();
  await sleep(3);
  const after = await options.stack.scrapeCollab();
  const seconds = (now() - started) / 1000;
  const collected = await pool.all<CollectResult>({ type: "collect" });
  return { collected, usage, collab: options.stack.collabMetrics ? collabResult(before, after, seconds) : null };
}

function collabResult(before: Samples, after: Samples, seconds: number): CollabResult {
  const stores = ["stored", "failed", "board_deleted"].map((result) =>
    delta(before, after, `codraw_collab_stores_total{result="${result}"}`),
  );
  const count = delta(before, after, "codraw_collab_store_duration_seconds_count");
  const sum = delta(before, after, "codraw_collab_store_duration_seconds_sum");
  let rejections = 0;
  for (const key of after.keys())
    if (key.startsWith("codraw_collab_rejections_total")) rejections += delta(before, after, key);
  const p95 = histogramQuantile(before, after, "codraw_collab_store_duration_seconds", 0.95);
  const cpu = after.has("process_cpu_seconds_total")
    ? (delta(before, after, "process_cpu_seconds_total") / seconds) * 100
    : null;
  const memory = after.get("process_resident_memory_bytes");
  return {
    stores: stores.reduce((sum, value) => sum + value, 0),
    storeFailures: stores[1]!,
    storeMean: count > 0 ? (sum / count) * 1000 : null,
    storeP95: p95 === null ? null : p95 * 1000,
    rejections,
    connections: after.get("codraw_collab_connections") ?? 0,
    documents: after.get("codraw_collab_documents") ?? 0,
    cpu,
    memory: memory === undefined ? null : memory / 1024 / 1024,
  };
}

function stepResult(
  scenario: string,
  step: string,
  boards: number,
  connected: ConnectResult,
  measured: Awaited<ReturnType<typeof measure>>,
  notes: Record<string, number | string> = {},
): StepResult {
  const sum = (pick: (result: Measurements) => number) =>
    measured.collected.reduce((total, result) => total + pick(result), 0);
  const expected = sum((result) => result.editsExpected);
  return {
    scenario,
    step,
    boards,
    participants: connected.connectTimes.length + connected.failures.length,
    connect: percentiles(connected.connectTimes),
    connectFailures: connected.failures.length,
    edits: percentiles(measured.collected.flatMap((result) => result.editLatencies)),
    cursors: percentiles(measured.collected.flatMap((result) => result.awarenessLatencies)),
    editsSent: sum((result) => result.editsSent),
    delivered: expected === 0 ? 1 : sum((result) => result.editsReceived) / expected,
    cursorsSent: sum((result) => result.cursorsSent),
    disconnects: sum((result) => result.disconnects),
    authenticationFailures: sum((result) => result.authenticationFailures),
    tokenFailures: sum((result) => result.tokenFailures),
    clientEventLoopDelayP99: Math.max(...measured.collected.map((result) => result.eventLoopDelayP99)),
    collab: measured.collab,
    usage: measured.usage,
    notes,
  };
}

/** Many boards of a few participants each: the usual load of an installation. */
export async function manyBoards(options: RunOptions, counts: number[], perBoard: number): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const count of counts) {
    options.log(`boards: ${count} boards of ${perBoard} participants`);
    results.push(await boardsStep(options, "boards", `${count} × ${perBoard}`, count, perBoard, options.behaviour));
  }
  return results;
}

/** One board with many participants: a workshop or a presentation, where every cursor goes to everybody. */
export async function crowdedBoard(options: RunOptions, sizes: number[]): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const size of sizes) {
    options.log(`crowd: one board of ${size} participants`);
    results.push(await boardsStep(options, "crowd", `1 × ${size}`, 1, size, options.behaviour));
  }
  return results;
}

async function boardsStep(
  options: RunOptions,
  scenario: string,
  step: string,
  count: number,
  perBoard: number,
  behaviour: Behaviour,
): Promise<StepResult> {
  const boards = await prepareBoards(options, count, perBoard, `Нагрузка ${scenario}`);
  const pool = Pool.create(Math.min(options.workers, boards.participants.length), options.baseUrl, options.collabUrl);
  try {
    const connected = await connect(pool, options, boards.participants);
    const measured = await measure(pool, options, behaviour);
    return stepResult(scenario, step, count, connected, measured);
  } finally {
    await pool.close();
    await deleteBoards(boards);
  }
}

/**
 * Boards near the limit of the size of a document: the owner fills each board, then participants open it — every
 * opening loads the whole document from the backend — and edit it, so that every store sends the whole state.
 */
export async function largeDocuments(
  options: RunOptions,
  count: number,
  perBoard: number,
  bytes: number,
): Promise<StepResult> {
  options.log(`large: ${count} boards of ${(bytes / 1024 / 1024).toFixed(1)} MiB, ${perBoard} participants each`);
  const boards = await prepareBoards(options, count, perBoard, "Нагрузка large");
  const fillers = Pool.create(count, options.baseUrl, options.collabUrl);
  const owners = boards.participants.filter((participant) => participant.initializes);
  try {
    // One owner in each worker: `fill` fills the board of the first participant of the worker.
    await connect(fillers, options, owners);
    const filled = now();
    await fillers.all({ type: "fill", bytes, chunk: 512 * 1024 });
    options.log(`large: filled in ${((now() - filled) / 1000).toFixed(1)} s`);
  } finally {
    // The last participant leaves: collab stores the document at once.
    await fillers.close();
  }
  await sleep(5);
  const pool = Pool.create(
    Math.min(options.workers, boards.participants.length),
    options.baseUrl,
    options.collabUrl,
    1_000_000,
  );
  try {
    const connected = await connect(pool, options, boards.participants);
    const measured = await measure(pool, options, options.behaviour);
    return stepResult(
      "large",
      `${count} × ${perBoard}, ${(bytes / 1024 / 1024).toFixed(1)} MiB`,
      count,
      connected,
      measured,
    );
  } finally {
    await pool.close();
    await deleteBoards(boards);
  }
}

/**
 * Collab restarts under load: every participant connects again, gets a new token and its board in sync, and the edits
 * that participants made while collab was away reach all the others.
 */
export async function reconnectAll(options: RunOptions, count: number, perBoard: number): Promise<StepResult> {
  options.log(`reconnect: ${count} boards of ${perBoard} participants, collab restarts`);
  const boards = await prepareBoards(options, count, perBoard, "Нагрузка reconnect");
  const pool = Pool.create(Math.min(options.workers, boards.participants.length), options.baseUrl, options.collabUrl);
  try {
    const connected = await connect(pool, options, boards.participants);
    await pool.all({ type: "start", behaviour: options.behaviour });
    await sleep(options.warmup);
    await pool.all({ type: "reset", since: now() });
    await pool.all({ type: "expect-resync" });
    const restarted = now();
    const restart = options.stack.restartCollab();
    // Collab stores the documents and closes the connections as it stops: the marks are written while it is away.
    await pool.all({ type: "await-disconnect", timeout: 15_000 });
    await pool.all({ type: "write-offline-marks" });
    await restart;
    const restartSeconds = (now() - restarted) / 1000;
    const resynced = await pool.all<ResyncResult>({ type: "await-resync", timeout: 120_000 });
    const syncedAt = resynced.flatMap((result) => result.syncedAt);
    const back = syncedAt.filter((at) => at !== null).map((at) => at - restarted);
    // The new process starts its metrics from zero.
    await sleep(5);
    const marks = (await pool.all<OfflineMarksResult>({ type: "count-offline-marks" })).flatMap(
      (result) => result.marks,
    );
    const missing = marks.filter((mark) => mark.has < perBoard).length;
    await pool.all({ type: "stop" });
    const collected = await pool.all<CollectResult>({ type: "collect" });
    // The new process of collab counts from zero: what it did since it started.
    const after = await options.stack.scrapeCollab();
    const reconnected = percentiles(back);
    return stepResult(
      "reconnect",
      `${count} × ${perBoard}`,
      count,
      connected,
      {
        collected,
        usage: {},
        collab: options.stack.collabMetrics ? collabResult(new Map(), after, (now() - restarted) / 1000) : null,
      },
      {
        "docker restart, s": restartSeconds.toFixed(1),
        "back in sync, p50 s": ((reconnected.p50 ?? 0) / 1000).toFixed(1),
        "back in sync, p95 s": ((reconnected.p95 ?? 0) / 1000).toFixed(1),
        "back in sync, max s": ((reconnected.max ?? 0) / 1000).toFixed(1),
        "not back in 120 s": syncedAt.length - back.length,
        "participants without all offline edits": missing,
      },
    );
  } finally {
    await pool.close();
    await deleteBoards(boards);
  }
}
