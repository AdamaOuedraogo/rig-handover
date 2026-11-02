import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  if (!night) throw new Error('fixture missing');
  const row = (job: string) => night.rows.find((r) => r.job === job)!;

  it('yields 5 jobs, counts the 1 bad line, keeps the total', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
    expect(night.lines).toBe(16);
  });

  it('sorts rows by job', () => {
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, last status from the latest line', () => {
    const r = row('fixtures/refresh');
    expect(r.runs).toBe(4);
    expect(r.retries).toBe(3);
    expect(r.lastStatus).toBe('ok');
    expect(r.lastError).toBeNull();
    expect(r.owner).toBe('rook');
  });

  it('keeps the last error of a failed job', () => {
    const r = row('notes/backup');
    expect(r.lastStatus).toBe('fail');
    expect(r.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render').owner).toBeNull();
  });

  it('keeps the offset on first and last time', () => {
    const r = row('lane/sync');
    expect(r.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(r.lastAt).toBe('2026-10-29T05:00:04+01:00');
    expect(r.runs).toBe(8);
    expect(r.retries).toBe(1);
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('returns null for a night name that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../package')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0, lines: 0 });
  });

  it('skips bad lines but renders the rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      [
        'not json',
        '{"at":"2026-01-02T23:00:00+01:00","job":"a","status":"bogus","owner":null}',
        '{"at":"2026-01-02T23:01:00+01:00","job":"a","status":"ok","owner":null}',
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-02');
    expect(night?.badLines).toBe(2);
    expect(night?.lines).toBe(3);
    expect(night?.rows).toEqual([
      { job: 'a', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-01-02T23:01:00+01:00', lastAt: '2026-01-02T23:01:00+01:00' },
    ]);
  });
});
