import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './digest/read.js';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

export type NightSummary = { night: string; ok: number; retry: number; fail: number };

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// Counts per parsed line of the night's log. Bad lines are ignored here; the digest page shows them.
export function nightCounts(runsDir: string, night: string): { ok: number; retry: number; fail: number } {
  const counts = { ok: 0, retry: 0, fail: 0 };
  let text = '';
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return counts;
  }
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const parsed = parseLine(line);
    if (parsed) counts[parsed.status] += 1;
  }
  return counts;
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => ({ night: n, ...nightCounts(config.runsDir, n) })),
  };
}
