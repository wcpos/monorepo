import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const directory = fileURLToPath(new URL('.', import.meta.url));
const files = (await readdir(directory)).filter(n => /^results\..+\.json$/.test(n)).sort();
const reports = (await Promise.all(files.map(async file => ({ file, ...JSON.parse(await readFile(join(directory, file), 'utf8')) }))))
  .filter(r => Array.isArray(r.trials)); // diagnostic files carry `steps`, not scored trials; report them separately below
const escape = x => String(x ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows].map(row => '| ' + row.map(escape).join(' | ') + ' |').join('\n');
const median = values => {
  const numbers = values.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  return numbers.length ? ((numbers[Math.floor((numbers.length - 1) / 2)] + numbers[Math.floor(numbers.length / 2)]) / 2).toFixed(1) : '—';
};
// process-stop records are fresh-process relaunches; older result files predate the driver setting
// recoveredBy, so derive the label from the cell when the field is absent.
const key = t => JSON.stringify([t.row, t.journalMode ?? t.mode ?? 'control', t.cacheSize ?? t.cache ?? '—', t.boundary ?? '—', t.recoveredBy ?? (t.cell === 'process-stop' ? 'process-relaunch' : 'in-page')]);
const output = ['<!-- generated:start -->'];
if (!reports.length) output.push('No browser measurements yet. Filled by `node report.mjs` when `results.*.json` exist.');
for (const report of reports) {
  const { environment: env, trials } = report;
  output.push(`\n## ${escape(env.browser)} — ${report.file}\n`, table(['Environment', 'Value'], Object.entries(env).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v])));
  if (report.fatal) output.push(`\n**Incomplete run:** ${escape(JSON.stringify(report.fatal))}`);
  for (const skip of report.skips ?? []) output.push(`\nNot run: ${escape(skip.cell)} — ${escape(skip.reason)}`);
  for (const cell of [...new Set(trials.map(t => t.cell))]) {
    output.push(`\n### ${cell}\n`);
    const cells = trials.filter(t => t.cell === cell);
    if (cell === 'handle-ceiling') {
      output.push(table(['Trial', 'Count', 'Exception / ceiling', 'Outcome'], cells.map(t => [t.trial ?? 1, t.count, t.exception ? JSON.stringify(t.exception) : t.ceiling ?? JSON.stringify(t.error), t.outcome]))); continue;
    }
    if (cell === 'terminate-latency') {
      output.push(table(['Worker state', 'Last increment after terminate() ms', 'Increments after terminate()', 'Outcome'], cells.map(t => [t.kind, t.terminateLatencyMs?.toFixed(1), t.incrementsAfterTerminate, t.outcome]))); continue;
    }
    if (cell === 'quota-exhaustion') {
      output.push(table(['Mode', 'Trial', 'SQLite code', 'Statement / message', 'DOM error / numeric write return', 'Reopen outcome'], cells.map(t => [t.mode, t.trial, t.quotaFailure?.resultCode,
        [t.quotaFailure?.statement, t.quotaFailure?.message ?? t.error?.message].filter(Boolean).join(': '), JSON.stringify(t.quotaFailure?.hookFailures ?? []), t.outcome]))); continue;
    }
    const groups = new Map();
    for (const trial of cells.filter(t => t.outcome !== 'invalid-setup')) { const k = key(trial); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(trial); }
    output.push(table(['Row', 'Journal', 'Cache', 'Boundary', 'Recovery', 'Trials', 'ok', 'ok-with-inflight-present', 'ok-with-inflight-absent', 'lost', 'partial', 'integrity-failed', 'open-failed', 'open-failed reason', 'Median reopen attempts', 'Median reacquire ms', 'Median reopen ms'],
      [...groups].map(([k, group]) => [...JSON.parse(k), group.length, group.filter(t => t.outcome === 'ok').length,
        group.filter(t => t.outcome === 'ok' && t.inflightPresent === true).length, group.filter(t => t.outcome === 'ok' && t.inflightPresent === false).length,
        ...['lost', 'partial', 'integrity-failed', 'open-failed'].map(outcome => group.filter(t => t.outcome === outcome).length),
        [...new Set(group.filter(t => t.outcome === 'open-failed').map(t => t.error?.resultCode ? `${t.error.message.split(':')[0]} (${t.error.resultCode})` : t.error?.name ?? '?'))].join('; ') || '—',
        median(group.map(t => t.reopenAttempts)), median(group.map(t => t.reacquireMs)), median(group.map(t => t.reopenMs))])));
    if (cell === 'pool-exhaustion') output.push('\n' + table(['Trial', 'Opened DBs', 'Clean CANTOPEN + pool-full message', 'addCapacity recovered', 'Error'], cells.map(t => [t.trial, t.openedDatabases, t.cleanFailure, t.capacityRecovered, JSON.stringify(t.failure ?? t.error)])));
  }
}
output.push('\n## Cross-browser stop summary\n');
const rate = (trials, cell) => { const list = trials.filter(t => t.cell === cell), ok = list.filter(t => t.outcome === 'ok').length; return list.length ? `${ok}/${list.length} (${(100 * ok / list.length).toFixed(1)}%)` : 'not measured'; };
output.push(table(['Browser / source', 'Row', 'Journal', 'Process-stop pass rate', 'Random-stop pass rate'], reports.flatMap(r => ['WAL', 'DELETE', null].map(mode => {
  const row = mode ? 'sqlite-sahpool' : 'opfs-shipped', group = r.trials.filter(t => t.row === row && (t.mode ?? null) === mode);
  return [`${r.environment.browser} / ${r.file}`, row, mode ?? 'control', rate(group, 'process-stop'), rate(group, 'random-stop')];
}))));
output.push('<!-- generated:end -->');
const diagFiles = files.filter(f => !reports.some(r => r.file === f));
if (diagFiles.length) { output.splice(output.indexOf('<!-- generated:end -->'), 0, '\n## Diagnostic traces (not scored)\n', ...diagFiles.map(f => `- \`${f}\` — step-by-step trace; open the JSON directly.`)); }
const path = join(directory, 'RESULTS.md'), before = await readFile(path, 'utf8');
if (!/<!-- generated:start -->[\s\S]*<!-- generated:end -->/.test(before)) throw new Error('RESULTS.md generated markers missing');
await writeFile(path, before.replace(/<!-- generated:start -->[\s\S]*<!-- generated:end -->/, output.join('\n')));
console.info(`Wrote ${path} from ${reports.length} results file(s)`);
