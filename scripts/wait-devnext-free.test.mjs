import assert from 'node:assert/strict';
import test from 'node:test';

import {
	blockersFor,
	MAX_CONSECUTIVE_ERRORS,
	MAX_WAIT_MS,
	POLL_INTERVAL_MS,
	QUEUE_STEP_NAME,
	QUEUE_WORKFLOWS,
	queueState,
	waitForDevNext,
} from './wait-devnext-free.mjs';

const holder = {
	id: 200,
	event: 'workflow_dispatch',
	html_url: 'https://github.com/wcpos/monorepo/actions/runs/200',
	jobs: [{ steps: [{ name: QUEUE_STEP_NAME, status: 'completed', conclusion: 'success' }] }],
};

function fakeQueue(snapshots, options = {}) {
	const calls = { polls: 0, sleeps: [], jobs: [], logs: [] };
	let clock = 0;
	let snapshot;
	return {
		calls,
		now: () => clock,
		run: () =>
			waitForDevNext({
				ownRunId: 100,
				listRuns: async () => {
					snapshot = snapshots[Math.min(calls.polls++, snapshots.length - 1)];
					if (snapshot instanceof Error) throw snapshot;
					return snapshot;
				},
				listJobs: async (id) => {
					calls.jobs.push(id);
					return snapshot.find((run) => run.id === id).jobs;
				},
				sleep: async (ms) => {
					calls.sleeps.push(ms);
					clock += ms;
				},
				now: () => clock,
				log: (line) => calls.logs.push(line),
				pollIntervalMs: 1000,
				maxWaitMs: 10_000,
				...options,
			}),
	};
}

test('queueState finds the queue step in any job and classifies its status', () => {
	for (const [status, conclusion, state] of [
		['in_progress', null, 'waiting'],
		['completed', 'success', 'holding'],
		['completed', 'skipped', 'none'],
		['completed', 'failure', 'none'],
		['completed', 'cancelled', 'none'],
		['queued', null, 'none'],
	]) {
		const job = { steps: [{ name: QUEUE_STEP_NAME, status, conclusion }] };
		assert.equal(queueState([job]), state);
		assert.equal(queueState([{ steps: [] }, job]), state);
	}
	assert.equal(queueState([]), 'none');
	assert.equal(queueState([{ steps: [{ name: 'another step', status: 'in_progress' }] }]), 'none');
});

test('blockersFor ignores its own run id when waiting or holding', () => {
	for (const state of ['waiting', 'holding']) {
		assert.deepEqual(blockersFor(100, [{ id: 100, state, url: 'own' }]), []);
	}
});

test('the older of two waiters goes first', () => {
	const runs = [100, 101].map((id) => ({ id, state: 'waiting', url: String(id) }));
	assert.deepEqual(blockersFor(100, runs), []);
	assert.deepEqual(blockersFor(101, runs), [runs[0]]);
	assert.deepEqual(blockersFor(100, [{ id: '99', state: 'waiting', url: '99' }]), [
		{ id: '99', state: 'waiting', url: '99' },
	]);
});

test('a holder blocks every other run regardless of id', () => {
	for (const [ownRunId, id] of [
		[100, 200],
		[200, 100],
	]) {
		const run = { id, state: 'holding', url: String(id) };
		assert.deepEqual(blockersFor(ownRunId, [run]), [run]);
	}
	assert.deepEqual(blockersFor(100, [{ id: 99, state: 'none', url: '99' }]), []);
});

test('waitForDevNext never fetches jobs for PRs or its own run', async () => {
	const fake = fakeQueue([
		[
			{ ...holder, id: 100 },
			{ ...holder, event: 'pull_request' },
		],
	]);
	assert.equal((await fake.run()).admitted, true);
	assert.deepEqual(fake.calls.jobs, []);
});

test('admission requires two consecutive clear polls', async () => {
	const fake = fakeQueue([[], [holder], [], []]);
	assert.deepEqual(await fake.run(), { admitted: true, waitedMs: 3000 });
	assert.equal(fake.calls.polls, 4);
	assert.deepEqual(fake.calls.sleeps, [1000, 1000, 1000]);
	assert.deepEqual(fake.calls.logs, [
		'dev-next looks free; confirming in 1 s',
		`Waiting for dev-next: ${holder.html_url} (holding)`,
		'dev-next looks free; confirming in 1 s',
		'dev-next is free; proceeding after 0 min',
	]);
});

test('admission follows a holder leaving the in-progress list', async () => {
	const fake = fakeQueue([[holder], [holder], [], []]);
	assert.deepEqual(await fake.run(), { admitted: true, waitedMs: 3000 });
	assert.equal(fake.calls.polls, 4);
	assert.deepEqual(fake.calls.jobs, [200, 200]);
});

test('a holder that never releases times out without passing maxWaitMs', async () => {
	assert.equal(POLL_INTERVAL_MS, 90_000);
	assert.equal(MAX_WAIT_MS, 240 * 60_000);
	assert.deepEqual(QUEUE_WORKFLOWS, ['deploy.yml', 'e2e-native.yml']);
	const fake = fakeQueue([[holder]], { maxWaitMs: 2500 });
	assert.deepEqual(await fake.run(), {
		admitted: false,
		waitedMs: 2000,
		blockers: [{ id: holder.id, state: 'holding', url: holder.html_url }],
		reason: 'timeout',
	});
	assert.ok(fake.now() <= 2500);
	assert.equal(fake.calls.polls, 3);
});

test('one API error recovers but five consecutive errors fail admission', async () => {
	assert.equal(MAX_CONSECUTIVE_ERRORS, 5);
	const error = new Error('API unavailable');
	const recovered = fakeQueue([error, [], []]);
	assert.deepEqual(await recovered.run(), { admitted: true, waitedMs: 2000 });
	assert.equal(recovered.calls.polls, 3);
	assert.equal(recovered.calls.logs[0], '::warning::API unavailable');
	const failed = fakeQueue([error]);
	assert.deepEqual(await failed.run(), {
		admitted: false,
		waitedMs: 4000,
		blockers: [],
		reason: 'errors',
	});
	assert.equal(failed.calls.polls, 5);
	assert.equal(failed.calls.sleeps.length, 4);
});
