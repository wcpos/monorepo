import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RxDatabase, RxPlugin } from 'rxdb';

const mockWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
}));

class FakeBroadcastChannel {
	static instances: FakeBroadcastChannel[] = [];
	onmessage?: (event: { data: unknown }) => void;
	postMessage = jest.fn();
	constructor(readonly name: string) {
		FakeBroadcastChannel.instances.push(this);
	}
}
const originalChannel = globalThis.BroadcastChannel;
beforeEach(() => {
	jest.resetModules();
	mockWarn.mockClear();
	FakeBroadcastChannel.instances = [];
	globalThis.BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel;
});
afterEach(() => {
	globalThis.BroadcastChannel = originalChannel;
});
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const ownership = (...owned: string[]) => ({ type: 'ownership', owned, seq: expect.any(Number) });

async function setup() {
	const { createRepairOwnershipPlugin, getRepairOwnershipChannelName } =
		await import('./repair-ownership');
	const channelName = getRepairOwnershipChannelName();
	const plugin = createRepairOwnershipPlugin({ channelName });
	return {
		plugin,
		channelName,
		channel: FakeBroadcastChannel.instances[0],
		createRepairOwnershipPlugin,
		getRepairOwnershipChannelName,
	};
}
function fakeDatabase(plugin: RxPlugin, multiInstance = true, name = 'store') {
	let lead!: (value: boolean) => void;
	let reject!: (error: Error) => void;
	const leadership = new Promise<boolean>((resolve, rejectPromise) => {
		lead = resolve;
		reject = rejectPromise;
	});
	const database = { name, multiInstance, waitForLeadership: jest.fn(() => leadership) };
	return {
		database,
		lead,
		reject,
		start: () =>
			plugin.hooks?.createRxDatabase?.after?.({
				database: database as unknown as RxDatabase,
				creator: {} as never,
			}),
		close: () => plugin.hooks?.preCloseRxDatabase?.before?.(database as unknown as RxDatabase),
	};
}

async function closeAndAck(db: ReturnType<typeof fakeDatabase>, channel: FakeBroadcastChannel) {
	const closing = db.close();
	channel.onmessage?.({
		data: { type: 'ownership-ack', seq: channel.postMessage.mock.lastCall?.[0].seq },
	});
	await closing;
}

test('one tab name and plugin object are reused for repeated registration', async () => {
	const fake = await setup();
	expect(fake.channelName).toMatch(/^wcpos\.repair-ownership:.+/);
	expect(fake.getRepairOwnershipChannelName()).toBe(fake.channelName);
	expect(fake.createRepairOwnershipPlugin({ channelName: fake.channelName })).toBe(fake.plugin);
	expect(FakeBroadcastChannel.instances).toHaveLength(1);
	expect(fake.channel.name).toBe(fake.channelName);
});

test('single-instance databases publish nothing', async () => {
	const { plugin, channel } = await setup();
	const db = fakeDatabase(plugin, false);
	db.start();
	db.lead(true);
	await db.close();
	await settle();
	expect(channel.postMessage).not.toHaveBeenCalled();
	expect(db.database.waitForLeadership).not.toHaveBeenCalled();
});

test('leadership publishes the full set; hello replays it to late workers; pre-close revokes', async () => {
	const { plugin, channel } = await setup();
	const first = fakeDatabase(plugin);
	const second = fakeDatabase(plugin, true, 'other');
	expect(first.start()).toBeUndefined();
	second.start();
	expect(channel.postMessage).not.toHaveBeenCalled();
	first.lead(true);
	await settle();
	expect(channel.postMessage).toHaveBeenLastCalledWith(ownership('store'));
	second.lead(true);
	await settle();
	expect(channel.postMessage).toHaveBeenLastCalledWith(ownership('store', 'other'));
	channel.postMessage.mockClear();
	channel.onmessage?.({ data: { type: 'hello' } });
	expect(channel.postMessage).toHaveBeenCalledWith(ownership('store', 'other'));
	await closeAndAck(first, channel);
	expect(channel.postMessage).toHaveBeenLastCalledWith(ownership('other'));
	await closeAndAck(second, channel);
	expect(channel.postMessage).toHaveBeenLastCalledWith(ownership());
});

test('leadership resolving after pre-close never re-adds the database', async () => {
	const { plugin, channel } = await setup();
	const db = fakeDatabase(plugin);
	db.start();
	await closeAndAck(db, channel);
	db.lead(true);
	await settle();
	expect(channel.postMessage.mock.calls).toEqual([[ownership()]]);
});

for (const mode of ['throw', 'reject']) {
	test(`leadership ${mode} is logged and never escapes the hook`, async () => {
		const { plugin } = await setup();
		const db = fakeDatabase(plugin);
		const error = new Error('leadership failed');
		if (mode === 'throw')
			db.database.waitForLeadership.mockImplementation(() => {
				throw error;
			});
		expect(() => db.start()).not.toThrow();
		if (mode === 'reject') db.reject(error);
		await settle();
		expect(mockWarn).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(mockWarn.mock.calls)).toContain(error.message);
	});
}

test('plugin is inert without BroadcastChannel', async () => {
	globalThis.BroadcastChannel = undefined as unknown as typeof BroadcastChannel;
	const { plugin } = await setup();
	const db = fakeDatabase(plugin);
	db.start();
	db.lead(true);
	await db.close();
	await settle();
	expect(db.database.waitForLeadership).not.toHaveBeenCalled();
	expect(FakeBroadcastChannel.instances).toHaveLength(0);
});

test('closing a duplicate preserves the surviving leader until it too closes', async () => {
	const { plugin, channel } = await setup();
	const first = fakeDatabase(plugin);
	const second = fakeDatabase(plugin);
	first.start();
	second.start();
	first.lead(true);
	second.lead(true);
	await settle();
	await closeAndAck(first, channel);
	expect(channel.postMessage).toHaveBeenLastCalledWith(ownership('store'));
	await closeAndAck(second, channel);
	expect(channel.postMessage).toHaveBeenLastCalledWith(ownership());
});

test('pre-close waits for its own revocation ack, not an earlier publication', async () => {
	const { plugin, channel } = await setup();
	const db = fakeDatabase(plugin);
	db.start();
	db.lead(true);
	await settle();
	const leadingSeq = channel.postMessage.mock.lastCall?.[0].seq;
	let closed = false;
	const closing = Promise.resolve(db.close()).then(() => {
		closed = true;
	});
	const revokedSeq = channel.postMessage.mock.lastCall?.[0].seq;
	expect(revokedSeq).toBeGreaterThan(leadingSeq);
	channel.onmessage?.({ data: { type: 'ownership-ack', seq: leadingSeq } });
	await settle();
	expect(closed).toBe(false);
	channel.onmessage?.({ data: { type: 'ownership-ack', seq: revokedSeq } });
	await closing;
	expect(closed).toBe(true);
});

test('the ack timeout outlasts the worker drain', async () => {
	const { REVOCATION_ACK_TIMEOUT_MS } = await import('./repair-ownership');
	const worker = readFileSync(
		resolve(__dirname, '../../../../scripts/opfs-repair-ownership.mjs'),
		'utf8'
	);
	const drain = Number(worker.match(/const REVOCATION_DRAIN_MS = (\d+)/)?.[1]);
	expect(REVOCATION_ACK_TIMEOUT_MS).toBeGreaterThan(drain);
});

test('pre-close resolves at an ack arriving after 3 seconds, not the old timeout', async () => {
	const { plugin, channel } = await setup();
	jest.useFakeTimers();
	try {
		const db = fakeDatabase(plugin);
		let closed = false;
		const closing = Promise.resolve(db.close()).then(() => {
			closed = true;
		});
		const seq = channel.postMessage.mock.lastCall?.[0].seq;
		setTimeout(() => channel.onmessage?.({ data: { type: 'ownership-ack', seq } }), 3000);
		await jest.advanceTimersByTimeAsync(2999);
		expect(closed).toBe(false);
		await jest.advanceTimersByTimeAsync(1);
		await closing;
		expect(closed).toBe(true);
		expect(jest.getTimerCount()).toBe(0);
	} finally {
		jest.useRealTimers();
	}
});

test('a dead worker bounds pre-close waiting to 10 seconds', async () => {
	const { plugin } = await setup();
	jest.useFakeTimers();
	try {
		const db = fakeDatabase(plugin);
		let closed = false;
		const closing = Promise.resolve(db.close()).then(() => {
			closed = true;
		});
		await jest.advanceTimersByTimeAsync(9999);
		expect(closed).toBe(false);
		await jest.advanceTimersByTimeAsync(1);
		await closing;
		expect(closed).toBe(true);
		expect(jest.getTimerCount()).toBe(0);
	} finally {
		jest.useRealTimers();
	}
});

test.each(['ack', 'deadline'])(
	'a drain timeout is logged but close waits for the %s',
	async (end) => {
		const { plugin, channel } = await setup();
		jest.useFakeTimers();
		try {
			const db = fakeDatabase(plugin);
			let closed = false;
			const closing = Promise.resolve(db.close()).then(() => {
				closed = true;
			});
			const seq = channel.postMessage.mock.lastCall?.[0].seq;
			await jest.advanceTimersByTimeAsync(2000);
			channel.onmessage?.({ data: { type: 'ownership-drain-timeout', seq } });
			expect(mockWarn).toHaveBeenCalledTimes(1);
			expect(mockWarn).toHaveBeenCalledWith(expect.stringMatching(/drain.*timed out/i), {
				context: { seq },
			});
			await jest.advanceTimersByTimeAsync(end === 'ack' ? 1000 : 7999);
			expect(closed).toBe(false);
			if (end === 'ack') channel.onmessage?.({ data: { type: 'ownership-ack', seq } });
			else await jest.advanceTimersByTimeAsync(1);
			await closing;
			expect(closed).toBe(true);
			expect(jest.getTimerCount()).toBe(0);
		} finally {
			jest.useRealTimers();
		}
	}
);

test('renews live ownership until the last leader closes', async () => {
	const { plugin, channel } = await setup();
	jest.useFakeTimers();
	try {
		const first = fakeDatabase(plugin);
		const second = fakeDatabase(plugin, true, 'other');
		first.start();
		second.start();
		first.lead(true);
		second.lead(true);
		await jest.advanceTimersByTimeAsync(0);
		channel.postMessage.mockClear();
		await jest.advanceTimersByTimeAsync(1000);
		expect(channel.postMessage).toHaveBeenCalledTimes(1);
		expect(channel.postMessage).toHaveBeenLastCalledWith(ownership('store', 'other'));
		const closingFirst = first.close();
		await jest.advanceTimersByTimeAsync(10000);
		await closingFirst;
		expect(channel.postMessage).toHaveBeenLastCalledWith(ownership('other'));
		const closingSecond = second.close();
		await jest.advanceTimersByTimeAsync(10000);
		await closingSecond;
		channel.postMessage.mockClear();
		await jest.advanceTimersByTimeAsync(4000);
		expect(channel.postMessage).not.toHaveBeenCalled();
		expect(jest.getTimerCount()).toBe(0);
	} finally {
		jest.useRealTimers();
	}
});
