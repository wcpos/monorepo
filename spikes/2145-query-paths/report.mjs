import { readFile, writeFile } from 'node:fs/promises';
const result = JSON.parse(await readFile(new URL('./results.json', import.meta.url)));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const med = (cell, key) => median(cell.samples.map((s) => s[key]));
const pair = (cell, key) =>
	`${med(cell, key).toFixed(2)} / ${Math.max(...cell.samples.map((s) => s[key])).toFixed(2)}`;
const lines = [
	'Environment: `' + JSON.stringify(result.environment) + '`',
	'',
	`Rows: ${JSON.stringify(result.rows)}; mean JSON bytes: ${JSON.stringify(result.seedBytes)}.`,
	'',
	'All timing/count cells are median / max of five runs after one discarded warm-up (three runs for a fallback count, which pages the whole table). Times in ms.',
	'',
];
if (
	result.cells.length !== 30 ||
	result.cells.some(
		(c) => c.samples.length !== (c.mode === 'fallback' && c.operation === 'count' ? 3 : 5)
	)
)
	throw new Error('Incomplete benchmark');
for (const query of [...new Set(result.cells.map((c) => c.query))]) {
	lines.push(
		`### ${query}`,
		'',
		'| Operation | Mode | Worker ms | all() ms | Page ms | all() calls | Rows to JS | Matches | Worker / direct | Page / direct |',
		'|---|---|---:|---:|---:|---:|---:|---:|---:|---:|'
	);
	for (const cell of result.cells.filter((c) => c.query === query)) {
		const direct = result.cells.find(
			(c) => c.query === query && c.operation === cell.operation && c.mode === 'direct'
		);
		lines.push(
			`| ${cell.operation} | ${cell.mode} | ${['workerMs', 'allMs', 'pageMs', 'calls', 'rows', 'matches'].map((k) => pair(cell, k)).join(' | ')} | ${(med(cell, 'workerMs') / med(direct, 'workerMs')).toFixed(2)}× | ${(med(cell, 'pageMs') / med(direct, 'pageMs')).toFixed(2)}× |`
		);
	}
	lines.push('');
}
// Both screens wait on find AND count before they render (use-local-query.ts combineLatest of
// documents$/total$; execute-query.ts combineLatest of query.$/count.$), and one worker serves
// both, so the user-visible latency of a search keystroke or pill change is the sum.
lines.push(
	'### Screen-visible latency: find + count on one worker (median ms)',
	'',
	'| Query | Window | Fallback | Modifier | One statement |',
	'|---|---|---:|---:|---:|'
);
for (const query of [...new Set(result.cells.map((c) => c.query))]) {
	const count = (mode) =>
		med(result.cells.find((c) => c.query === query && c.operation === 'count' && c.mode === mode), 'workerMs');
	for (const op of [...new Set(result.cells.filter((c) => c.query === query && c.operation !== 'count').map((c) => c.operation))]) {
		const find = (mode) =>
			med(result.cells.find((c) => c.query === query && c.operation === op && c.mode === mode), 'workerMs');
		lines.push(
			`| ${query} | ${op} | ${(find('fallback') + count('fallback')).toFixed(1)} | ${(find('modifier') + count('modifier')).toFixed(1)} | ${(find('direct') + count('direct')).toFixed(1)} |`
		);
	}
}
lines.push('', '### Direct query plans (observed)', '');
for (const [key, p] of Object.entries(result.plans)) {
	const details = p.plan.map((r) => r.detail).join('; ');
	lines.push(
		`- **${key}** — declared RxDB index mentioned: **${/USING .*INDEX rxdb/i.test(details) ? 'yes' : 'no'}**. ${details}`,
		'',
		'```sql',
		p.query,
		'```',
		`Parameters: \`${JSON.stringify(p.params)}\``,
		''
	);
}
const path = new URL('./RESULTS.md', import.meta.url),
	old = await readFile(path, 'utf8');
await writeFile(
	path,
	old.replace(
		/<!-- generated:start -->[\s\S]*<!-- generated:end -->/,
		`<!-- generated:start -->\n${lines.join('\n')}\n<!-- generated:end -->`
	)
);
console.info('Updated RESULTS.md tables and environment from results.json.');
