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
