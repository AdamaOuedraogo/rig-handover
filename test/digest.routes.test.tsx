import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

let dir: string;
let app: ReturnType<typeof createApp>;

// First cell of every body row of the digest table, in page order.
const tableJobs = (html: string) => [...html.matchAll(/<tr[^>]*>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1]);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  const lines = [
    '{"at":"2026-11-01T23:00:02+01:00","job":"alpha/sync","status":"retry","owner":"rook"}',
    '{"at":"2026-11-01T23:05:02+01:00","job":"alpha/sync","status":"ok","owner":"rook"}',
    '{"at":"2026-11-01T23:10:02+01:00","job":"beta/backup","status":"fail","owner":null,"error":"disk full on /mnt"}',
    '{"at":"2026-11-01T23:15:0',
  ];
  writeFileSync(join(dir, '2026-11-01.jsonl'), lines.join('\n') + '\n');
  writeFileSync(join(dir, '2026-11-02.jsonl'), '');
  app = createApp({ ...base, runsDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders a night with jobs, the error and the bad-line note', async () => {
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/sync');
    expect(html).toContain('beta/backup');
    expect(html).toContain('disk full on /mnt');
    expect(html).toContain('1 line did not parse');
  });

  it('404s for a night with no file', async () => {
    expect((await app.request('/digest/2026-12-31')).status).toBe(404);
  });

  it('says "nothing ran" for an empty file', async () => {
    const res = await app.request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('404s for a bad night name', async () => {
    expect((await app.request('/digest/not-a-night')).status).toBe(404);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON, rows in the same order as the page', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(['alpha/sync', 'beta/backup']);
    expect(body.badLines).toBe(1);
    expect(tableJobs(await (await app.request('/digest/2026-11-01')).text())).toEqual(jobs);
  });

  it('404s for a night with no file', async () => {
    expect((await app.request('/api/digest/2026-12-31')).status).toBe(404);
  });

  it('returns empty rows for an empty file', async () => {
    const res = await app.request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[] };
    expect(body.rows).toEqual([]);
  });
});

describe('page and JSON agree on the real night', () => {
  it('runs/2026-10-28: 5 jobs, 1 bad line, same order', async () => {
    const real = createApp({ ...base, runsDir: 'runs' });
    const body = (await (await real.request('/api/digest/2026-10-28')).json()) as {
      rows: { job: string }[];
      badLines: number;
    };
    expect(body.rows).toHaveLength(5);
    expect(body.badLines).toBe(1);
    const html = await (await real.request('/digest/2026-10-28')).text();
    expect(tableJobs(html)).toEqual(body.rows.map((r) => r.job));
  });
});
