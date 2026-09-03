/** @jest-environment node */

import { type DisplayEvent, DisplaySession } from './display-session';

import type { OffererPeer } from './peer';
import type { DisplayRegistryRow, IncomingSignal, SignalingClient } from './signaling-client';

class FakePeer implements OffererPeer {
	channelState: 'connecting' | 'open' | 'closed' = 'connecting';
	sent: string[] = [];
	accepted: string[] = [];
	candidates: RTCIceCandidateInit[] = [];
	private openListener: () => void = () => undefined;
	private messageListener: (text: string) => void = () => undefined;
	private closeListener: () => void = () => undefined;

	async createOffer() {
		return { sdp: 'local-offer' };
	}
	async acceptAnswer(sdp: string) {
		this.accepted.push(sdp);
	}
	async addCandidate(candidate: RTCIceCandidateInit) {
		this.candidates.push(candidate);
	}
	send(text: string) {
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

function setup(
	currentState: DisplayEvent | null = { action: 'display.idle', payload: { reason: 'no_cart' } },
	initialConfig: typeof config | null = config
) {
	const peers: FakePeer[] = [];
	let signals: IncomingSignal[] = [];
	let currentConfig = initialConfig;
	const signaling = {
		postSignal: jest.fn(async () => undefined),
		readSignals: jest.fn(async () => signals.splice(0)),
	} as unknown as SignalingClient;
	const ids = ['session-1', 'session-2'];
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
		uuid: () => ids.shift()!,
		now: () => new Date('2026-09-03T10:00:00Z'),
		onConnectionChange: jest.fn(),
	});
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

test('accepts the matching answer and candidate', async () => {
	const { session, peers, setSignals } = setup();
	setSignals([
		signal({ id: 2 }),
		signal({ id: 3, type: 'candidate', body: { candidate: 'candidate:1' } }),
	]);

	await session.poll();

	expect(peers[0].accepted).toEqual(['remote-answer']);
	expect(peers[0].candidates).toEqual([{ candidate: 'candidate:1' }]);
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
