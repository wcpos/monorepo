import { readdir, readFile, writeFile } from 'node:fs/promises';
const directory = new URL('.', import.meta.url), files = (await readdir(directory)).sort();
const benchmarks = [], crashes = [], lines = [];
for (const file of files) {
  if (/^results\..+\.json$/.test(file)) benchmarks.push({ file, ...JSON.parse(await readFile(new URL(file, directory), 'utf8')) });
  if (/^crash\..+\.json$/.test(file)) crashes.push({ file, ...JSON.parse(await readFile(new URL(file, directory), 'utf8')) });
}
const engines = ['filesystem-node', 'sqlite-node'];
const escape = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (head, rows) => [head, head.map(() => '---'), ...rows].map(r => '| ' + r.map(escape).join(' | ') + ' |').join('\n');
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';
const median = values => {
  const sorted = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null;
};
const label = name => name === 'products-catalogue-projection' ? `${name} — projection (condition ii)` : name;
lines.push('## Leg 1');
const summary = new URL('conformance/node-conformance-summary.log', directory);
try {
  const log = await readFile(summary, 'utf8');
  lines.push('```text\n' + log.trimEnd() + '\n```');
  if (!/spike-2210 runtime: electron=43\.4\.0 node=.* journal_mode=wal/.test(log)) lines.push('**Not qualifying leg 1 evidence: required Electron runtime/WAL line missing.**');
  if (/Node suite exit code: [1-9]/.test(log)) lines.push('**Leg 1 failed: selects better-sqlite3 per the brief.**');
} catch (error) { if (error.code !== 'ENOENT') throw error; lines.push('Not run. Operator must run the Electron-Node suite.'); }
for (const platform of [...new Set([...benchmarks, ...crashes].map(r => r.environment.platform))]) {
  lines.push(`\n## ${platform}`);
  for (const report of benchmarks.filter(r => r.environment.platform === platform)) {
    lines.push(`### Leg 3 — ${report.file}`, table(['Environment', 'Value'], Object.entries(report.environment).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v])), report.equality);
    for (const scale of ['small', 'large']) {
      const rows = report.results.filter(r => r.scale === scale);
      if (!rows.length) continue;
      const names = [...new Set(rows.flatMap(r => r.cells.map(c => c.name)))];
      lines.push(`#### ${scale}`, table(['Cell (p50 / p95 ms)', ...engines, 'filesystem-node ÷ sqlite-node (p50)'], names.map(name => {
        const cells = engines.map(engine => rows.find(r => r.engine === engine)?.cells.find(c => c.name === name));
        const flag = c => c?.unsortedSamples ? ` ⚠ ${c.unsortedSamples}/${c.samples.length + 1} unsorted` : '';
        return [label(name) + (cells.some(c => c?.orderMismatch) ? ' (returned order differed)' : ''), ...cells.map(c => c ? `${number(c.p50)} / ${number(c.p95)}${flag(c)}` : '—'), cells.every(Boolean) ? number(cells[0].p50 / cells[1].p50) : '—'];
      })));
      for (const row of rows) {
        lines.push(`- ${row.engine}: WAL proof ${row.wal ?? 'not applicable'}; mean seed JSON bytes ${JSON.stringify(row.seedBytes)}.`);
        if (row.disk) lines.push(`- ${row.engine} disk-bytes after large seed: ${row.disk.bytes}; files: ${row.disk.files}.`);
        const cold = row.cells.find(c => c.name === 'cold-open-first-read');
        if (cold) lines.push(`- ${row.engine} cold-open-first-read: ${number(cold.p50)} / ${number(cold.p95)} ms; N=${cold.samples.length}, fresh Node processes, warm OS page cache.`);
      }
    }
  }
  for (const report of crashes.filter(r => r.environment.platform === platform)) {
    lines.push(`### Leg 2 — ${report.file}`, table(['Environment', 'Value'], Object.entries(report.environment)),
      report.complete ? `Complete: ${report.requestedTrials} trials requested per selected row.` : `**Incomplete run:** ${report.fatal ?? 'run interrupted'}`);
    lines.push(table(['Row', 'Trials', 'ok', 'open-failed', 'integrity-failed', 'lost', 'partial', 'Repaired on reopen', 'Ledger lost / partial', 'In-flight present', 'In-flight absent', 'In-flight partial / none / unknown', 'Median reopen ms'], engines.map(row => {
      const group = report.trials.filter(t => t.row === row);
      return [row, group.length, ...['ok', 'open-failed', 'integrity-failed', 'lost', 'partial'].map(o => group.filter(t => t.outcome === o).length),
        group.filter(t => t.repairs > 0).length, ['lost', 'partial'].map(o => group.filter(t => t.ledger === o).length).join(' / '),
        ...['present', 'absent'].map(p => group.filter(t => t.inflightPresence === p).length),
        ['partial', 'none', 'unknown'].map(p => group.filter(t => t.inflightPresence === p).length).join(' / '), number(median(group.map(t => t.reopenMs)))];
    })));
  }
}
lines.push('\n## Cross-platform summary', 'Lowest p50, descriptive only; Windows decides when Mac and Windows disagree (map ruling 2026-09-18).');
const keys = [...new Set(benchmarks.flatMap(r => r.results.flatMap(row => row.cells.map(c => `${row.scale}/${c.name}`))))];
function winner(report, key) {
  const [scale, name] = key.split('/');
  const cells = engines.map(engine => report.results.find(r => r.engine === engine && r.scale === scale)?.cells.find(c => c.name === name));
  if (!cells.every(Boolean)) return 'not compared';
  return cells[0].p50 === cells[1].p50 ? 'tie' : engines[Number(cells[1].p50 < cells[0].p50)];
}
lines.push(table(['Scale / cell', 'Mac winner (source)', 'Windows winner (source)', 'straddles'], keys.map(key => {
  const groups = ['mac', 'windows'].map(platform => benchmarks.filter(r => r.environment.platform === platform).map(r => ({ file: r.file, winner: winner(r, key) })));
  const comparable = groups.map(g => g.map(v => v.winner).filter(w => engines.includes(w)));
  const straddles = comparable.every(g => g.length) ? (comparable[0].some(w => comparable[1].some(v => v !== w)) ? 'yes' : 'no') : 'not evaluated';
  return [key, ...groups.map(g => g.map(v => `${v.winner} (${v.file})`).join('; ') || 'not measured'), straddles];
})));
if (!benchmarks.length && !crashes.length) lines.push('No measurements yet — filled by `node report.mjs` after operator runs.');
const target = new URL('RESULTS.md', directory), before = await readFile(target, 'utf8');
if (!/<!-- generated:start -->[\s\S]*?<!-- generated:end -->/.test(before)) throw new Error('Missing generated markers');
await writeFile(target, before.replace(/<!-- generated:start -->[\s\S]*?<!-- generated:end -->/, `<!-- generated:start -->\n${lines.join('\n\n')}\n<!-- generated:end -->`));
console.info(`Wrote RESULTS.md from ${benchmarks.length} benchmark and ${crashes.length} crash files.`);
