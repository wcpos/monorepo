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
// both. A selector change (keystroke, pill) re-runs both; extending the limit on scroll re-runs
// only the find, because RxDB's query cache returns the unchanged count query with its result.
lines.push(
	'### Screen-visible latency on one worker (median ms)',
	'',
	'| Query | Action | Fallback | Modifier | One statement |',
	'|---|---|---:|---:|---:|'
);
for (const query of [...new Set(result.cells.map((c) => c.query))]) {
	const cell = (op, mode) =>
		med(
			result.cells.find((c) => c.query === query && c.operation === op && c.mode === mode),
			'workerMs'
		);
	const ops = [
		...new Set(
			result.cells
				.filter((c) => c.query === query && c.operation !== 'count')
				.map((c) => c.operation)
		),
	];
	const row = (label, f) =>
		lines.push(
			`| ${query} | ${label} | ${f('fallback').toFixed(1)} | ${f('modifier').toFixed(1)} | ${f('direct').toFixed(1)} |`
		);
	row(`${ops[0]} + count (selector change)`, (mode) => cell(ops[0], mode) + cell('count', mode));
	for (const op of ops.slice(1))
		row(`${op} only (limit extension, count cached)`, (mode) => cell(op, mode));
}
lines.push('', '### Direct query plans (observed)', '');
// The prose above the markers is hand-written from one run; say so loudly if results.json moved on.
const stamp = result.environment.measuredAt;
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
const stale = !old.split('<!-- generated:start -->')[0].includes(stamp);
if (stale)
	lines.unshift(
		`> **STALE PROSE.** results.json is from the run stamped \`${stamp}\`, but the hand-written sections above this marker were not written from it (they name a different \`measuredAt\`). Re-derive the verdict and headline tables from the tables below before quoting them.`,
		''
	);
await writeFile(
	path,
	old.replace(
		/<!-- generated:start -->[\s\S]*<!-- generated:end -->/,
		`<!-- generated:start -->\n${lines.join('\n')}\n<!-- generated:end -->`
	)
);
console.info(
	stale
		? `Updated RESULTS.md tables from results.json (${stamp}); the prose above the marker is from a different run and is flagged STALE.`
		: `Updated RESULTS.md tables from results.json (${stamp}); the prose above the marker was written from this run.`
);
