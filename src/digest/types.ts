// Types for the morning digest (plan.md § 1). Section 2 builds against these.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of runs/<night>.jsonl. Times stay as the log wrote them (offset kept).
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. `owner` null renders as `—`; `lastError` is the error of the latest line, or null.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// A night read from disk. `rows` sorted by job; `badLines` = lines that did not parse (skipped,
// never thrown); `lines` = non-empty lines seen, good and bad.
export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  lines: number;
};

// Read runs/<night>.jsonl under `runsDir`. Returns null when there is no file for that night
// (or the night name is not YYYY-MM-DD); an empty file is a Night with `rows: []`, so a route can
// tell "no file" (404) from "nothing ran" apart.
export type ReadNight = (runsDir: string, night: string) => Night | null;
