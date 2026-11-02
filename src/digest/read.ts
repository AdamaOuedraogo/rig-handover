import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

// Parse at the edge: one line of JSONL into a RunLine, or null if it is not one.
export function parseLine(line: string): RunLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || !isStatus(o.status)) return null;
  const owner = typeof o.owner === 'string' ? o.owner : null;
  const parsed: RunLine = { at: o.at, job: o.job, status: o.status, owner };
  if (typeof o.error === 'string') parsed.error = o.error;
  return parsed;
}

// Fold parsed lines into one row per job, sorted by job. Done here, not in the views, so the page
// and the JSON can never disagree (ADR 0001).
export function toRows(lines: RunLine[]): DigestRow[] {
  const byJob = new Map<string, RunLine[]>();
  for (const l of lines) {
    const list = byJob.get(l.job);
    if (list) list.push(l);
    else byJob.set(l.job, [l]);
  }
  const rows: DigestRow[] = [];
  for (const [job, list] of byJob) {
    // Lines arrive chronological; the stable sort by `at` only guards against a shuffled log.
    const sorted = [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    rows.push({
      job,
      owner: sorted.find((l) => l.owner !== null)?.owner ?? null,
      runs: sorted.length,
      retries: sorted.filter((l) => l.status === 'retry').length,
      lastStatus: last.status,
      lastError: last.error ?? null,
      firstAt: first.at,
      lastAt: last.at,
    });
  }
  return rows.sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

// runs/<night>.jsonl -> Night. null = no file for that night (or a name that is not YYYY-MM-DD,
// so a route param can't escape runsDir). Bad lines are counted and skipped, never thrown.
export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const good: RunLine[] = [];
  let badLines = 0;
  let lines = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    lines += 1;
    const parsed = parseLine(line);
    if (parsed) good.push(parsed);
    else badLines += 1;
  }
  return { night, rows: toRows(good), badLines, lines };
};
