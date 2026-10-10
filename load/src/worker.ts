import { monitorEventLoopDelay } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";
import {
  emptyMeasurements,
  now,
  Participant,
  type Behaviour,
  type Measurements,
  type ParticipantSpec,
} from "./participant.js";

/** What the main thread asks a worker to do with its participants. */
export type Command =
  | { type: "connect"; participants: ParticipantSpec[]; boardParticipants: Record<string, number>; timeout: number }
  | { type: "start"; behaviour: Behaviour }
  | { type: "stop" }
  | { type: "reset"; since: number }
  | { type: "collect" }
  | { type: "fill"; bytes: number; chunk: number }
  | { type: "expect-resync" }
  | { type: "await-disconnect"; timeout: number }
  | { type: "write-offline-marks" }
  | { type: "await-resync"; timeout: number }
  | { type: "count-offline-marks" }
  | { type: "close" };

export interface ConnectResult {
  /** Times from creating a participant until its board was in sync, in milliseconds. */
  connectTimes: number[];
  failures: string[];
}

export interface CollectResult extends Measurements {
  /** The 99th percentile of the delay of the event loop of the worker, in milliseconds: whether the load client kept up. */
  eventLoopDelayP99: number;
}

export interface ResyncResult {
  /** When each participant got in sync again, as wall-clock milliseconds; `null` for those that did not in time. */
  syncedAt: (number | null)[];
}

export interface OfflineMarksResult {
  /** Marks that each participant has, with the number its board should have. */
  marks: { boardId: string; has: number }[];
}

const { baseUrl, collabUrl, firstIndex } = workerData as { baseUrl: string; collabUrl: string; firstIndex: number };
const participants: Participant[] = [];
let measurements = emptyMeasurements();
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();

parentPort!.on("message", (command: Command) => {
  void handle(command).then(
    (result) => parentPort!.postMessage({ ok: true, result }),
    (error: unknown) => parentPort!.postMessage({ ok: false, error: String(error) }),
  );
});

async function handle(command: Command): Promise<unknown> {
  switch (command.type) {
    case "connect": {
      const created = command.participants.map((spec, offset) => {
        const participant = new Participant(
          spec,
          baseUrl,
          collabUrl,
          firstIndex + participants.length + offset,
          () => measurements,
        );
        participant.boardParticipants = command.boardParticipants[spec.boardId] ?? 1;
        return participant;
      });
      participants.push(...created);
      const failures: string[] = [];
      const connectTimes: number[] = [];
      await Promise.all(
        created.map((participant) =>
          participant.synced(command.timeout).then(
            () => connectTimes.push(participant.syncedAt! - participant.startedAt),
            (error: unknown) => failures.push(String(error)),
          ),
        ),
      );
      return { connectTimes, failures } satisfies ConnectResult;
    }
    case "start":
      participants.forEach((participant) => participant.start(command.behaviour));
      return null;
    case "stop":
      participants.forEach((participant) => participant.stop());
      return null;
    case "reset":
      measurements = emptyMeasurements(command.since);
      loopDelay.reset();
      return null;
    case "collect":
      return { ...measurements, eventLoopDelayP99: loopDelay.percentile(99) / 1e6 } satisfies CollectResult;
    case "fill":
      // The board of the first participant of the worker; the main thread sends this to a worker with one participant.
      await participants[0]!.fill(command.bytes, command.chunk);
      return null;
    case "expect-resync":
      participants.forEach((participant) => participant.expectResync());
      return null;
    case "await-disconnect": {
      const deadline = now() + command.timeout;
      while (now() < deadline && participants.some((participant) => participant.connected)) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return null;
    }
    case "write-offline-marks":
      participants.forEach((participant) => participant.writeOfflineMark());
      return null;
    case "await-resync": {
      const deadline = now() + command.timeout;
      while (now() < deadline && participants.some((participant) => participant.syncedAt === null)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { syncedAt: participants.map((participant) => participant.syncedAt) } satisfies ResyncResult;
    }
    case "count-offline-marks":
      return {
        marks: participants.map((participant) => ({
          boardId: participant.spec.boardId,
          has: participant.offlineMarks(),
        })),
      } satisfies OfflineMarksResult;
    case "close":
      participants.splice(0).forEach((participant) => participant.destroy());
      loopDelay.disable();
      setTimeout(() => process.exit(0), 100);
      return null;
  }
}
