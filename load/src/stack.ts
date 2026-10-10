import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parsePrometheus, type Samples } from "./stats.js";

const run = promisify(execFile);

/** Services of the stack whose processor and memory a run watches. */
export const WATCHED_SERVICES = ["collab", "backend", "postgres", "frontend"] as const;
export type Service = (typeof WATCHED_SERVICES)[number];

/** The use of a container at one moment: processor in percent of one core, memory in MiB. */
export interface Usage {
  cpu: number;
  memory: number;
}

export interface StackOptions {
  /** The project of `docker compose` of the stack, as `name` of docker-compose.prod.yml has it. */
  composeProject: string;
  /** The metrics of collab without Docker, e.g. `http://localhost:1234/metrics` of a collab run with `pnpm dev:collab`. */
  collabMetricsUrl?: string;
}

/**
 * What the run reads of the stack besides the app address: the metrics of collab, which the app address does not give,
 * the processor and memory of the containers, and a restart of collab. With Docker it finds the containers of the stack
 * by the project of `docker compose`; without it only the metrics of collab at an address are read.
 */
export class Stack {
  private constructor(
    private readonly containers: Partial<Record<Service, string>>,
    private readonly collabMetricsUrl: string | undefined,
  ) {}

  static async find({ composeProject, collabMetricsUrl }: StackOptions): Promise<Stack> {
    const containers: Partial<Record<Service, string>> = {};
    for (const service of WATCHED_SERVICES) {
      try {
        const { stdout } = await run("docker", ["compose", "-p", composeProject, "ps", "-q", service]);
        const id = stdout.trim().split("\n")[0];
        if (id) containers[service] = id;
      } catch {
        // No Docker, or no such project: the run goes without the containers.
      }
    }
    return new Stack(containers, collabMetricsUrl);
  }

  /** Whether the run sees the containers of the stack. */
  get docker(): boolean {
    return this.containers.collab !== undefined;
  }

  /** Whether the run reads the metrics of collab. */
  get collabMetrics(): boolean {
    return this.docker || this.collabMetricsUrl !== undefined;
  }

  get canRestartCollab(): boolean {
    return this.containers.collab !== undefined;
  }

  /** The metrics of collab now; empty when the run does not read them. */
  async scrapeCollab(): Promise<Samples> {
    try {
      if (this.collabMetricsUrl) return parsePrometheus(await (await fetch(this.collabMetricsUrl)).text());
      if (!this.containers.collab) return new Map();
      // Inside the network of the stack only: the image has wget.
      const { stdout } = await run(
        "docker",
        ["exec", this.containers.collab, "wget", "-qO-", "http://127.0.0.1:1234/metrics"],
        {
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      return parsePrometheus(stdout);
    } catch {
      return new Map();
    }
  }

  /** The processor and memory of the containers now. */
  async usage(): Promise<Partial<Record<Service, Usage>>> {
    const services = Object.entries(this.containers) as [Service, string][];
    if (services.length === 0) return {};
    const { stdout } = await run("docker", [
      "stats",
      "--no-stream",
      "--format",
      "{{.ID}} {{.CPUPerc}} {{.MemUsage}}",
      ...services.map(([, id]) => id),
    ]);
    const usage: Partial<Record<Service, Usage>> = {};
    for (const line of stdout.trim().split("\n")) {
      const [id, cpu, memory] = line.split(" ");
      const service = services.find(([, container]) => container.startsWith(id!))?.[0];
      if (service) usage[service] = { cpu: Number.parseFloat(cpu!), memory: mebibytes(memory!) };
    }
    return usage;
  }

  /** Restarts collab as `docker restart` does: it stores what is pending and stops, then starts again. */
  async restartCollab(): Promise<void> {
    await run("docker", ["restart", this.containers.collab!]);
  }
}

/** Memory as `docker stats` prints it, e.g. `152.3MiB`, in MiB. */
export function mebibytes(value: string): number {
  const match = value.match(/^([\d.]+)\s*([KMGT]?i?B)$/);
  if (!match) return Number.NaN;
  const factor: Record<string, number> = {
    B: 1 / 1024 / 1024,
    KiB: 1 / 1024,
    kB: 1 / 1024,
    MiB: 1,
    MB: 1,
    GiB: 1024,
    GB: 1024,
    TiB: 1024 * 1024,
  };
  return Number(match[1]) * (factor[match[2]!] ?? Number.NaN);
}

/**
 * Samples the use of the containers every `period` milliseconds until it is stopped; a run reports the mean and the
 * peak of the steady part of a step.
 */
export class UsageSampler {
  private readonly samples: Partial<Record<Service, Usage>>[] = [];
  private running = false;
  private loop: Promise<void> | undefined;

  constructor(private readonly stack: Stack) {}

  start() {
    if (!this.stack.docker) return;
    this.running = true;
    this.samples.length = 0;
    this.loop = (async () => {
      while (this.running) {
        // docker stats takes about two seconds itself: it measures the processor over that time.
        this.samples.push(await this.stack.usage().catch(() => ({})));
      }
    })();
  }

  async stop(): Promise<Partial<Record<Service, { cpuMean: number; cpuPeak: number; memoryPeak: number }>>> {
    this.running = false;
    await this.loop;
    const summary: Partial<Record<Service, { cpuMean: number; cpuPeak: number; memoryPeak: number }>> = {};
    for (const service of WATCHED_SERVICES) {
      const usages = this.samples.map((sample) => sample[service]).filter((usage) => usage !== undefined);
      if (usages.length === 0) continue;
      summary[service] = {
        cpuMean: usages.reduce((sum, usage) => sum + usage.cpu, 0) / usages.length,
        cpuPeak: Math.max(...usages.map((usage) => usage.cpu)),
        memoryPeak: Math.max(...usages.map((usage) => usage.memory)),
      };
    }
    return summary;
  }
}
