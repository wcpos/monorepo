import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { prContext, readBlob, readEvent } from '../../../scripts/check-test-removal.mjs';

import {
	ROOT,
	scanSource,
	scanRepository,
	countSites,
	ratchetErrors,
	animationTokens,
} from './uniwind-scanner.mjs';

const allowlist = JSON.parse(
	readFileSync(`${ROOT}/packages/eslint/uniwind-allowlist.json`, 'utf8')
);
const sites = scanRepository();
// Reuse the Lint job's immutable PR base; local edits compare with HEAD. No fetch.
const base = readEvent(prContext()?.eventPath)?.pull_request?.base?.sha ?? 'HEAD';
const prior = readBlob(base, 'packages/eslint/uniwind-allowlist.json', ROOT);
// Bootstrap only: today's exceptions must already exist in the base source.
const baseline = prior
	? JSON.parse(prior)
	: countSites(
			Object.keys(allowlist).flatMap((path) =>
				scanSource(readBlob(base, path, ROOT), path, animationTokens())
			)
		);

test('Uniwind sites match the shrinking allowlist exactly', () => {
	assert.deepEqual(ratchetErrors(sites, allowlist, baseline), []);
});

test('unrelated lines above an allowlisted site do not change its identity', () => {
	const source = '<View className="hover:bg-card" />';
	const original = countSites(scanSource(source, 'existing.tsx'));
	assert.deepEqual(
		ratchetErrors(scanSource(`\n\n${source}`, 'existing.tsx'), original, original),
		[]
	);
});

test('a nonexistent allowlist entry is rejected, not a licence for future violations', () => {
	assert.deepEqual(ratchetErrors([], { 'missing.tsx': { 'hover:': 1 } }, {}), [
		'Allowlist grew: missing.tsx:hover: (1 > 0)',
		'Stale allowlist entry: missing.tsx:hover: (1 > 0)',
	]);
});

test('removing a live entry rejects its still-present violation', () => {
	assert.deepEqual(ratchetErrors(['existing.tsx:1:hover:'], {}), [
		'New violation: existing.tsx:hover: (1 > 0) at lines 1',
	]);
	assert.deepEqual(ratchetErrors([], {}, {}), []); // The ratchet can reach zero.
});

test('counts sites per path and construct with sorted keys, retaining construct colons', () => {
	const counts = countSites([
		'z.tsx:10:truncate',
		'a.tsx:3:truncate',
		'a.tsx:2:hover:',
		'a.tsx:12:hover:',
	]);
	assert.deepEqual(counts, { 'a.tsx': { 'hover:': 2, truncate: 1 }, 'z.tsx': { truncate: 1 } });
	assert.deepEqual(Object.keys(counts), ['a.tsx', 'z.tsx']);
	assert.deepEqual(Object.keys(counts['a.tsx']), ['hover:', 'truncate']);
});

test('bare hover above the allowed count reports the current lines', () => {
	const live = scanSource(
		'<View className="hover:bg-card" />\n<View className="hover:bg-primary" />',
		'existing.tsx'
	);
	assert.deepEqual(ratchetErrors(live, { 'existing.tsx': { 'hover:': 1 } }), [
		'New violation: existing.tsx:hover: (2 > 1) at lines 1, 2',
	]);
});

test('removing a violation requires lowering its allowed count', () => {
	const live = ['existing.tsx:7:hover:'];
	const prior = { 'existing.tsx': { 'hover:': 2 } };
	assert.deepEqual(ratchetErrors(live, prior), [
		'Stale allowlist entry: existing.tsx:hover: (2 > 1)',
	]);
	assert.deepEqual(ratchetErrors(live, { 'existing.tsx': { 'hover:': 1 } }, prior), []);
});

const path = 'packages/core/src/screens/example/index.tsx';
const constructs = [
	['hover:bg-card', 'hover:'],
	['web:group-hover:text-primary', 'group-*'],
	['before:block', 'before:/after:'],
	['after:block', 'before:/after:'],
	['animate-spin', 'animate-*'],
	['motion-reduce:hidden', 'motion-reduce:/motion-safe:'],
	['motion-safe:block', 'motion-reduce:/motion-safe:'],
	['web:focus-visible:ring-2', 'focus-visible:'],
	['w-[clamp(1rem,2vw,3rem)]', 'clamp('],
	['filter', 'filter'],
	['filter-none', 'filter'],
	['[backdrop-filter:blur(2px)]', 'backdrop-filter'],
	['[mask-image:url(x)]', 'mask-image'],
	['sticky', 'sticky'],
	['truncate', 'truncate'],
	['whitespace-nowrap', 'whitespace-nowrap'],
	['text-ellipsis', 'text-ellipsis'],
	['grid', 'grid/grid-cols-*'],
	['grid-cols-2', 'grid/grid-cols-*'],
	['focus:outline-2', 'outline-focus-ring'],
	['data-[theme=dark]:bg-card', 'data-axis'],
	['data-[scale=large]:p-2', 'data-axis'],
	['data-[pointer=fine]:p-2', 'data-axis'],
	['max-h-[300px]', 'arbitrary-px'],
	['w-[-1.5px]', 'arbitrary-px'],
];
for (const [token, construct] of constructs) {
	test(`class scanner catches ${token} in JSX, cn, and cva`, () => {
		for (const source of [
			`<View className="${token}" />`,
			`cn('p-2', active && '${token}')`,
			`cva('p-2', { variants: { size: { sm: \`${token}\` } } })`,
			`<View className={\`p-2 \${active ? '${token}' : ''}\`} />`,
		])
			assert.ok(scanSource(source, path).includes(`${path}:1:${construct}`), source);
	});
}

test('does not lint prose, comments, safe web hover, side selectors, or outline removal', () => {
	assert.deepEqual(
		scanSource(
			`
		// <View className="hover:bg-card" />
		const text = 'hover:bg-card';
		<View title="truncate" className="web:hover:bg-card web:outline-none focus:outline-none data-[side=left]:p-2 flex whitespace-normal" />
	`,
			path
		),
		[]
	);
});

test('reports real multiline class positions and template segments', () => {
	assert.deepEqual(scanSource('<View className={`p-2\nhover:bg-card ${x}\ntruncate`} />', path), [
		`${path}:2:hover:`,
		`${path}:3:truncate`,
	]);
});

test('bare Suspense is scoped to screen index files and accepts a real fallback', () => {
	const source =
		'<><Suspense /><React.Suspense fallback={null} /><Suspense fallback={<Loading />} /></>';
	assert.deepEqual(scanSource(source, path), [`${path}:1:bare-Suspense`]);
	assert.deepEqual(scanSource(source, 'packages/components/src/example/index.tsx'), []);
});

test('duration literals are caught without matching comments, strings, or named durations', () => {
	assert.deepEqual(
		scanSource(
			`
		// duration: 500
		const text = '.duration(500)';
		withTiming(1, { duration: open ? 250 : 200 });
		FadeIn.duration(275);
		FadeOut.duration(OVERLAY_FADE);
	`,
			path
		),
		[`${path}:4:duration-literal`, `${path}:5:duration-literal`]
	);
});

test('web animations resolve imported tokens and reject missing names, including chained variants', () => {
	const tokens = animationTokens();
	assert.ok(tokens.has('spin') && tokens.has('in') && tokens.has('accordion-down'));
	assert.deepEqual(
		scanSource('<View className="web:animate-spin web:group-hover:animate-typo" />', path, tokens),
		[`${path}:1:group-*`, `${path}:1:missing-animation:typo`]
	);
});

test('follows local class constants without linting unrelated string constants', () => {
	assert.deepEqual(
		scanSource(
			`
		const prose = 'truncate';
		const styles = 'hover:bg-card';
		<View className={styles} />;
	`,
			path
		),
		[`${path}:3:hover:`]
	);
});

test('adding a real violation together with its allowlist entry still fails', () => {
	const added = `${path}:1:hover:`;
	assert.deepEqual(ratchetErrors([added], { [path]: { 'hover:': 1 } }, {}), [
		`Allowlist grew: ${path}:hover: (1 > 0)`,
	]);
	assert.deepEqual(
		ratchetErrors(
			[added, `${path}:8:hover:`],
			{ [path]: { 'hover:': 2 } },
			{ [path]: { 'hover:': 1 } }
		),
		[`Allowlist grew: ${path}:hover: (2 > 1)`]
	);
});
