import type { Hocuspocus } from "@hocuspocus/server";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

/** How storing a document in the backend ended; a draft is not stored once its proposal is closed or deleted. */
export type StoreResult = "stored" | "failed" | "board_deleted" | "proposal_closed" | "proposal_deleted";

/**
 * How sending the text of a board for search to the backend ended: `kept` when the backend had a text already and the
 * text of an earlier state was not to replace it.
 */
export type SearchTextResult = "stored" | "kept" | "failed";

/**
 * Why collab refused a participant: at connecting (`permission-denied` for a token it does not accept, `no-access`,
 * `board-not-found`, `proposal-not-found`, `error` when the backend could not tell), for a change
 * (`document-too-large`), or by closing their connection after the access to the board or the draft changed
 * (`access-changed`).
 */
export type RejectionReason =
  | "permission-denied"
  | "no-access"
  | "board-not-found"
  | "proposal-not-found"
  | "error"
  | "document-too-large"
  | "access-changed";

const STORE_RESULTS: StoreResult[] = ["stored", "failed", "board_deleted", "proposal_closed", "proposal_deleted"];
const SEARCH_TEXT_RESULTS: SearchTextResult[] = ["stored", "kept", "failed"];
const REJECTION_REASONS: RejectionReason[] = [
  "permission-denied",
  "no-access",
  "board-not-found",
  "proposal-not-found",
  "error",
  "document-too-large",
  "access-changed",
];

export type Metrics = ReturnType<typeof createMetrics>;

/** Metrics of collab in the Prometheus format, in a registry of its own: tests start several servers in one process. */
export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  let instance: Hocuspocus | undefined;

  new Gauge({
    name: "codraw_collab_connections",
    help: "Connections of participants to board documents and drafts of proposals",
    registers: [registry],
    collect() {
      this.set(instance?.getConnectionsCount() ?? 0);
    },
  });
  new Gauge({
    name: "codraw_collab_documents",
    help: "Board documents and drafts of proposals open in collab",
    registers: [registry],
    collect() {
      this.set(instance?.getDocumentsCount() ?? 0);
    },
  });
  const stores = new Counter({
    name: "codraw_collab_stores_total",
    help: "Stores of board documents and drafts of proposals in the backend, by result",
    labelNames: ["result"],
    registers: [registry],
  });
  const storeDuration = new Histogram({
    name: "codraw_collab_store_duration_seconds",
    help: "Time of storing a board document or a draft of a proposal in the backend",
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  const searchTexts = new Counter({
    name: "codraw_collab_search_texts_total",
    help: "Texts of boards for search sent to the backend, by result",
    labelNames: ["result"],
    registers: [registry],
  });
  const rejections = new Counter({
    name: "codraw_collab_rejections_total",
    help: "Participants refused at connecting, for a change, or after a change of access, by reason",
    labelNames: ["reason"],
    registers: [registry],
  });
  // Every label shows with 0 before it first happens, so that rules see it.
  STORE_RESULTS.forEach((result) => stores.labels(result).inc(0));
  SEARCH_TEXT_RESULTS.forEach((result) => searchTexts.labels(result).inc(0));
  REJECTION_REASONS.forEach((reason) => rejections.labels(reason).inc(0));

  return {
    registry,
    /** The Hocuspocus instance whose connections and documents the gauges count. */
    observe(hocuspocus: Hocuspocus) {
      instance = hocuspocus;
    },
    stored(result: StoreResult, seconds: number) {
      stores.labels(result).inc();
      storeDuration.observe(seconds);
    },
    searchTextSent(result: SearchTextResult) {
      searchTexts.labels(result).inc();
    },
    rejected(reason: RejectionReason) {
      rejections.labels(reason).inc();
    },
  };
}

/** The reason of a rejection at connecting, from the error that Hocuspocus sends to the client. */
export function rejectionReasonOf(error: unknown): RejectionReason {
  const reason = (error as { reason?: unknown } | null)?.reason;
  return REJECTION_REASONS.includes(reason as RejectionReason) ? (reason as RejectionReason) : "error";
}
