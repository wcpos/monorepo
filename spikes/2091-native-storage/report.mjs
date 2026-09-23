import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const ENGINES = ['expo-filesystem-js', 'worklet-filesystem', 'expo-sqlite'];
const SMALL_RESULT = 100, ID_DIFF_LIMIT = 200, DOC_DIFF_LIMIT = 50; // 2210's bounded diagnostic records.
const escape = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (head, rows) => [head, head.map(() => '---'), ...rows].map(r => '| ' + r.map(escape).join(' | ') + ' |').join('\n');
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';
const median = values => {
  const sorted = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null;
};
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
}
export function compare(report) {
  const expected = new Map(), mismatches = [];
  for (const row of report.results.filter(r => r.outcome !== 'harness-failed')) for (const cell of row.cells ?? []) {
    Object.assign(cell, stats(cell.samples.map(s => s.ms)));
    const key = `${row.scale}/${cell.name}`;
    if (!cell.signatures) { if (cell.contentMismatch) mismatches.push(`${row.engine}/${key}`); continue; }
    const prior = expected.get(key);
    if (!prior) { expected.set(key, cell); continue; }
    cell.contentMismatch = cell.setSignatures.length !== prior.setSignatures.length || cell.setSignatures.some((s, i) => s !== prior.setSignatures[i]);
    cell.orderMismatch = !cell.contentMismatch && cell.signatures.some((s, i) => s !== prior.signatures[i]);
    if (!cell.contentMismatch) continue;
    mismatches.push(`${row.engine}/${key}`);
    const i = cell.setSignatures.findIndex((s, j) => s !== prior.setSignatures[j]);
    // Saved runs retain signatures, not full IDs. Keep existing diagnostics when regenerating.
    if (!cell.idSets || !prior.idSets) {
      cell.mismatch ??= { sample: i, detail: 'IDs/hashes omitted; content signatures differ' };
      continue;
    }
    const here = cell.idSets[i] ?? [], there = prior.idSets[i] ?? [];
    if (here.length <= SMALL_RESULT && there.length <= SMALL_RESULT) cell.mismatch = { sample: i, ids: here, priorIds: there };
    else { const a = new Set(here), b = new Set(there); cell.mismatch = { sample: i, rows: here.length, priorRows: there.length,
      onlyHere: here.filter(x => !b.has(x)).slice(0, ID_DIFF_LIMIT), onlyPrior: there.filter(x => !a.has(x)).slice(0, ID_DIFF_LIMIT) }; }
    const hs = new Map(cell.docHashes?.[i] ?? []), ps = new Map(prior.docHashes?.[i] ?? []);
    cell.mismatch.differingDocs = [...hs].filter(([id, h]) => ps.has(id) && ps.get(id) !== h).map(([id]) => id).slice(0, DOC_DIFF_LIMIT);
  }
  return mismatches;
}
// Compare before stripping bulky evidence; signatures permit comparison after every partial save.
export function compactBench(report) {
  compare(report);
  return { ...report, results: report.results.map(row => row.outcome === 'harness-failed' ? row : ({ ...row,
    cells: row.cells.map(({ idSets, docHashes, ...cell }) => cell),
  })) };
}
export function winner(report, key) {
  const [scale, name] = key.split('/');
  const cells = ENGINES.map(engine => report.results.find(r => r.engine === engine && r.scale === scale && r.outcome !== 'harness-failed')?.cells?.find(c => c.name === name));
  if (!cells.every(c => c && Number.isFinite(c.p50)) || cells.some(c => c.contentMismatch)) return 'not compared';
  const min = Math.min(...cells.map(c => c.p50)), wins = ENGINES.filter((_, i) => cells[i].p50 === min);
  return wins.length === 1 ? wins[0] : 'tie';
}
export async function main(directory = new URL('.', import.meta.url)) {
  const files = (await readdir(new URL('results/', directory))).sort(), reports = [], lines = [];
  let failed = false;
  for (const file of files.filter(f => /^(results|crash|smoke)\..+\.json$/.test(f))) {
    const path = new URL(`results/${file}`, directory), data = JSON.parse(await readFile(path, 'utf8'));
    if (file.startsWith('results.')) {
      const mismatches = compare(data); failed ||= mismatches.length > 0;
      data.equality = mismatches.length ? `CONTENT MISMATCH: ${mismatches.join(', ')} — not comparable`
        : data.results.length && ENGINES.every(e => data.results.some(r => r.engine === e && r.outcome !== 'harness-failed'))
          ? 'All available cross-row cells match on canonical revision-independent SHA-256 content; returned-order differences and normalized-sort violations recorded separately.'
          : 'Cross-row equality not fully evaluated: missing rows.';
      await writeFile(path, JSON.stringify(compactBench(data), null, 2) + '\n');
    }
    reports.push({ file, ...data });
  }
  lines.push('The RxDB mocha suite was not run on device: it is not hosted by React Native. Leg 1 is the eight-scenario binding smoke, three divergence probes, and leg 3 content checks.\n\nAndroid stops use ActivityManager `am force-stop` (no lifecycle callbacks), not a direct POSIX signal. Cold opens restart the app; OS page cache remains warm. Simulator timer samples reflect display-link cadence and are not meaningful JS-lag evidence.');
  const keys = [...new Set(reports.map(r => `${r.environment.platform}/${r.environment.device}`))];
  for (const key of keys) {
    const group = reports.filter(r => `${r.environment.platform}/${r.environment.device}` === key), env = group[0].environment;
    lines.push(`## ${key}${env.simulator ? ' — simulator — not evidence' : ''}`,
      table(['Environment', 'Value'], Object.entries(env).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v])));
    for (const r of group) {
      lines.push(`### ${r.file}`, r.complete ? 'Run complete.' : `**Incomplete:** ${r.fatal ?? 'interrupted'}`);
      for (const row of r.results ?? []) if (row.outcome === 'harness-failed') lines.push(`- ${row.engine} ${row.scale ?? ''}: harness-failed — ${escape(row.error)}`);
      if (r.file.startsWith('smoke.')) {
        const bench = group.find(x => x.file.startsWith('results.'));
        lines.push(table(['Row', 'Scenarios', 'Smoke/probe divergences', 'Leg 3 content mismatches', 'Total divergences'], ENGINES.map(engine => {
          const scenarios = r.results.find(x => x.engine === engine)?.scenarios;
          const rows = bench?.results.filter(x => x.engine === engine);
          const measured = rows?.length && rows.every(x => x.cells?.length) && bench.results.every(other =>
            rows.some(row => row.scale === other.scale && other.outcome !== 'harness-failed' && (other.cells ?? []).every(cell => row.cells.some(c => c.name === cell.name))));
          const mismatch = measured ? rows.flatMap(x => x.cells).filter(c => c.contentMismatch).length : undefined;
          const count = scenarios?.filter(s => !s.pass).length;
          return [engine, scenarios?.length ?? 'not run', count ?? 'not run', mismatch ?? 'not run', count === undefined || mismatch === undefined ? 'not evaluated' : count + mismatch];
        })));
        for (const row of r.results) for (const scenario of (row.scenarios ?? []).filter(s => !s.pass)) lines.push(`- ${row.engine} / ${scenario.name}: ${scenario.detail}`);
      }
      if (r.file.startsWith('crash.')) {
        const outcomes = ['ok', 'open-failed', 'integrity-failed', 'lost', 'partial'];
        if (r.trials.some(t => t.outcome === 'harness-failed')) outcomes.push('harness-failed');
        lines.push(table(['Row', 'Trials', 'Acked tx / rows', ...outcomes, 'Repaired on reopen', 'Ledger lost / partial', 'In-flight present / absent', 'In-flight partial / none / unknown', 'Median reopen ms'], ENGINES.map(row => {
          const ts = r.trials.filter(t => t.row === row);
          return [row, ts.length, `${ts.reduce((n, t) => n + t.ackedCount, 0)} / ${ts.flatMap(t => t.acked).reduce((n, t) => n + t.n, 0)}`, ...outcomes.map(o => ts.filter(t => t.outcome === o).length),
            ts.filter(t => t.repairs > 0).length, ['lost','partial'].map(o => ts.filter(t => t.ledger === o).length).join(' / '),
            ['present','absent'].map(p => ts.filter(t => t.inflightPresence === p).length).join(' / '),
            ['partial','none','unknown'].map(p => ts.filter(t => t.inflightPresence === p).length).join(' / '), number(median(ts.map(t => t.reopenMs)))];
        })));
      }
      if (r.file.startsWith('results.')) {
        lines.push(r.equality);
        for (const scale of ['small', 'large']) {
          const rows = r.results.filter(x => x.scale === scale && x.outcome !== 'harness-failed'), names = [...new Set(rows.flatMap(x => x.cells.map(c => c.name)))];
          if (!rows.length) continue;
          lines.push(`#### ${scale}`, table(['Cell — p50 / p95 ms', ...ENGINES, 'expo-filesystem-js ÷ expo-sqlite', 'worklet-filesystem ÷ expo-sqlite'], names.map(name => {
            const cells = ENGINES.map(engine => rows.find(x => x.engine === engine)?.cells.find(c => c.name === name));
            const mismatch = cells.some(c => c?.contentMismatch), comparable = cells.every(Boolean) && !mismatch;
            return [name + (mismatch ? ' CONTENT MISMATCH — not comparable' : cells.some(c => c?.orderMismatch) ? ' (returned order differs)' : ''),
              ...cells.map(c => c ? `${number(c.p50)} / ${number(c.p95)}${c.unsortedSamples ? `; ${c.unsortedSamples} unsorted` : ''}` : '—'),
              ...[0, 1].map(i => comparable ? number(cells[i].p50 / cells[2].p50) : '—')];
          })));
          for (const row of rows) {
            if (row.seedMs) lines.push(`- ${row.engine} seed wall-clock ms: products ${number(row.seedMs.products)}; orders ${number(row.seedMs.orders)} (whole collection, including progress delivery; not compared).`);
            lines.push(`- ${row.engine}: WAL ${row.wal ?? 'n/a'}; seed bytes ${JSON.stringify(row.seedBytes)}; BEGIN retries ${row.beginRetries ?? 'not captured'}.`);
            for (const field of ['disk','lag','heapAfterSeed','heapAfterLast','memory']) if (row[field]) lines.push(`- ${row.engine} ${field}: ${JSON.stringify(row[field])}`);
            if (row.ingest?.length) lines.push(`- ${row.engine} ingest-100 p50 / p95 / max ms: ${Object.values(stats(row.ingest)).map(number).join(' / ')}; ${row.ingest.length} batches in a second fresh seed (original seed uses 1000).`);
          }
        }
      }
    }
  }
  const benchmarks = reports.filter(r => r.file.startsWith('results.'));
  const cells = [...new Set(benchmarks.flatMap(r => r.results.filter(row => row.outcome !== 'harness-failed').flatMap(row => (row.cells ?? []).map(c => `${row.scale}/${c.name}`))))];
  lines.push('## Cross-device summary', 'Lowest p50, descriptive only. Simulator files are listed for harness verification, not the platform decision.',
    table(['Scale / cell', ...benchmarks.map(r => `${r.environment.platform}/${r.environment.device}${r.environment.simulator ? ' — simulator — not evidence' : ''}`)], cells.map(key => [key, ...benchmarks.map(r => winner(r, key))])));
  if (!reports.length) lines.push('No measurements available.');
  const target = new URL('RESULTS.md', directory), before = await readFile(target, 'utf8');
  if (!/<!-- generated:start -->[\s\S]*?<!-- generated:end -->/.test(before)) throw new Error('Missing generated markers');
  await writeFile(target, before.replace(/<!-- generated:start -->[\s\S]*?<!-- generated:end -->/, `<!-- generated:start -->\n${lines.join('\n\n')}\n<!-- generated:end -->`));
  console.info(`Wrote RESULTS.md from ${reports.length} files; content mismatch=${failed}`);
  return failed ? 1 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
