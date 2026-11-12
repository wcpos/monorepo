/** @jest-environment node */

import { type DisplayEvent, DisplaySession } from './display-session';

import type { OffererPeer } from './peer';
import type { DisplayRegistryRow, IncomingSignal, SignalingClient } from './signaling-client';

const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({
		warn: (...args: unknown[]) => mockLoggerWarn(...args),
		debug: (...args: unknown[]) => mockLoggerDebug(...args),
	}),
}));

class FakePeer implements OffererPeer {
	channelState: 'connecting' | 'open' | 'closed' = 'connecting';
	sent: string[] = [];
	accepted: string[] = [];
	candidates: RTCIceCandidateInit[] = [];
	operations: string[] = [];
	sendError: Error | null = null;
	private openListener: () => void = () => undefined;
	private messageListener: (text: string) => void = () => undefined;
	private closeListener: () => void = () => undefined;

	async createOffer() {
		return { sdp: 'local-offer' };
	}
	async acceptAnswer(sdp: string) {
		this.accepted.push(sdp);
		this.operations.push(`answer:${sdp}`);
	}
	async addCandidate(candidate: RTCIceCandidateInit) {
		this.candidates.push(candidate);
		this.operations.push(`candidate:${candidate.candidate}`);
	}
	send(text: string) {
		if (this.sendError) throw this.sendError;
		this.sent.push(text);
	}
	onOpen(fn: () => void) {
		this.openListener = fn;
	}
	onMessage(fn: (text: string) => void) {
		this.messageListener = fn;
	}
	onClose(fn: () => void) {
		this.closeListener = fn;
	}
	close() {
		this.channelState = 'closed';
		this.closeListener();
	}
	open() {
		this.channelState = 'open';
		this.openListener();
	}
	message(value: object) {
		this.messageListener(JSON.stringify(value));
	}
}

const display: DisplayRegistryRow = {
	id: 'display-1',
	name: 'Counter',
	device_id: 'device-1',
	store_id: 7,
	paired_at: 1788429600,
	last_seen: 1788429600,
	connected: false,
};

const config = {
	store: { id: 7, name: 'Shop', currency: 'EUR', locale: 'en-IE' },
	presentation_hints: { locale: 'en-IE' },
	i18n: { total: 'Total' },
};

// A configured session keeps a heartbeat interval; close every one so no real timer outlives its test.
const created: DisplaySession[] = [];
afterEach(() => created.splice(0).forEach((session) => session.close()));

function setup(
	currentState: DisplayEvent | null = { action: 'display.idle', payload: { reason: 'no_cart' } },
	initialConfig: typeof config | null = config,
	extra: Partial<ConstructorParameters<typeof DisplaySession>[0]> = {}
) {
	const peers: FakePeer[] = [];
	let signals: IncomingSignal[] = [];
	let currentConfig = initialConfig;
	const signaling = {
		postSignal: jest.fn(async () => undefined),
		readSignals: jest.fn(async () => signals.splice(0)),
	} as unknown as SignalingClient;
	let sessions = 0;
	const session = new DisplaySession({
		display,
		deviceId: 'device-1',
		signaling,
		createPeer: () => {
			const peer = new FakePeer();
			peers.push(peer);
			return peer;
		},
		getConfig: () => currentConfig,
		getCurrentState: () => currentState,
		uuid: () => `session-${++sessions}`,
		now: () => new Date('2026-09-03T10:00:00Z'),
		onConnectionChange: jest.fn(),
		...extra,
	});
	created.push(session);
	return {
		session,
		peers,
		signaling,
		setSignals: (next: IncomingSignal[]) => (signals = next),
		setConfig: (next: typeof config) => (currentConfig = next),
	};
}

const signal = (overrides: Partial<IncomingSignal>): IncomingSignal => ({
	id: 1,
	from: 'display',
	to: 'pos:device-1',
	type: 'answer',
	session: 'session-1',
	body: { sdp: 'remote-answer' },
	created_at: '2026-09-03T10:00:00Z',
	...overrides,
});

test('posts an offer from the paired POS device and ignores stale answers', async () => {
	const { session, peers, signaling, setSignals } = setup();
	setSignals([signal({ session: 'stale-session' })]);

	await session.poll();

	expect(signaling.postSignal).toHaveBeenCalledWith('display-1', {
		from: 'pos:device-1',
		to: 'display',
		type: 'offer',
		session: 'session-1',
		body: { sdp: 'local-offer' },
	});
	expect(peers[0].accepted).toEqual([]);
});

test('buffers matching candidates until the answer is accepted, preserving their order', async () => {
	const { session, peers, setSignals } = setup();
	setSignals([
		signal({ id: 2, type: 'candidate', body: { candidate: 'candidate:1' } }),
		signal({ id: 3, type: 'candidate', body: { candidate: 'candidate:2' } }),
		signal({ id: 4 }),
	]);

	await session.poll();

	expect(peers[0].accepted).toEqual(['remote-answer']);
	expect(peers[0].operations).toEqual([
		'answer:remote-answer',
		'candidate:candidate:1',
		'candidate:candidate:2',
	]);
});

test('hello receives an id-correlated config followed by current state at seq 1', async () => {
	const { session, peers } = setup({ action: 'cart.updated', payload: { order: {}, ledger: {} } });
	await session.poll();
	peers[0].open();
	peers[0].message({
		wcpos: 1,
		id: 'hello-id',
		action: 'display.hello',
		payload: { template: { id: 'ledger', version: 2 } },
	});
	const [configuration, replay] = peers[0].sent.map((text) => JSON.parse(text));

	expect(configuration).toEqual({
		wcpos: 1,
		id: 'hello-id',
		action: 'display.config',
		payload: {
			contract: '1.0',
			display: { id: 'display-1', name: 'Counter' },
			store: config.store,
			presentation_hints: config.presentation_hints,
			i18n: config.i18n,
			template: { id: 'ledger', version: 2, settings: {} },
			idle: { afterCompleteMs: 8000 },
		},
	});
	expect(replay.action).toBe('cart.updated');
	expect(replay.payload).toMatchObject({ seq: 1, sentAt: '2026-09-03T10:00:00.000Z' });
});

test('a send failure during hello closes the session without propagating', async () => {
	const { session, peers } = setup();
	await session.poll();
	peers[0].open();
	peers[0].sendError = new Error('channel failed');

	expect(() =>
		peers[0].message({
			wcpos: 1,
			id: 'hello-id',
			action: 'display.hello',
			payload: { template: { id: 'ledger', version: 2 } },
		})
	).not.toThrow();
	expect(peers[0].channelState).toBe('closed');
});

test('posts an offer without crypto.randomUUID', async () => {
	const originalCrypto = globalThis.crypto;
	Object.assign(globalThis, {
		crypto: {
			getRandomValues: (array: Uint8Array) => {
				for (let i = 0; i < array.length; i += 1) array[i] = (i * 37 + 11) % 256;
				return array;
			},
		},
	});
	try {
		const peer = new FakePeer();
		const signaling = {
			postSignal: jest.fn(async () => undefined),
			readSignals: jest.fn(async () => []),
		} as unknown as SignalingClient;
		const session = new DisplaySession({
			display,
			deviceId: 'device-1',
			signaling,
			createPeer: () => peer,
			getConfig: () => config,
			getCurrentState: () => null,
			onConnectionChange: jest.fn(),
		});

		await session.poll();

		expect(signaling.postSignal).toHaveBeenCalledWith(
			'display-1',
			expect.objectContaining({ session: expect.any(String), type: 'offer' })
		);
	} finally {
		Object.assign(globalThis, { crypto: originalCrypto });
	}
});

test('hello accepts and echoes a numeric template id', async () => {
	const { session, peers } = setup(null);
	await session.poll();
	peers[0].open();
	peers[0].message({
		wcpos: 1,
		id: 'numeric-template',
		action: 'display.hello',
		payload: { template: { id: 42, version: 2 } },
	});

	expect(JSON.parse(peers[0].sent[0]).payload.template.id).toBe(42);
});

test('refreshConfig answers a hello received before config is available', async () => {
	const { session, peers, setConfig } = setup(
		{ action: 'cart.updated', payload: { order: {}, ledger: {} } },
		null
	);
	await session.poll();
	peers[0].open();
	peers[0].message({
		wcpos: 1,
		id: 'pending-hello',
		action: 'display.hello',
		payload: { template: { id: 'ledger', version: 2 } },
	});
	expect(peers[0].sent).toEqual([]);

	setConfig(config);
	session.refreshConfig();
	const messages = peers[0].sent.map((text) => JSON.parse(text));
	expect(messages[0]).toMatchObject({ id: 'pending-hello', action: 'display.config' });
	expect(messages[1]).toMatchObject({ action: 'cart.updated', payload: { seq: 1 } });
});

test('sending config again restarts sequence at one', async () => {
	const { session, peers } = setup();
	await session.poll();
	peers[0].open();
	peers[0].message({
		wcpos: 1,
		id: 'first',
		action: 'display.hello',
		payload: { template: { id: 'a', version: 1 } },
	});
	session.publish({ action: 'display.idle', payload: { reason: 'manual' } });
	session.refreshConfig();
	const messages = peers[0].sent.map((text) => JSON.parse(text));
	expect(messages.at(-2).id).toBe('session-2');
	expect(messages.at(-1).payload.seq).toBe(1);
});

test('a close re-offers with a fresh session on the next poll', async () => {
	const { session, peers, signaling } = setup();
	await session.poll();
	peers[0].close();
	await session.poll();

	expect(peers).toHaveLength(2);
	expect(signaling.postSignal).toHaveBeenLastCalledWith(
		'display-1',
		expect.objectContaining({ session: 'session-2', type: 'offer' })
	);
});

test('closes an open channel that never sends a valid hello', async () => {
	jest.useFakeTimers();
	const { session, peers } = setup();
	await session.poll();
	peers[0].open();

	await jest.advanceTimersByTimeAsync(10_000);

	expect(peers[0].channelState).toBe('closed');
	expect(session.isOpen).toBe(false);
	jest.useRealTimers();
});

test('a rejected offer post clears the peer and the next poll re-offers', async () => {
	const { session, peers, signaling } = setup();
	jest.mocked(signaling.postSignal).mockRejectedValueOnce(new Error('temporary failure'));

	await expect(session.poll()).rejects.toThrow('temporary failure');
	expect(peers[0].channelState).toBe('closed');

	await session.poll();
	expect(peers).toHaveLength(2);
	expect(signaling.postSignal).toHaveBeenLastCalledWith(
		'display-1',
		expect.objectContaining({ session: 'session-2', type: 'offer' })
	);
});

test('a rejected answer clears the peer and the next poll re-offers', async () => {
	const { session, peers, signaling, setSignals } = setup();
	await session.poll();
	jest.spyOn(peers[0], 'acceptAnswer').mockRejectedValueOnce(new Error('invalid answer'));
	setSignals([signal({ id: 2 })]);

	await expect(session.poll()).rejects.toThrow('invalid answer');
	expect(session).toHaveProperty('peer', null);
	expect(session).toHaveProperty('sessionId', null);
	expect(peers[0].channelState).toBe('closed');
	expect(mockLoggerWarn).toHaveBeenLastCalledWith('Customer display signaling failed', {
		context: { displayId: 'display-1' },
	});

	await session.poll();
	expect(peers).toHaveLength(2);
	expect(signaling.postSignal).toHaveBeenLastCalledWith(
		'display-1',
		expect.objectContaining({ session: 'session-2', type: 'offer' })
	);
});

test('a rejected buffered candidate clears the peer and the next poll re-offers', async () => {
	const { session, peers, signaling, setSignals } = setup();
	setSignals([signal({ id: 2, type: 'candidate', body: { candidate: 'candidate:1' } })]);
	await session.poll();
	jest.spyOn(peers[0], 'addCandidate').mockRejectedValueOnce(new Error('invalid candidate'));
	setSignals([signal({ id: 3 })]);

	await expect(session.poll()).rejects.toThrow('invalid candidate');
	expect(session).toHaveProperty('peer', null);
	expect(session).toHaveProperty('sessionId', null);
	expect(session).toHaveProperty('pendingCandidates', []);
	expect(peers[0].channelState).toBe('closed');

	await session.poll();
	expect(peers).toHaveLength(2);
	expect(signaling.postSignal).toHaveBeenLastCalledWith(
		'display-1',
		expect.objectContaining({ session: 'session-2', type: 'offer' })
	);
});

test('forget posts bye then closes the peer', async () => {
	const { session, peers, signaling } = setup();
	await session.poll();
	await session.forget();

	expect(signaling.postSignal).toHaveBeenLastCalledWith(
		'display-1',
		expect.objectContaining({ session: 'session-1', type: 'bye' })
	);
	expect(peers[0].channelState).toBe('closed');
});

describe('reconnect', () => {
	const ready = (id: number) => signal({ id, type: 'ready', session: `boot-${id}`, body: {} });
	const offers = (signaling: SignalingClient) =>
		jest.mocked(signaling.postSignal).mock.calls.filter(([, s]) => s.type === 'offer');
	const hello = (peer: FakePeer) => {
		peer.open();
		peer.message({
			wcpos: 1,
			id: 'hello-id',
			action: 'display.hello',
			payload: { template: { id: 'ledger', version: 2 } },
		});
	};
	const pings = (peer: FakePeer) => peer.sent.filter((text) => text === '{"type":"ping"}');
	beforeEach(() => {
		jest.useFakeTimers();
		mockLoggerWarn.mockClear();
	});
	afterEach(() => jest.useRealTimers());

	test('a ready at or below the offer id is stale; a newer one re-offers once', async () => {
		const { session, peers, signaling, setSignals } = setup();
		const offerIds = [10, 13]; // the server's ids only grow, so the re-offer lands above ready 12
		jest.mocked(signaling.postSignal).mockImplementation(async () => offerIds.shift() ?? null);
		await session.poll();
		hello(peers[0]);

		setSignals([ready(4), ready(10)]);
		await session.poll();
		expect(offers(signaling)).toHaveLength(1);
		expect(peers[0].channelState).toBe('open');

		setSignals([ready(12)]);
		await session.poll();
		expect(offers(signaling)).toHaveLength(2);
		expect(peers[0].channelState).toBe('closed');
		expect(offers(signaling)[1][1].session).toBe('session-2');

		setSignals([ready(12)]);
		await session.poll();
		expect(offers(signaling)).toHaveLength(2);
	});

	test('a server that returns no offer id still re-offers at most once per ready', async () => {
		const { session, signaling, setSignals } = setup();
		jest.mocked(signaling.postSignal).mockResolvedValue(null);
		await session.poll();

		setSignals([ready(5)]);
		await session.poll();
		setSignals([ready(5)]);
		await session.poll();
		setSignals([ready(6), ready(7)]);
		await session.poll();

		expect(offers(signaling)).toHaveLength(3);
	});

	test('pings after the config and never times out a display that never pings', async () => {
		const { session, peers } = setup();
		await session.poll();
		hello(peers[0]);
		expect(pings(peers[0])).toHaveLength(0);

		await jest.advanceTimersByTimeAsync(60_000);

		expect(pings(peers[0])).toHaveLength(12);
		expect(session.isOpen).toBe(true);
		session.close();
		expect(jest.getTimerCount()).toBe(0);
	});

	test('a display that pinged and then went silent for 15 s is closed and re-offered', async () => {
		const { session, peers, signaling } = setup();
		await session.poll();
		hello(peers[0]);
		peers[0].message({ type: 'ping' });
		await jest.advanceTimersByTimeAsync(10_000);
		peers[0].message({ type: 'ping' });

		await jest.advanceTimersByTimeAsync(14_999);
		expect(session.isOpen).toBe(true);
		await jest.advanceTimersByTimeAsync(1);
		expect(peers[0].channelState).toBe('closed');

		await session.poll();
		expect(offers(signaling)).toHaveLength(2);
		expect(offers(signaling)[1][1].session).toBe('session-2');
	});

	test('an incoming ping is consumed without a dropped-message warning', async () => {
		const { session, peers } = setup();
		await session.poll();
		hello(peers[0]);
		peers[0].message({ type: 'ping' });

		expect(mockLoggerWarn).not.toHaveBeenCalledWith(
			'Dropped unexpected customer display message',
			expect.anything()
		);
		session.close();
	});

	test('close posts one best-effort bye for the active session', async () => {
		const { session, peers, signaling } = setup();
		await session.poll();
		jest.mocked(signaling.postSignal).mockRejectedValue(new Error('offline'));

		expect(() => session.close()).not.toThrow();
		session.close();
		await jest.advanceTimersByTimeAsync(0);

		const byes = jest.mocked(signaling.postSignal).mock.calls.filter(([, s]) => s.type === 'bye');
		expect(byes).toEqual([
			[
				'display-1',
				{ from: 'pos:device-1', to: 'display', type: 'bye', session: 'session-1', body: {} },
			],
		]);
		expect(peers[0].channelState).toBe('closed');
		expect(mockLoggerDebug).toHaveBeenCalledWith('Customer display bye failed', {
			context: { displayId: 'display-1', error: 'offline' },
		});
	});
});

describe('snapshot fallback', () => {
	const extra = {
		snapshotFallback: true,
		display: { ...display, connected: true },
		now: () => new Date(),
	};
	beforeEach(() => {
		jest.useFakeTimers({ now: new Date('2026-09-03T10:00:00Z') });
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	test('does not post snapshots unless snapshotFallback is set', async () => {
		const getConfig = jest.fn(() => config);
		const getCurrentState = jest.fn(() => ({ action: 'display.idle', payload: {} }));
		const { session, signaling } = setup(undefined, undefined, {
			display: extra.display,
			now: extra.now,
			getConfig,
			getCurrentState,
		});
		await session.poll();
		await jest.advanceTimersByTimeAsync(30_000);

		expect(signaling.postSignal).toHaveBeenCalledTimes(1);
		expect(signaling.postSignal).toHaveBeenCalledWith(
			'display-1',
			expect.objectContaining({ type: 'offer' })
		);
		expect(getConfig).not.toHaveBeenCalled();
		expect(getCurrentState).not.toHaveBeenCalled();
		expect(jest.getTimerCount()).toBe(0);
	});

	test('posts a snapshot after the offer while the channel is not open', async () => {
		const { session, signaling } = setup(undefined, undefined, extra);
		await session.poll();
		await jest.advanceTimersByTimeAsync(1000);
		const snapshots = jest
			.mocked(signaling.postSignal)
			.mock.calls.filter(([, s]) => s.type === 'snapshot');

		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]).toEqual([
			'display-1',
			{
				from: 'pos:device-1',
				to: 'display',
				type: 'snapshot',
				session: 'session-1',
				body: {
					v: 1,
					seq: 1,
					config: {
						contract: '1.0',
						display: { id: 'display-1', name: 'Counter' },
						...config,
						idle: { afterCompleteMs: 8000 },
					},
					event: {
						wcpos: 1,
						action: 'display.idle',
						id: expect.any(String),
						payload: { reason: 'no_cart', seq: 1, sentAt: '2026-09-03T10:00:00.000Z' },
					},
				},
			},
		]);
	});

	test('throttles changes to one post per second, latest state wins', async () => {
		let state: DisplayEvent = { action: 'display.idle', payload: {} };
		const { session, signaling } = setup(undefined, undefined, {
			...extra,
			getCurrentState: () => state,
		});
		await session.poll();
		await jest.advanceTimersByTimeAsync(0);
		for (let count = 1; count <= 3; count += 1) {
			if (count > 1) await jest.advanceTimersByTimeAsync(100);
			state = { action: 'cart.updated', payload: { count } };
			expect(session.publish(state)).toBe(false);
		}
		await jest.advanceTimersByTimeAsync(799);
		expect(signaling.postSignal).toHaveBeenCalledTimes(2);
		await jest.advanceTimersByTimeAsync(201);
		const snapshots = jest
			.mocked(signaling.postSignal)
			.mock.calls.filter(([, s]) => s.type === 'snapshot');

		expect(snapshots).toHaveLength(2);
		const first = snapshots[0][1].body as { seq: number };
		const latest = snapshots[1][1].body as { seq: number; event: DisplayEvent };
		expect(latest.seq).toBeGreaterThan(first.seq);
		expect(latest.event.action).toBe('cart.updated');
		expect(latest.event.payload).toEqual({
			...state.payload,
			seq: latest.seq,
			sentAt: '2026-09-03T10:00:00.200Z',
		});
	});

	test('keeps at most one snapshot post in flight', async () => {
		let state: DisplayEvent = { action: 'display.idle', payload: {} };
		const { session, signaling } = setup(undefined, undefined, {
			...extra,
			getCurrentState: () => state,
		});
		let resolvePost!: () => void;
		const pending = new Promise<void>((resolve) => {
			resolvePost = resolve;
		});
		jest.mocked(signaling.postSignal).mockImplementation(async (_id, signal) => {
			if (signal.type === 'snapshot') await pending;
			return null;
		});
		await session.poll();
		await jest.advanceTimersByTimeAsync(0);
		state = { action: 'cart.updated', payload: { count: 2 } };
		session.publish(state);
		await jest.advanceTimersByTimeAsync(5000);
		expect(signaling.postSignal).toHaveBeenCalledTimes(2);

		resolvePost();
		await jest.advanceTimersByTimeAsync(1000);
		const snapshots = jest
			.mocked(signaling.postSignal)
			.mock.calls.filter(([, s]) => s.type === 'snapshot');
		expect(snapshots).toHaveLength(2);
		expect(snapshots[1][1].body).toMatchObject({
			event: { action: state.action, payload: state.payload },
		});
	});

	test('forget stops snapshots even when the bye post fails', async () => {
		const { session, signaling } = setup(undefined, undefined, extra);
		let resolvePost!: () => void;
		const pending = new Promise<void>((resolve) => {
			resolvePost = resolve;
		});
		jest.mocked(signaling.postSignal).mockImplementation(async (_id, signal) => {
			if (signal.type === 'snapshot') await pending;
			if (signal.type === 'bye') throw new Error('bye failed');
			return null;
		});
		await session.poll();
		await jest.advanceTimersByTimeAsync(0);
		expect(
			jest.mocked(signaling.postSignal).mock.calls.filter(([, s]) => s.type === 'snapshot')
		).toHaveLength(1);

		await expect(session.forget()).rejects.toThrow('bye failed');
		resolvePost();
		await jest.advanceTimersByTimeAsync(25_000);
		expect(
			jest.mocked(signaling.postSignal).mock.calls.filter(([, s]) => s.type === 'snapshot')
		).toHaveLength(1);
	});

	test('re-sends the identical body every 20 seconds while the channel stays shut', async () => {
		const { session, signaling } = setup(undefined, undefined, extra);
		await session.poll();
		await jest.advanceTimersByTimeAsync(0);
		await jest.advanceTimersByTimeAsync(20_000);
		await jest.advanceTimersByTimeAsync(20_000);
		const snapshots = jest
			.mocked(signaling.postSignal)
			.mock.calls.filter(([, s]) => s.type === 'snapshot');

		expect(snapshots).toHaveLength(3);
		const bodies = snapshots.map(([, s]) => JSON.stringify(s.body));
		expect(bodies).toEqual([bodies[0], bodies[0], bodies[0]]);
	});

	test('stops posting once the channel opens', async () => {
		const { session, signaling, peers } = setup(undefined, undefined, extra);
		await session.poll();
		await jest.advanceTimersByTimeAsync(0);
		peers[0].open();
		peers[0].message({
			wcpos: 1,
			id: 'hello-id',
			action: 'display.hello',
			payload: { template: { id: 'ledger', version: 2 } },
		});
		await jest.advanceTimersByTimeAsync(60_000);

		expect(session.isOpen).toBe(true);
		expect(signaling.postSignal).toHaveBeenCalledTimes(2);
	});

	test('resumes with a new seq after an open channel closes', async () => {
		const { session, signaling, peers } = setup(undefined, undefined, extra);
		await session.poll();
		await jest.advanceTimersByTimeAsync(0);
		peers[0].open();
		peers[0].close();
		await session.poll();
		await jest.advanceTimersByTimeAsync(1000);
		const snapshots = jest
			.mocked(signaling.postSignal)
			.mock.calls.filter(([, s]) => s.type === 'snapshot');

		expect(snapshots).toHaveLength(2);
		expect(snapshots[1][1].session).toBe('session-2');
		const first = snapshots[0][1].body as { seq: number };
		const latest = snapshots[1][1].body as { seq: number };
		expect(latest.seq).toBeGreaterThan(first.seq);
	});

	test('does not repost a body the server rejected with 413', async () => {
		let state: DisplayEvent = { action: 'display.idle', payload: {} };
		const { session, signaling } = setup(undefined, undefined, {
			...extra,
			getCurrentState: () => state,
		});
		jest.mocked(signaling.postSignal).mockImplementation(async (_id, signal) => {
			if (signal.type === 'snapshot') {
				throw Object.assign(new Error('too large'), { response: { status: 413 } });
			}
			return null;
		});
		await session.poll();
		await jest.advanceTimersByTimeAsync(60_000);
		expect(signaling.postSignal).toHaveBeenCalledTimes(2);
		expect(mockLoggerWarn).toHaveBeenLastCalledWith('Customer display snapshot failed', {
			context: { displayId: 'display-1', status: 413 },
		});

		state = { action: 'cart.updated', payload: { count: 1 } };
		session.publish(state);
		await jest.advanceTimersByTimeAsync(1000);
		const snapshots = jest
			.mocked(signaling.postSignal)
			.mock.calls.filter(([, s]) => s.type === 'snapshot');
		expect(snapshots).toHaveLength(2);
		const first = snapshots[0][1].body as { seq: number };
		const latest = snapshots[1][1].body as { seq: number };
		expect(latest.seq).toBeGreaterThan(first.seq);
	});

	test('skips a display the registry reports as not connected', async () => {
		const { session, signaling } = setup(undefined, undefined, extra);
		await session.poll();
		session.updateDisplay({ ...display, connected: false });
		await jest.advanceTimersByTimeAsync(30_000);
		expect(signaling.postSignal).toHaveBeenCalledTimes(1);

		session.updateDisplay({ ...display, connected: true });
		await jest.advanceTimersByTimeAsync(1000);
		const snapshots = jest
			.mocked(signaling.postSignal)
			.mock.calls.filter(([, s]) => s.type === 'snapshot');
		expect(snapshots).toHaveLength(1);
	});

	test('close stops the snapshot timer', async () => {
		const { session, signaling } = setup(undefined, undefined, extra);
		await session.poll();
		await jest.advanceTimersByTimeAsync(0);
		session.close();
		await jest.advanceTimersByTimeAsync(60_000);

		const posts = jest.mocked(signaling.postSignal).mock.calls.filter(([, s]) => s.type !== 'bye');
		expect(posts).toHaveLength(2);
		expect(jest.getTimerCount()).toBe(0);
	});
});
