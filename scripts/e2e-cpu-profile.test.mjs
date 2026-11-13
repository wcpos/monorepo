import assert from 'node:assert/strict';
import test from 'node:test';

import { traceToCpuProfiles } from './e2e-cpu-profile.mjs';
import { selfTimes } from './e2e-cpu-profile-summary.mjs';

const BUNDLE = 'http://localhost:8081/index.bundle?platform=android';
const node = (id, functionName, parent) => ({
	id,
	...(parent === undefined ? {} : { parent }),
	callFrame: {
		functionName,
		url: BUNDLE,
		lineNumber: 0,
		columnNumber: id,
		scriptId: '1',
		codeType: 'JS',
	},
});
// The two trace events of react-native 0.88.1 PerformanceTracer.cpp, as TraceEventSerializer.cpp writes them.
const profile = (id, ts, startTime) => ({
	id,
	name: 'Profile',
	cat: 'disabled-by-default-v8.cpu_profiler',
	ph: 'P',
	ts,
	pid: 1,
	tid: 2,
	args: { data: startTime === undefined ? {} : { startTime } },
});
const chunk = (id, ts, nodes, samples, timeDeltas) => ({
	id,
	name: 'ProfileChunk',
	cat: 'disabled-by-default-v8.cpu_profiler',
	ph: 'P',
	ts,
	pid: 1,
	tid: 2,
	args: { data: { cpuProfile: { nodes, samples }, timeDeltas } },
});

test('traceToCpuProfiles merges each Profile id over its chunks, nodes once each', () => {
	const events = [
		{ name: 'TracingStartedInPage', ph: 'I', ts: 900, args: {} },
		profile('0x1', 999, 1_000),
		chunk('0x1', 1_100, [node(1, '(root)'), node(2, 'render', 1)], [2, 2], [10, 100]),
		profile('0x2', 5_000),
		chunk('0x2', 5_010, [node(1, '(root)')], [1, 1], [5, 7]),
		// The second chunk repeats node 2 and brings node 3.
		chunk('0x1', 1_400, [node(2, 'render', 1), node(3, 'insertRow', 2)], [3, 2], [200, 50]),
	];

	const [first, second, ...rest] = traceToCpuProfiles(events);

	assert.equal(rest.length, 0);
	assert.deepEqual(
		first.nodes.map((n) => [n.id, n.parent, n.callFrame.functionName]),
		[
			[1, undefined, '(root)'],
			[2, 1, 'render'],
			[3, 2, 'insertRow'],
		]
	);
	assert.deepEqual(first.samples, [2, 2, 3, 2]);
	assert.deepEqual(first.timeDeltas, [10, 100, 200, 50]);
	assert.deepEqual([first.startTime, first.endTime], [1_000, 1_360]); // args.data.startTime wins over ts.
	// Sample i owns timeDeltas[i + 1]; the last sample runs to endTime, which is that sample's time.
	assert.deepEqual(
		[...selfTimes(first)],
		[
			[2, 300],
			[3, 50],
		]
	);

	assert.deepEqual(second.nodes, [node(1, '(root)')]);
	assert.deepEqual(
		[second.samples, second.timeDeltas],
		[
			[1, 1],
			[5, 7],
		]
	);
	assert.deepEqual([second.startTime, second.endTime], [5_000, 5_012]); // No startTime: the event's ts.
	assert.deepEqual([...selfTimes(second)], [[1, 7]]);
});

test('traceToCpuProfiles starts a chunk with no Profile event at its first ts', () => {
	const [only] = traceToCpuProfiles([
		chunk('0x9', 7_000, [node(1, '(root)')], [1], [3]),
		chunk('0x9', 7_500, [], [1], [4]),
	]);

	assert.deepEqual([only.startTime, only.endTime, only.samples], [7_000, 7_007, [1, 1]]);
});
