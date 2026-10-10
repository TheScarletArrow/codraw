import { cpus, totalmem } from "node:os";
import type { RunOptions, StepResult } from "./scenarios.js";
import { ms } from "./stats.js";

/** A step keeps the target when the p95 of delivering an edit stays within it and nothing was lost or refused. */
export function keepsTarget(result: StepResult, slo: number): boolean {
  return (
    result.edits.p95 !== null &&
    result.edits.p95 <= slo &&
    result.connectFailures === 0 &&
    result.delivered >= 0.999 &&
    result.authenticationFailures === 0 &&
    result.tokenFailures === 0 &&
    (result.collab?.storeFailures ?? 0) === 0
  );
}

/**
 * The limit of the installation that a scenario found: the largest step that kept the target, and the first one that
 * did not. Steps are in the order of growing load.
 */
export function limitOf(results: StepResult[], slo: number): { kept: StepResult | null; broke: StepResult | null } {
  let kept: StepResult | null = null;
  for (const result of results) {
    if (!keepsTarget(result, slo)) return { kept, broke: result };
    kept = result;
  }
  return { kept, broke: null };
}

const percent = (value: number | undefined) => (value === undefined ? "—" : `${Math.round(value)} %`);
const mib = (value: number | null | undefined) =>
  value === undefined || value === null ? "—" : `${Math.round(value)} МиБ`;

/** The report of a run in Markdown, as docs/load-testing.md quotes it. */
export function report(results: StepResult[], { options, slo }: { options: RunOptions; slo: number }): string {
  const lines: string[] = [];
  const { behaviour } = options;
  lines.push(`# Нагрузочный прогон ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "");
  lines.push(
    `Стек: ${options.baseUrl}; клиент: ядер — ${cpus().length} (${cpus()[0]?.model.trim() ?? ""}), ` +
      `памяти — ${Math.round(totalmem() / 1024 ** 3)} ГБ, потоков — ${options.workers}. Участник правит доску в среднем раз в ` +
      `${behaviour.editInterval} мс и двигает курсор раз в ${behaviour.cursorInterval} мс; шаг — ${options.warmup} с ` +
      `разгона и ${options.duration} с замера. Цель: p95 доставки правки ≤ ${slo} мс без потерь и отказов.`,
    "",
  );
  lines.push(
    "| Сценарий | Шаг | Участников | Вход p95, мс | Правка p50 / p95 / p99, мс | Курсор p95, мс | Доставлено | Разрывы | " +
      "Сохранений | Сохранение p95, мс | collab ЦП / память | backend ЦП | PostgreSQL ЦП | Цель |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const result of results) {
    const collab = result.collab;
    const collabUsage = result.usage.collab;
    lines.push(
      `| ${result.scenario} | ${result.step} | ${result.participants} | ${ms(result.connect.p95)} | ` +
        `${ms(result.edits.p50)} / ${ms(result.edits.p95)} / ${ms(result.edits.p99)} | ${ms(result.cursors.p95)} | ` +
        `${(result.delivered * 100).toFixed(2)} % | ${result.disconnects} | ${collab ? collab.stores : "—"} | ` +
        `${ms(collab?.storeP95 ?? null)} | ` +
        `${collabUsage ? `${percent(collabUsage.cpuMean)} (пик ${percent(collabUsage.cpuPeak)})` : percent(collab?.cpu ?? undefined)} / ` +
        `${mib(collabUsage?.memoryPeak ?? collab?.memory)} | ${percent(result.usage.backend?.cpuMean)} | ` +
        `${percent(result.usage.postgres?.cpuMean)} | ${keepsTarget(result, slo) ? "да" : "нет"} |`,
    );
  }
  lines.push("");
  for (const scenario of ["boards", "crowd"]) {
    const steps = results.filter((result) => result.scenario === scenario);
    if (steps.length === 0) continue;
    const { kept, broke } = limitOf(steps, slo);
    lines.push(
      `- ${scenario}: цель держится до шага ${kept ? `«${kept.step}» (${kept.participants} участников)` : "— (не держится и на первом)"}` +
        (broke
          ? `, на шаге «${broke.step}» уже нет (p95 правки ${ms(broke.edits.p95)} мс)`
          : ", дальше не проверялось") +
        ".",
    );
  }
  for (const result of results) {
    if (Object.keys(result.notes).length === 0) continue;
    lines.push(
      `- ${result.scenario} «${result.step}»: ${Object.entries(result.notes)
        .map(([key, value]) => `${key} — ${value}`)
        .join("; ")}.`,
    );
  }
  const lagging = results.filter((result) => result.clientEventLoopDelayP99 > 50);
  if (lagging.length > 0) {
    lines.push(
      `- Клиент не успевал на шагах ${lagging.map((result) => `«${result.step}» (${ms(result.clientEventLoopDelayP99)} мс)`).join(", ")}: ` +
        "задержки там включают и его очередь, нужно больше потоков или вторая машина.",
    );
  }
  return lines.join("\n") + "\n";
}
