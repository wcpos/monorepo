import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { createRepairOwnership } from './opfs-repair-ownership.mjs';

const originalChannel = globalThis.BroadcastChannel;
let channel;
class FakeBroadcastChannel {
	messages = [];
	closed = false;
	constructor(name) {
		this.name = name;
		channel = this;
	}
	postMessage(message) {
		this.messages.push(message);
	}
	close() {
		this.closed = true;
	}
}
beforeEach(() => {
	channel = undefined;
	globalThis.BroadcastChannel = FakeBroadcastChannel;
});
afterEach(() => {
	globalThis.BroadcastChannel = originalChannel;
});
const params = { databaseName: 'store', multiInstance: true };

test('worker greets its tab, replaces ownership by database, and closes the channel', () => {
	const ownership = createRepairOwnership({ channelName: 'wcpos.repair-ownership:tab' });
	assert.equal(channel?.name, 'wcpos.repair-ownership:tab');
	assert.deepEqual(channel.messages, [{ type: 'hello' }]);
	assert.equal(ownership.ownsRepairs(params), false);
	channel.onmessage({ data: { type: 'ownership', owned: ['store', 'other'] } });
	assert.equal(ownership.ownsRepairs(params), true);
	channel.onmessage({ data: { type: 'ownership', owned: ['other'] } });
	assert.equal(ownership.ownsRepairs(params), false);
	assert.equal(ownership.ownsRepairs({ ...params, databaseName: 'other' }), true);
	channel.onmessage({ data: { type: 'ownership', owned: [] } });
	assert.equal(ownership.ownsRepairs({ ...params, databaseName: 'other' }), false);
	assert.equal(ownership.ownsRepairs({ ...params, multiInstance: false }), true);
	ownership.close();
	assert.equal(channel.closed, true);
});

test('malformed messages neither throw nor replace ownership', () => {
	const ownership = createRepairOwnership({ channelName: 'tab' });
	assert.ok(channel);
	channel.onmessage({ data: { type: 'ownership', owned: ['store'] } });
	for (const data of [
		null,
		'ownership',
		{},
		{ type: 'hello' },
		{ type: 'ownership' },
		{ type: 'ownership', owned: 'store' },
		{ type: 'ownership', owned: [42] },
	]) {
		assert.doesNotThrow(() => channel.onmessage({ data }));
		assert.equal(ownership.ownsRepairs(params), true);
	}
});

for (const unavailable of ['name', 'BroadcastChannel']) {
	test(`without ${unavailable}, only single-instance repairs are owned`, () => {
		if (unavailable === 'BroadcastChannel') globalThis.BroadcastChannel = undefined;
		const ownership = createRepairOwnership({ channelName: unavailable === 'name' ? '' : 'tab' });
		assert.equal(channel, undefined);
		assert.equal(ownership.ownsRepairs(params), false);
		assert.equal(ownership.ownsRepairs({ ...params, multiInstance: false }), true);
		assert.doesNotThrow(() => ownership.close());
	});
}

test('acknowledges each ownership message after replacing the set', () => {
	const ownership = createRepairOwnership({ channelName: 'tab' });
	const observed = [];
	channel.postMessage = (message) => observed.push([message, ownership.ownsRepairs(params)]);
	channel.onmessage({ data: { type: 'ownership', owned: ['store'], seq: 1 } });
	channel.onmessage({ data: { type: 'ownership', owned: [], seq: 2 } });
	channel.onmessage({ data: { type: 'ownership', owned: ['store'] } });
	assert.deepEqual(observed, [
		[{ type: 'ownership-ack', seq: 1 }, true],
		[{ type: 'ownership-ack', seq: 2 }, false],
		[{ type: 'ownership-ack', seq: undefined }, true],
	]);
});

test('a silent worker loses its lease; a fresh message renews it', (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: 10000 });
	const ownership = createRepairOwnership({ channelName: 'tab' });
	const message = { data: { type: 'ownership', owned: ['store'] } };
	channel.onmessage(message);
	t.mock.timers.tick(2999);
	assert.equal(ownership.ownsRepairs(params), true);
	t.mock.timers.tick(2);
	assert.equal(ownership.ownsRepairs(params), false);
	channel.onmessage(message);
	assert.equal(ownership.ownsRepairs(params), true);
});

test('revocation ack drains every lost database instance and unregisters on close', async () => {
	const ownership = createRepairOwnership({ channelName: 'tab' });
	const releases = [];
	const observed = [];
	const closed = [];
	for (const name of ['store', 'store', 'other']) {
		const queue = new Promise((resolve) => releases.push(resolve));
		const instance = {
			taskQueue: {
				queue,
				awaitIdle: () => {
					observed.push(name);
					return queue;
				},
			},
			close: async () => closed.push(name),
		};
		ownership.onInstance(instance, { databaseName: name });
		if (name === 'other') {
			await instance.close();
			releases.pop()();
		}
	}
	await channel.onmessage({ data: { type: 'ownership', owned: ['store', 'other'], seq: 1 } });
	const revoking = channel.onmessage({ data: { type: 'ownership', owned: [], seq: 2 } });
	assert.equal(ownership.ownsRepairs(params), false);
	assert.equal(releases.length, 2);
	assert.deepEqual(observed, ['store', 'store']);
	assert.deepEqual(channel.messages.at(-1), { type: 'ownership-ack', seq: 1 });
	releases[0]();
	await Promise.resolve();
	assert.deepEqual(channel.messages.at(-1), { type: 'ownership-ack', seq: 1 });
	releases[1]();
	await revoking;
	assert.deepEqual(channel.messages.at(-1), { type: 'ownership-ack', seq: 2 });
	assert.deepEqual(closed, ['other']);
});

test('revocation drains a 300 ms task and work enqueued just after its first idle', async () => {
	const ownership = createRepairOwnership({ channelName: 'tab' });
	let lateFinished = false;
	let observations = 0;
	const taskQueue = {
		queue: new Promise((resolve) => setTimeout(resolve, 300)),
		awaitIdle() {
			observations++;
			const idle = this.queue;
			if (observations === 1) {
				// Enqueue after this idle promise resolves, before the drain resumes.
				void idle.then(() => {
					this.queue = idle.then(
						() =>
							new Promise((resolve) => {
								setTimeout(() => {
									lateFinished = true;
									resolve();
								}, 20);
							})
					);
				});
			}
			return idle;
		},
	};
	ownership.onInstance({ taskQueue, close() {} }, params);
	await channel.onmessage({ data: { type: 'ownership', owned: ['store'], seq: 1 } });
	const revoking = channel.onmessage({ data: { type: 'ownership', owned: [], seq: 2 } });
	assert.equal(ownership.ownsRepairs(params), false);
	assert.equal(channel.messages.at(-1).seq, 1);
	await revoking;
	assert.equal(lateFinished, true);
	assert.ok(observations >= 3, 'new work resets the two stable idle observations');
	assert.deepEqual(channel.messages.at(-1), { type: 'ownership-ack', seq: 2 });
});

test('a queue that goes idle at 1.5 seconds acknowledges after two stable observations', async () => {
	const ownership = createRepairOwnership({ channelName: 'tab' });
	let observations = 0;
	const queue = new Promise((resolve) => setTimeout(resolve, 1500));
	ownership.onInstance(
		{
			taskQueue: {
				queue,
				awaitIdle: () => {
					observations++;
					return queue;
				},
			},
			close() {},
		},
		params
	);
	await channel.onmessage({ data: { type: 'ownership', owned: ['store'], seq: 1 } });
	await channel.onmessage({ data: { type: 'ownership', owned: [], seq: 2 } });
	assert.equal(observations, 2);
	assert.equal(ownership.ownsRepairs(params), false);
	assert.deepEqual(channel.messages.at(-1), { type: 'ownership-ack', seq: 2 });
});

test('a wedged queue reports a drain timeout without acknowledging revocation', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const ownership = createRepairOwnership({ channelName: 'tab' });
	ownership.onInstance(
		{ taskQueue: { awaitIdle: () => new Promise(() => {}) }, close() {} },
		params
	);
	await channel.onmessage({ data: { type: 'ownership', owned: ['store'], seq: 1 } });
	const revoking = channel.onmessage({ data: { type: 'ownership', owned: [], seq: 2 } });
	t.mock.timers.tick(1999);
	await Promise.resolve();
	assert.equal(channel.messages.at(-1).seq, 1);
	t.mock.timers.tick(1);
	await revoking;
	assert.equal(ownership.ownsRepairs(params), false);
	assert.deepEqual(channel.messages.at(-1), { type: 'ownership-drain-timeout', seq: 2 });
	assert.equal(
		channel.messages.some(({ type, seq }) => type === 'ownership-ack' && seq === 2),
		false
	);
});
