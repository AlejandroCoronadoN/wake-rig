// Plan morning-digest § 1. The shape every part of section 2 reads. Committed first, on its own,
// so the page, the JSON, the board link and the tests can start against it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing. `error` only on retry / fail lines.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row of the digest: one job, over the whole night.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as "—", never dropped (styleguide)
  runs: number; // lines for this job
  retries: number; // lines with status "retry"
  lastStatus: RunStatus; // status of the job's last line
  lastError: string | null; // error of the job's last line that carried one
  firstAt: string; // as written in the log, offset kept, never converted
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse: counted, never thrown
};

// Nights are files named YYYY-MM-DD.jsonl. The board lists only these; the routes accept only these.
export const NIGHT_RE = /^\d{4}-\d{2}-\d{2}$/;

// Reads runs/<night>.jsonl. null when the night has no file (the route answers 404).
// An empty file is a Night with no rows ("nothing ran").
export type ReadNight = (runsDir: string, night: string) => Night | null;
