import { readdir, readFile, writeFile } from 'node:fs/promises';
const directory = new URL('.', import.meta.url), target = new URL('RESULTS.md', directory), reports = [];
for (const file of (await readdir(directory)).filter(n => /^results\..+\.json$/.test(n)).sort()) reports.push({ browser: file.slice(8, -5), ...JSON.parse(await readFile(new URL(file, directory))) });
const engines = ['opfs-shipped', 'sqlite-sahpool', 'indexeddb-premium'], lines = [], format = n => n.toFixed(2);
const measuredAt = JSON.stringify(reports.map(r => [r.browser, r.environment.measuredAt]));
for (const report of reports) {
  const e = report.environment;
  lines.push(`## ${report.browser}`, `Browser: ${e.browserVersion}; OS: ${e.os}; CPU: ${e.cpu}; Node: ${e.node}; measuredAt: ${e.measuredAt}.`, `Versions: ${JSON.stringify(e.versions)}.`, `Bundle bytes on disk: ${JSON.stringify(report.bundleBytes)}.`, report.equality, '');
  for (const scale of ['small', 'large']) {
    const rows = report.results.filter(r => r.scale === scale);
    if (!rows.length) continue;
    lines.push(`### ${scale}`, `| Cell (p50 / p95 ms) | ${engines.join(' | ')} |`, '|---|---|---|---|');
    for (const name of rows[0].cells.map(c => c.name)) lines.push(`| ${name} | ${engines.map(engine => { const c = rows.find(r => r.engine === engine)?.cells.find(c => c.name === name); return c ? `${format(c.p50)} / ${format(c.p95)}` : '—'; }).join(' | ')} |`);
    lines.push('', 'Maxima and samples (ms); rows are documents returned by the timed method, not verification reads:', '| Engine / cell | N | max | rows per sample |', '|---|---:|---:|---|');
    for (const row of rows) for (const c of row.cells) lines.push(`| ${row.engine} / ${c.name} | ${c.samples.length} | ${format(c.max)} | ${c.samples.map(s => s.rows ?? '—').join(', ')} |`);
    for (const row of rows) lines.push(`- ${row.engine}: mean seed JSON bytes ${JSON.stringify(row.seedBytes)}; storage-estimate after initial large seed: ${row.storageUsage ?? 'not collected'} bytes.`, ...(row.cells.find(c => c.name === 'cold-open-first-read')?.samples.map((s, i) => `  - Cold sample ${i + 1} fetched: ${JSON.stringify(s.fetched)}.`) ?? []));
    lines.push('');
  }
}
lines.push('## Bracket (lowest p50; descriptive, not significance-tested)', `| Scale / cell | ${reports.map(r => r.browser).join(' | ')} | straddles |`, `|---|${reports.map(() => '---|').join('')}---|`);
const keys = new Set(reports.flatMap(r => r.results.flatMap(row => row.cells.map(c => `${row.scale}/${c.name}`))));
for (const key of keys) {
  const [scale, name] = key.split('/'), winners = reports.map(r => r.results.filter(row => row.scale === scale).map(row => ({ engine: row.engine, cell: row.cells.find(c => c.name === name) })).filter(x => x.cell).sort((a, b) => a.cell.p50 - b.cell.p50));
  const labels = winners.map(w => w.length ? w.filter(x => x.cell.p50 === w[0].cell.p50).map(x => x.engine).join(' = ') : '—');
  // A column that measured one engine (WebKit: IndexedDB only) cannot straddle anything.
  const multi = reports.map(r => new Set(r.results.filter(row => row.scale === scale).map(row => row.engine)).size > 1);
  lines.push(`| ${key} | ${labels.join(' | ')} | ${new Set(labels.filter((x, i) => multi[i] && x !== '—')).size > 1 ? 'yes' : 'no'} |`);
}
let text = await readFile(target, 'utf8');
const previous = text.match(/<!-- measuredAt:(.*?) -->/)?.[1];
if (previous !== undefined && previous !== measuredAt) text = text.replace('<!-- generated:start -->', '> **STALE: measuredAt set changed. Operator must revisit the answer paragraphs above.**\n\n<!-- generated:start -->');
const generated = reports.length ? lines.join('\n') : 'No results yet — filled by `node report.mjs` after browser runs.';
text = text.replace(/<!-- generated:start -->[\s\S]*?<!-- generated:end -->/, `<!-- generated:start -->\n<!-- measuredAt:${measuredAt} -->\n${generated}\n<!-- generated:end -->`);
await writeFile(target, text);
console.info(`Wrote ${target.pathname}: ${reports.length} result files.`);
