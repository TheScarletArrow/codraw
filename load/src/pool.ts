import { Worker } from "node:worker_threads";
import type { ParticipantSpec } from "./participant.js";
import type { Command } from "./worker.js";

/**
 * Worker threads that host the participants of a step. One thread decodes every change and cursor move that its
 * participants receive, which on a crowded board outgrows a core long before collab does: participants spread over
 * several threads.
 */
export class Pool {
  private readonly queues: Promise<unknown>[];

  private constructor(private readonly workers: Worker[]) {
    this.queues = workers.map(() => Promise.resolve());
  }

  static create(size: number, baseUrl: string, collabUrl: string, firstIndex = 0): Pool {
    const workers = Array.from(
      { length: size },
      (_, index) =>
        new Worker(new URL("./worker-entry.mjs", import.meta.url), {
          workerData: { baseUrl, collabUrl, firstIndex: firstIndex + index * 100_000 },
        }),
    );
    return new Pool(workers);
  }

  get size(): number {
    return this.workers.length;
  }

  /** Sends a command to one worker after the commands sent to it before have been answered. */
  call<T>(index: number, command: Command): Promise<T> {
    const worker = this.workers[index]!;
    const answer = this.queues[index]!.then(
      () =>
        new Promise<T>((resolve, reject) => {
          const onError = (error: Error) => reject(error);
          worker.once("error", onError);
          worker.once("message", (message: { ok: boolean; result?: T; error?: string }) => {
            worker.off("error", onError);
            if (message.ok) resolve(message.result as T);
            else reject(new Error(message.error));
          });
          worker.postMessage(command);
        }),
    );
    this.queues[index] = answer.catch(() => undefined);
    return answer;
  }

  /** Sends a command to every worker and waits for all the answers. */
  all<T>(command: Command | ((index: number) => Command)): Promise<T[]> {
    return Promise.all(
      this.workers.map((_, index) => this.call<T>(index, typeof command === "function" ? command(index) : command)),
    );
  }

  /** Spreads participants over the workers in turn, so that each worker gets members of many boards. */
  spread(participants: ParticipantSpec[]): ParticipantSpec[][] {
    const shares: ParticipantSpec[][] = this.workers.map(() => []);
    participants.forEach((participant, index) => shares[index % shares.length]!.push(participant));
    return shares;
  }

  async close() {
    await this.all({ type: "close" }).catch(() => undefined);
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
