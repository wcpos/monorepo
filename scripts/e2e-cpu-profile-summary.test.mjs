import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { SourceMapConsumer, SourceMapGenerator } from 'source-map-js';

import {
	flowWindow,
	selfTimes,
	symbolicatorFor,
	topFunctions,
} from './e2e-cpu-profile-summary.mjs';

const SCRIPT = fileURLToPath(new URL('./e2e-cpu-profile-summary.mjs', import.meta.url));
const BUNDLE = 'http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android';
const frame = (functionName, url = '', columnNumber = 0) => ({
	functionName,
	url,
	lineNumber: url ? 0 : -1,
	columnNumber,
});
/** One node per frame; `self` lists each node's sample durations in µs, played back in order. */
function profileOf(frames, self) {
	const nodes = frames.map((callFrame, i) => ({ id: i + 1, callFrame }));
	const samples = self.flatMap((durations, i) => durations.map(() => i + 1));
	const durations = self.flat();
	// Each delta is the gap before a sample, so sample i's duration is timeDeltas[i + 1].
	const timeDeltas = [0, ...durations.slice(0, -1)];
	return {
		nodes,
		startTime: 0,
		endTime: durations.reduce((a, b) => a + b, 0),
		samples,
		timeDeltas,
	};
}
const none = () => null;

test('flowWindow takes min timestamp to max timestamp+duration over unordered commands', () => {
	const at = (timestamp, duration) => ({
		command: {},
		metadata: { status: 'COMPLETED', timestamp, duration },
	});
	assert.deepEqual(flowWindow([at(5_000, 100), at(1_000, 50), at(3_000, 4_000), { command: {} }]), {
		start: 1_000,
		end: 7_000,
	});
	assert.equal(flowWindow([]), null);
});

test("selfTimes attributes each sample's following delta to its node", () => {
	const profile = {
		startTime: 0,
		endTime: 1_115,
		samples: [1, 2, 1],
		timeDeltas: [10, 100, 1_000],
	};
	// Node 1: the 100 µs to sample 2, plus the 5 µs from the last sample (1110) to endTime.
	assert.deepEqual(
		[...selfTimes(profile)],
		[
			[1, 105],
			[2, 1_000],
		]
	);
});

test('topFunctions groups by symbolicated name and source line and ranks by self ms', () => {
	const map = new SourceMapGenerator({ file: 'entry.bundle' });
	const original = (column, source, line, name) =>
		map.addMapping({ generated: { line: 1, column }, original: { line, column: 0 }, source, name });
	const checkout = '/home/runner/work/monorepo/monorepo';
	original(10, `${checkout}/packages/database/src/insert.ts`, 12, 'insertRow');
	original(50, `${checkout}/packages/database/src/insert.ts`, 12, 'insertRow');
	original(90, `${checkout}/node_modules/rxdb/dist/query.js`, 3, 'exec');
	const symbolicate = symbolicatorFor(new Map([[BUNDLE, new SourceMapConsumer(map.toJSON())]]));
	const profile = profileOf(
		[frame('(root)'), frame('a', BUNDLE, 10), frame('b', BUNDLE, 50), frame('c', BUNDLE, 90)],
		[[1_000], [2_000], [3_000], [4_000]]
	);

	const { rows } = topFunctions([profile, profile], symbolicate, 2);

	assert.deepEqual(
		rows.map(({ name, where, selfMs }) => ({ name, where, selfMs })),
		[
			{ name: 'insertRow', where: 'packages/database/src/insert.ts:12', selfMs: 10 },
			{ name: 'exec', where: 'node_modules/rxdb/dist/query.js:3', selfMs: 8 },
		]
	);
});

test('topFunctions keeps (idle) and (garbage collector) out of the non-idle percentage', () => {
	const profile = profileOf(
		[frame('(idle)'), frame('(garbage collector)'), frame('(program)'), frame('render', BUNDLE, 4)],
		[[5_000], [3_000], [1_000], [1_000]]
	);

	const result = topFunctions([profile], none, 20);

	assert.equal(result.totalMs, 10);
	assert.deepEqual([result.idleMs, result.gcMs, result.programMs], [5, 3, 1]);
	assert.deepEqual(
		result.rows.map(({ name, where, pct }) => [name, where, pct]),
		[
			['(program)', '', 50],
			['render', 'entry.bundle:1:4', 50],
		]
	);
});

test('profiles outside the flow window are not used', () => {
	const dir = mkdtempSync(join(tmpdir(), 'cpu-profile-summary-'));
	try {
		const profileDir = join(dir, 'cpu-profiles');
		const runDir = join(dir, '2026-11-12_204600');
		mkdirSync(profileDir);
		mkdirSync(runDir);
		const commands = [
			{ command: {}, metadata: { status: 'COMPLETED', timestamp: 70_000, duration: 5_000 } },
			{ command: {}, metadata: { status: 'COMPLETED', timestamp: 40_000, duration: 1_000 } },
		];
		writeFileSync(join(runDir, 'commands-(04-cash-sale).json'), JSON.stringify(commands));
		const write = (start, end, name, url) =>
			writeFileSync(
				join(profileDir, `profile-${start}-${end}.cpuprofile`),
				JSON.stringify(profileOf([frame(name, url, 7)], [[2_000]]))
			);
		write(0, 30_000, 'beforeFlow');
		write(30_000, 60_000, 'inFlow', 'http://example.com/index.bundle?platform=ios');
		write(60_000, 90_000, 'alsoInFlow');
		write(90_000, 120_000, 'afterFlow');

		const run = spawnSync(
			process.execPath,
			[SCRIPT, profileDir, dir, '04-cash-sale', '--top', '5'],
			{
				encoding: 'utf8',
				env: { ...process.env, WCPOS_PROFILE_LABEL: 'ios-phone' },
			}
		);

		assert.equal(run.status, 0, run.stderr);
		const [header, ...rest] = run.stdout.trim().split('\n');
		assert.match(
			header,
			/^cpu-profile label=ios-phone flow=04-cash-sale window=40000-75000 \(35\.0s\)/
		);
		assert.match(header, / profiles=2 unreadable=0 map=refused sampledMs=4 /);
		assert.match(run.stdout, / \| inFlow \| index\.bundle:1:7$/m);
		assert.match(run.stdout, / \| alsoInFlow \| -$/m);
		assert.doesNotMatch(run.stdout, /beforeFlow|afterFlow/);
		assert.match(rest.at(-1), /profile-30000-60000\.cpuprofile profile-60000-90000\.cpuprofile/);
		assert.equal(readFileSync(join(profileDir, 'summary.txt'), 'utf8'), run.stdout);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
