/**
 * Check a store-submissions/<version>.txt for "Where's the Damn Download?"
 * before it is pasted into either dashboard.
 *
 *   node .claude/skills/release/check-fields.mjs store-submissions/1.0.0.txt
 *
 * Three failures it catches:
 *
 * 1. Over cap. The caps are not the same on the two stores and the bigger one
 *    sets the wrong expectation: Chrome's Description takes 16000, AMO's takes
 *    15000, and AMO's Release Notes and Notes to Reviewer stop at 3000 each.
 *    approval_notes is a Django TextField with max_length - enforced in the
 *    form, not in the database - so over-length text has gone in silently
 *    rather than being refused. Count before pasting.
 * 2. A stated count that no longer matches the text under it, which is how a
 *    field gets edited and quietly pushed over its cap.
 * 3. Hard-wrapped prose. Both dashboards wrap for themselves, and a pre-wrapped
 *    paste keeps its breaks in the published listing, at the wrong width for
 *    whoever is reading it.
 *
 * The cap comes from each field's own header line, so this needs no table to
 * keep in sync. Header format:
 *
 *   FIELD 1 of 4 - Single purpose description   920 chars, cap 1000  UNCHANGED
 *
 * Exits non-zero on any problem, so it can gate the release commit.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: check-fields.mjs <store-submissions/x.y.z.txt>');
  process.exit(2);
}

const lines = readFileSync(file, 'utf8').split(/\r?\n/);
const isRule = (l) => /^-{20,}$/.test(l);
const isHeading = (l) => /^[A-Z][A-Za-z ']*$/.test(l.trim()) && l.trim().split(' ').length < 4;

let problems = 0;
const fail = (msg) => {
  problems += 1;
  console.log(`  ${msg}`);
};

for (let i = 0; i < lines.length; i += 1) {
  const head = lines[i].match(
    /^FIELD (\d) of (\d) - (.+?)\s{2,}(?:(\d[\d,]*) chars, )?cap (\d+)\s+(CHANGED|UNCHANGED)\s*$/
  );
  if (!head) continue;
  const [, n, of, name, claimed, cap] = head;

  let start = i + 1;
  while (start < lines.length && !isRule(lines[start])) start += 1;
  start += 1;
  let end = start;
  while (end < lines.length && !isRule(lines[end]) && !/^\(/.test(lines[end])) end += 1;

  const body = lines.slice(start, end).join('\n').trim();
  const label = `${n}/${of} ${name}`;
  console.log(`${label.padEnd(38)} ${String(body.length).padStart(5)} / cap ${cap}`);

  if (body.length > Number(cap)) fail(`OVER CAP by ${body.length - Number(cap)}`);
  if (claimed && Number(claimed.replace(/,/g, '')) !== body.length) {
    fail(`says ${claimed} chars, actually ${body.length}`);
  }
  if (!claimed) fail('no character count stated');

  // A wrapped paragraph is two non-blank lines where the second continues the
  // first: not a new bullet, not a heading of its own.
  for (let j = start + 1; j < end; j += 1) {
    const prev = lines[j - 1];
    const cur = lines[j];
    if (!cur.trim() || !prev.trim()) continue;
    if (/^- /.test(cur) || isHeading(cur) || isHeading(prev)) continue;
    fail(`line ${j + 1} is wrapped: "${cur.slice(0, 50)}..."`);
  }
}

console.log(problems ? `\n${problems} problem(s)` : '\nall fields counted, under cap, unwrapped');
process.exit(problems ? 1 : 0);
