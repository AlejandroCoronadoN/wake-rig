import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NIGHT_RE, type DigestRow, type Night, type RunLine, type RunStatus } from './types.js';

// Plan morning-digest § 1. Parse at the edge (styleguide): a line is either a RunLine or a bad
// line. Bad lines are counted, never thrown; one bad night must not take the board down.

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// Returns null for anything that is not one well-formed run line.
export function parseLine(text: string): RunLine | null {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(j)) return null;
  const { at, job, status, owner, error } = j;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status as RunStatus)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status: status as RunStatus, owner: typeof owner === 'string' ? owner : null };
  if (error !== undefined) line.error = error;
  return line;
}

// Folds the night's lines into one row per job, sorted by job. File order is the night's order.
export function rowsOf(lines: readonly RunLine[]): DigestRow[] {
  const byJob = new Map<string, DigestRow>();
  for (const l of lines) {
    const row = byJob.get(l.job);
    if (!row) {
      byJob.set(l.job, {
        job: l.job,
        owner: l.owner,
        runs: 1,
        retries: l.status === 'retry' ? 1 : 0,
        lastStatus: l.status,
        lastError: l.error ?? null,
        firstAt: l.at,
        lastAt: l.at,
      });
      continue;
    }
    row.runs += 1;
    if (l.status === 'retry') row.retries += 1;
    row.lastStatus = l.status;
    if (l.error !== undefined) row.lastError = l.error;
    if (l.owner !== null) row.owner = l.owner;
    row.lastAt = l.at;
  }
  return [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

// Reads runs/<night>.jsonl. null when there is no such night (the route answers 404).
// An empty file is a night with no rows ("nothing ran"). A bad night name is no night.
export function readNight(runsDir: string, night: string): Night | null {
  if (!NIGHT_RE.test(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;
  const lines: RunLine[] = [];
  let badLines = 0;
  for (const text of readFileSync(file, 'utf8').split('\n')) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (line) lines.push(line);
    else badLines += 1;
  }
  return { night, rows: rowsOf(lines), badLines };
}
