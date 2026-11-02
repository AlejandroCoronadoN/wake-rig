import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseLine, readNight } from '../src/digest/read.js';

// runs/ is read-only (AGENTS.md). Hand-made nights go to a temp dir.
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on the real fixture', () => {
  it('reads runs/2026-10-28.jsonl into 5 jobs and counts 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.badLines).toBe(1);
  });

  it('folds retries, last status, last error and keeps the log offset', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const refresh = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', owner: 'rook' });
    expect(refresh.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh.lastAt).toBe('2026-10-29T01:37:00+01:00');
    const backup = rows.find((r) => r.job === 'notes/backup')!;
    expect(backup).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
    const render = rows.find((r) => r.job === 'digest/render')!;
    expect(render.owner).toBeNull();
  });
});

describe('readNight on hand-made nights', () => {
  it('returns null for a night with no file, and for a name that is not a night', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
    expect(readNight(tmp, '../runs/2026-10-28')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    writeFileSync(join(tmp, '2026-02-01.jsonl'), '');
    expect(readNight(tmp, '2026-02-01')).toEqual({ night: '2026-02-01', rows: [], badLines: 0 });
  });

  it('counts bad lines instead of throwing, whatever is wrong with them', () => {
    writeFileSync(
      join(tmp, '2026-02-02.jsonl'),
      [
        '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        'not json',
        '{"at":"2026-02-02T01:01:00+01:00","job":"a","status":"ok","owner":7}',
        '{"at":"soon","job":"a","status":"ok"}',
        '{"at":"2026-02-02T01:02:00+01:00","job":"a","status":"maybe"}',
        '[]',
        '',
      ].join('\n'),
    );
    const night = readNight(tmp, '2026-02-02')!;
    expect(night.badLines).toBe(5);
    expect(night.rows).toHaveLength(1);
    expect(night.rows[0]).toMatchObject({ job: 'a', runs: 1, owner: 'x' });
  });

  it('keeps a row whose owner is null', () => {
    expect(parseLine('{"at":"2026-02-02T01:00:00+01:00","job":"b","status":"fail","owner":null,"error":"e"}')).toEqual({
      at: '2026-02-02T01:00:00+01:00',
      job: 'b',
      status: 'fail',
      owner: null,
      error: 'e',
    });
  });
});
