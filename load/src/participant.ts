import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { User, type UserState } from "./api.js";

/** The board model of the app (frontend/src/diagram/model.ts): the default page with its root and layer cells. */
const SCHEMA_VERSION = 2;
const PAGE_ID = "page-1";
const ROOT_CELL_ID = "0";
const LAYER_CELL_ID = "1";

/** Fields that a load client adds to its cells and its awareness: when the change left and whose it is. */
const SENT_AT = "loadSentAt";
const SENT_BY = "loadBy";
/** Cells that a client writes while collab is away; every participant of the board must get them after reconnecting. */
const OFFLINE_PREFIX = "offline-";

/** How a participant behaves; times are means of exponential distributions, so that clients do not move in step. */
export interface Behaviour {
  /** Mean time between two edits of the board, in milliseconds; 0 turns editing off. */
  editInterval: number;
  /** Mean time between two moves of the cursor, in milliseconds; 0 turns the cursor off. */
  cursorInterval: number;
  /** Shapes that the participant creates before it only moves them. */
  shapes: number;
}

export interface ParticipantSpec {
  boardId: string;
  user: UserState;
  /** Creates the default page when the board has none, as the first participant who edits does in the app. */
  initializes: boolean;
}

/** What participants of one worker measured since the last reset. */
export interface Measurements {
  /** When the measurements started, in wall-clock milliseconds. */
  since: number;
  /** Delays of delivering an edit to another participant, in milliseconds. */
  editLatencies: number[];
  /** Delays of delivering a cursor move to another participant, in milliseconds. */
  awarenessLatencies: number[];
  editsSent: number;
  /** Edits of others that participants received; ideally `editsSent × (participants of the board − 1)`. */
  editsReceived: number;
  /** Edits that should have reached a participant: for every edit sent, the other participants of its board. */
  editsExpected: number;
  cursorsSent: number;
  disconnects: number;
  authenticationFailures: number;
  tokenFailures: number;
}

/** Measurements that count only what was sent at `since` or later: an edit of the warm-up is not one of the step. */
export const emptyMeasurements = (since = 0): Measurements => ({
  since,
  editLatencies: [],
  awarenessLatencies: [],
  editsSent: 0,
  editsReceived: 0,
  editsExpected: 0,
  cursorsSent: 0,
  disconnects: 0,
  authenticationFailures: 0,
  tokenFailures: 0,
});

/** The wall clock in milliseconds with a fraction, comparable between the worker threads of the process. */
export const now = () => performance.timeOrigin + performance.now();

/** A random delay with the given mean: the time between independent events. */
const exponential = (mean: number) => -Math.log(1 - Math.random()) * mean;

/**
 * A participant of a board as the app is one: it gets a token of collab through the API before every connection, syncs
 * the board document, edits cells of the default page and moves its cursor. It measures how long the edits and cursor
 * moves of the other participants of its board take to reach it.
 */
export class Participant {
  readonly document = new Y.Doc();
  readonly provider: HocuspocusProvider;
  /** How many participants of this board the run has; tells how many deliveries an edit should make. */
  boardParticipants = 1;
  private readonly user: User;
  private readonly tag: string;
  private readonly lastCursorOf = new Map<number, number>();
  private editTimer: NodeJS.Timeout | undefined;
  private cursorTimer: NodeJS.Timeout | undefined;
  private created = 0;
  private edits = 0;
  /** The provider has a connection to collab now. */
  connected = false;
  private syncs = 0;
  private syncWaiters: (() => void)[] = [];
  /** When the participant got the board in sync for the first time since it was created or {@link expectResync}. */
  syncedAt: number | null = null;
  readonly startedAt = now();

  constructor(
    readonly spec: ParticipantSpec,
    baseUrl: string,
    collab: string,
    readonly index: number,
    private readonly measurements: () => Measurements,
  ) {
    this.user = User.restore(baseUrl, spec.user);
    this.tag = `load-${index}-${Math.random().toString(36).slice(2, 8)}`;
    this.provider = new HocuspocusProvider({
      url: collab,
      name: spec.boardId,
      document: this.document,
      // As in the app: a token before every connection, so a reconnect after collab restarted gets a fresh one.
      token: async () => {
        try {
          return await this.user.collabToken(spec.boardId);
        } catch (error) {
          this.measurements().tokenFailures++;
          throw error;
        }
      },
      onSynced: ({ state }) => {
        if (!state) return;
        this.syncs++;
        if (this.syncedAt === null) this.syncedAt = now();
        if (this.spec.initializes) this.initialize();
        this.syncWaiters.splice(0).forEach((resolve) => resolve());
      },
      onStatus: ({ status }) => {
        if (status === "connected") this.connected = true;
        if (status === "disconnected" && this.connected) {
          this.connected = false;
          this.measurements().disconnects++;
        }
      },
      onAuthenticationFailed: () => {
        this.measurements().authenticationFailures++;
      },
    });
    this.provider.awareness?.setLocalState({ user: { name: spec.user.name, color: "#4f46e5" }, page: PAGE_ID });
    this.cells().observeDeep((events) => this.received(events));
    this.provider.awareness?.on("change", ({ added, updated }: { added: number[]; updated: number[] }) =>
      this.cursorsReceived([...added, ...updated]),
    );
  }

  /** Resolves once the board is in sync, or rejects after `timeout` milliseconds. */
  synced(timeout: number): Promise<void> {
    if (this.syncs > 0 && this.provider.isSynced) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Board ${this.spec.boardId} did not sync in ${timeout} ms`)),
        timeout,
      );
      this.syncWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Forgets the time of the last sync: the next sync, e.g. after collab restarted, sets it again. */
  expectResync() {
    this.syncedAt = null;
  }

  start(behaviour: Behaviour) {
    this.stop();
    if (behaviour.editInterval > 0) {
      const next = () => {
        this.editTimer = setTimeout(() => {
          this.edit(behaviour.shapes);
          next();
        }, exponential(behaviour.editInterval));
      };
      next();
    }
    if (behaviour.cursorInterval > 0) {
      const next = () => {
        this.cursorTimer = setTimeout(() => {
          this.moveCursor();
          next();
        }, exponential(behaviour.cursorInterval));
      };
      next();
    }
  }

  stop() {
    clearTimeout(this.editTimer);
    clearTimeout(this.cursorTimer);
  }

  destroy() {
    this.stop();
    this.provider.destroy();
    this.document.destroy();
  }

  /**
   * Writes text into a cell of its own until the document has grown by about `bytes`; a large board is built of many
   * labels in pieces of `chunk` bytes, each piece a change of its own, as pastes of text are.
   */
  async fill(bytes: number, chunk: number) {
    for (let written = 0; written < bytes; written += chunk) {
      const id = `${this.tag}-fill-${written}`;
      this.document.transact(() => {
        const cell = this.newCell(id, Math.floor(written / chunk));
        cell.set("value", "x".repeat(chunk));
        this.cells().set(id, cell);
      });
      // Lets the provider send each piece before the next one is made.
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** Writes a cell that every participant of the board must have once they are all in sync again. */
  writeOfflineMark() {
    const id = `${OFFLINE_PREFIX}${this.tag}`;
    this.document.transact(() => this.cells().set(id, this.newCell(id, 0)));
  }

  /** Cells written by {@link writeOfflineMark}, of all participants of the board. */
  offlineMarks(): number {
    let marks = 0;
    for (const id of this.cells().keys()) if (id.startsWith(OFFLINE_PREFIX)) marks++;
    return marks;
  }

  /** Moves a shape of its own, or creates one while it has fewer than `shapes`. */
  private edit(shapes: number) {
    if (!this.provider.isSynced) return;
    const measurements = this.measurements();
    const cells = this.cells();
    const sentAt = now();
    this.document.transact(() => {
      const geometry = {
        x: Math.round(Math.random() * 2000),
        y: Math.round(Math.random() * 1200),
        width: 120,
        height: 60,
      };
      if (this.created < shapes) {
        const id = `${this.tag}-${this.created++}`;
        const cell = this.newCell(id, this.created);
        cell.set("geometry", geometry);
        cell.set(SENT_AT, sentAt);
        cell.set(SENT_BY, this.tag);
        cells.set(id, cell);
      } else {
        const cell = cells.get(`${this.tag}-${this.edits % shapes}`) as Y.Map<unknown> | undefined;
        if (!cell) return;
        cell.set("geometry", geometry);
        cell.set(SENT_AT, sentAt);
      }
    });
    this.edits++;
    // Counted by the same moment as their deliveries are.
    if (sentAt < measurements.since) return;
    measurements.editsSent++;
    measurements.editsExpected += this.boardParticipants - 1;
  }

  private moveCursor() {
    const awareness = this.provider.awareness;
    if (!awareness || !this.provider.isSynced) return;
    awareness.setLocalState({
      ...awareness.getLocalState(),
      cursor: { x: Math.round(Math.random() * 2000), y: Math.round(Math.random() * 1200) },
      [SENT_AT]: now(),
    });
    const measurements = this.measurements();
    if (now() >= measurements.since) measurements.cursorsSent++;
  }

  private received(events: Y.YEvent<Y.AbstractType<unknown>>[]) {
    const at = now();
    const measurements = this.measurements();
    for (const event of events) {
      if (event.transaction.local) continue;
      if (event.target === this.cells()) {
        // A new shape of another participant.
        for (const [key, change] of event.changes.keys) {
          if (change.action !== "add") continue;
          const sentAt = (this.cells().get(key) as Y.Map<unknown> | undefined)?.get(SENT_AT);
          if (typeof sentAt === "number") this.delivered(measurements, sentAt, at);
        }
      } else if (event instanceof Y.YMapEvent && event.keysChanged.has(SENT_AT)) {
        // A move of a shape that the participant has had already.
        const sentAt = (event.target as Y.Map<unknown>).get(SENT_AT);
        if (typeof sentAt === "number") this.delivered(measurements, sentAt, at);
      }
    }
  }

  private delivered(measurements: Measurements, sentAt: number, at: number) {
    if (sentAt < measurements.since) return;
    measurements.editsReceived++;
    measurements.editLatencies.push(at - sentAt);
  }

  private cursorsReceived(clients: number[]) {
    const awareness = this.provider.awareness;
    if (!awareness) return;
    const at = now();
    for (const client of clients) {
      if (client === awareness.clientID) continue;
      const sentAt = awareness.getStates().get(client)?.[SENT_AT];
      if (typeof sentAt !== "number" || this.lastCursorOf.get(client) === sentAt) continue;
      this.lastCursorOf.set(client, sentAt);
      const measurements = this.measurements();
      if (sentAt >= measurements.since) measurements.awarenessLatencies.push(at - sentAt);
    }
  }

  private initialize() {
    const pages = this.document.getMap<Y.Map<unknown>>("pages");
    if (pages.size > 0) return;
    this.document.transact(() => {
      this.document.getMap("meta").set("schemaVersion", SCHEMA_VERSION);
      const page = new Y.Map<unknown>();
      page.set("name", "Страница 1");
      page.set("order", "a0");
      pages.set(PAGE_ID, page);
      const cells = this.cells();
      cells.set(ROOT_CELL_ID, this.structuralCell("root", null));
      cells.set(LAYER_CELL_ID, this.structuralCell("layer", ROOT_CELL_ID));
    });
  }

  private structuralCell(kind: string, parent: string | null, styles: Record<string, string> = {}) {
    // A map not yet in the document reads nothing back: its style is filled in before it is set.
    const style = new Y.Map<unknown>();
    for (const [key, value] of Object.entries(styles)) style.set(key, value);
    const cell = new Y.Map<unknown>();
    cell.set("kind", kind);
    cell.set("parent", parent);
    cell.set("order", "a0");
    cell.set("value", "");
    cell.set("geometry", null);
    cell.set("source", null);
    cell.set("target", null);
    cell.set("style", style);
    return cell;
  }

  /** A rectangle on the layer of the page, as the editor writes it. */
  private newCell(id: string, order: number) {
    const cell = this.structuralCell("vertex", LAYER_CELL_ID, { shape: "rectangle", fillColor: "#dae8fc" });
    cell.set("order", `a${order.toString(36)}`);
    cell.set("value", id);
    return cell;
  }

  private cells() {
    return this.document.getMap<Y.Map<unknown>>(`cells:${PAGE_ID}`);
  }
}
