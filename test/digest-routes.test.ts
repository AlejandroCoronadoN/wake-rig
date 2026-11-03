import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

// Plan morning-digest § 2d. Route tests for the page (2a) and the JSON (2b), through app.request().
// runs/ is read-only (AGENTS.md), so every night here is written into a temp dir.
let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  // a good night: two jobs, one of them retried then ok
  writeFileSync(
    join(dir, '2026-03-01.jsonl'),
    [
      '{"at":"2026-03-01T01:00:00+01:00","job":"a/one","status":"ok","owner":"rook"}',
      '{"at":"2026-03-01T01:01:00+01:00","job":"b/two","status":"retry","owner":null,"error":"flaky"}',
      '{"at":"2026-03-01T01:02:00+01:00","job":"b/two","status":"ok","owner":null}',
    ].join('\n'),
  );
  writeFileSync(join(dir, '2026-03-02.jsonl'), ''); // empty night
  writeFileSync(
    join(dir, '2026-03-03.jsonl'),
    ['{"at":"2026-03-03T01:00:00+01:00","job":"a/one","status":"ok","owner":"x"}', 'not json'].join('\n'),
  );
  const config: RigConfig = { adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: dir };
  app = createApp(config);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('GET /digest/:night (the page)', () => {
  it('200 and renders the rows for a night with a file', async () => {
    const res = await app.request('/digest/2026-03-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/one');
    expect(html).toContain('b/two');
    expect(html).toContain('digest · 2026-03-01');
  });
  it('404 for a night with no file', async () => {
    expect((await app.request('/digest/2026-03-09')).status).toBe(404);
  });
  it('renders "nothing ran" for an empty night', async () => {
    const html = await (await app.request('/digest/2026-03-02')).text();
    expect(html).toContain('nothing ran');
  });
  it('still renders a night with a bad line, and counts it', async () => {
    const res = await app.request('/digest/2026-03-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/one');
    expect(html).toMatch(/1 line/);
  });
});

describe('GET /api/digest/:night (the JSON)', () => {
  it('200 with the same rows as the page, sorted by job', async () => {
    const res = await app.request('/api/digest/2026-03-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.rows.map((r) => r.job)).toEqual(['a/one', 'b/two']);
    expect(body.badLines).toBe(0);
  });
  it('404 JSON for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-03-09');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'no such night' });
  });
  it('empty night is 200 with no rows', async () => {
    const body = (await (await app.request('/api/digest/2026-03-02')).json()) as { rows: unknown[] };
    expect(body.rows).toEqual([]);
  });
  it('counts a bad line instead of throwing', async () => {
    const body = (await (await app.request('/api/digest/2026-03-03')).json()) as { badLines: number };
    expect(body.badLines).toBe(1);
  });
});
