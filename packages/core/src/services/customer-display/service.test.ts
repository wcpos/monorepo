/** @jest-environment node */

import { CustomerDisplayService } from './service';

import type { OffererPeer } from './peer';
import type { DisplayRegistryRow, HttpFunction } from './signaling-client';

class FakePeer implements OffererPeer {
	channelState: 'connecting' | 'open' | 'closed' = 'connecting';
	sent: string[] = [];
	private openListener: () => void = () => undefined;
	private messageListener: (text: string) => void = () => undefined;
	private closeListener: () => void = () => undefined;
	async createOffer() {
		return { sdp: 'offer' };
	}
	async acceptAnswer() {}
	async addCandidate() {}
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
		this.messageListener(
			JSON.stringify({
				wcpos: 1,
				id: `hello-${Math.random()}`,
				action: 'display.hello',
				payload: { template: { id: 'ledger', version: 1 } },
			})
		);
	}
}

const registryRow = (id: string): DisplayRegistryRow => ({
	id,
	name: id,
	device_id: 'device-1',
	store_id: 7,
	paired_at: 1788429600,
	last_seen: 1788429600,
	connected: false,
});

function setup(initialDisplays: DisplayRegistryRow[] = []) {
	let displays = initialDisplays;
	let registryFailures = 0;
	let byeFailures = 0;
	let now = new Date('2026-09-03T10:00:00Z');
	const requests: Parameters<HttpFunction>[0][] = [];
	const http: HttpFunction = async <T>(request: Parameters<HttpFunction>[0]) => {
		requests.push(request);
		if ((request.data as { type?: unknown } | undefined)?.type === 'bye' && byeFailures > 0) {
			byeFailures -= 1;
			throw new Error('bye unavailable');
		}
		if (request.method === 'GET' && request.url.endsWith('/displays')) {
			if (registryFailures > 0) {
				registryFailures -= 1;
				throw new Error('network unavailable');
			}
			return { data: displays as T };
		}
		if (request.method === 'GET' && request.url.endsWith('/signal'))
			return { data: { messages: [] } as T };
		if (request.url.endsWith('/pairings')) {
			return { data: { code: '123456', expires_at: 1788430200 } as T };
		}
		return { data: {} as T };
	};
	const peers: FakePeer[] = [];
	const service = new CustomerDisplayService({
		http,
		deviceId: 'device-1',
		storeId: 7,
		siteRestRoot: '/wcpos/v2/display',
		createPeer: () => {
			const peer = new FakePeer();
			peers.push(peer);
			return peer;
		},
		now: () => now,
	});
	service.configure({
		store: { id: 7, name: 'Shop', currency: 'EUR', locale: 'en-IE' },
		presentation_hints: {},
		i18n: {},
	});
	return {
		service,
		peers,
		requests,
		setDisplays: (next: DisplayRegistryRow[]) => (displays = next),
		failRegistryReads: (count = 1) => (registryFailures = count),
		failByes: (count = 1) => (byeFailures = count),
		advance: (milliseconds: number) => (now = new Date(now.getTime() + milliseconds)),
	};
}

describe('CustomerDisplayService', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	test('polls only while a display is disconnected', async () => {
		const { service, peers } = setup([registryRow('one')]);
		await service.refreshDisplays();
		expect(jest.getTimerCount()).toBe(1);

		peers[0].open();
		expect(jest.getTimerCount()).toBe(0);
		service.stop();
	});

	test('updates registry state when a session opens without another registry poll', async () => {
		const { service, peers, requests } = setup([registryRow('one')]);
		await service.refreshDisplays();
		const registryReads = requests.filter(({ url }) => url.endsWith('/displays')).length;

		peers[0].open();

		expect(service.getState().displays[0].connected).toBe(true);
		expect(requests.filter(({ url }) => url.endsWith('/displays'))).toHaveLength(registryReads);
		service.stop();
	});

	test('keeps polling until the first registry read succeeds', async () => {
		const { service, requests, failRegistryReads } = setup();
		failRegistryReads();

		await expect(service.refreshDisplays()).rejects.toThrow('network unavailable');
		expect(jest.getTimerCount()).toBe(1);
		await jest.advanceTimersByTimeAsync(5000);

		expect(requests.filter(({ url }) => url.endsWith('/displays'))).toHaveLength(2);
		expect(jest.getTimerCount()).toBe(0);
		service.stop();
	});

	test('an outstanding pairing code keeps polling until a new display appears', async () => {
		const { service, setDisplays } = setup();
		await service.refreshDisplays();
		expect(jest.getTimerCount()).toBe(0);

		await service.mintPairingCode();
		expect(service.getState().pairingCode?.code).toBe('123456');
		expect(jest.getTimerCount()).toBe(1);

		setDisplays([registryRow('new')]);
		await service.refreshDisplays();
		expect(service.getState().pairingCode).toBeNull();
		service.stop();
	});

	test('uses a fresh registry baseline when minting before the first refresh', async () => {
		const { service } = setup([registryRow('existing')]);

		await service.mintPairingCode();
		await service.refreshDisplays();

		expect(service.getState().pairingCode?.code).toBe('123456');
		service.stop();
	});

	test('does not mint a pairing code after stop', async () => {
		const { service, requests } = setup();
		service.stop();

		await expect(service.mintPairingCode()).resolves.toBeNull();
		expect(requests).toEqual([]);
	});

	test('expires a pairing code using its unix-seconds timestamp', async () => {
		const { service, advance } = setup();
		await service.mintPairingCode();

		expect(service.getState().pairingCode?.code).toBe('123456');
		advance(600_001);
		expect(service.getState().pairingCode).toBeNull();
		service.stop();
	});

	test('fans out to two configured sessions and deduplicates equal payloads', async () => {
		const { service, peers } = setup([registryRow('one'), registryRow('two')]);
		await service.refreshDisplays();
		peers.forEach((peer) => peer.open());
		const before = peers.map((peer) => peer.sent.length);

		service.publish({ action: 'cart.updated', payload: { order: { id: 1 }, ledger: {} } });
		service.publish({ action: 'cart.updated', payload: { order: { id: 1 }, ledger: {} } });

		expect(peers.map((peer, index) => peer.sent.length - before[index])).toEqual([1, 1]);
		expect(peers.map((peer) => JSON.parse(peer.sent.at(-1)!).action)).toEqual([
			'cart.updated',
			'cart.updated',
		]);
		service.stop();
	});

	test('publishes held idle after the complete window and replaces it with a later publish', async () => {
		const { service, peers, advance } = setup([registryRow('one')]);
		await service.refreshDisplays();
		peers[0].open();
		service.publish({ action: 'payment.state', payload: { state: 'complete' } });
		const afterComplete = peers[0].sent.length;

		service.publish({ action: 'display.idle', payload: { reason: 'no_cart' } });
		expect(peers[0].sent).toHaveLength(afterComplete);
		service.publish({ action: 'cart.updated', payload: { order: {}, ledger: {} } });
		expect(peers[0].sent).toHaveLength(afterComplete + 1);
		expect(jest.getTimerCount()).toBe(0);

		service.publish({ action: 'payment.state', payload: { state: 'complete' } });
		service.publish({ action: 'display.idle', payload: { reason: 'no_cart' } });
		advance(8000);
		await jest.advanceTimersByTimeAsync(8000);
		expect(JSON.parse(peers[0].sent.at(-1)!).action).toBe('display.idle');
		service.stop();
	});

	test('a new cart cancels the completed-order idle suppression window', async () => {
		const { service, peers } = setup([registryRow('one')]);
		await service.refreshDisplays();
		peers[0].open();
		service.publish({ action: 'payment.state', payload: { state: 'complete' } });
		service.publish({ action: 'cart.updated', payload: { order: {}, ledger: {} } });

		expect(service.publish({ action: 'display.idle', payload: { reason: 'no_cart' } })).toBe(true);
		expect(JSON.parse(peers[0].sent.at(-1)!).action).toBe('display.idle');
		service.stop();
	});

	test('stop ignores a pending registry response and future refreshes', async () => {
		let resolveList!: (value: { data: DisplayRegistryRow[] }) => void;
		const httpMock = jest.fn(
			() =>
				new Promise<{ data: DisplayRegistryRow[] }>((resolve) => {
					resolveList = resolve;
				})
		);
		const http = httpMock as unknown as HttpFunction;
		const createPeer = jest.fn(() => new FakePeer());
		const service = new CustomerDisplayService({
			http,
			deviceId: 'device-1',
			storeId: 7,
			siteRestRoot: '/wcpos/v2/display',
			createPeer,
		});
		const refresh = service.refreshDisplays();

		service.stop();
		resolveList({ data: [registryRow('late')] });
		await refresh;
		expect(createPeer).not.toHaveBeenCalled();

		httpMock.mockClear();
		await service.refreshDisplays();
		expect(httpMock).not.toHaveBeenCalled();
	});

	test('stop clears a held-idle timer', async () => {
		const { service, peers } = setup([registryRow('one')]);
		await service.refreshDisplays();
		peers[0].open();
		service.publish({ action: 'payment.state', payload: { state: 'complete' } });
		service.publish({ action: 'display.idle', payload: { reason: 'no_cart' } });
		expect(jest.getTimerCount()).toBe(1);

		service.stop();

		expect(jest.getTimerCount()).toBe(0);
	});

	test('forget removes the display after sending signaling bye', async () => {
		const { service, requests } = setup([registryRow('one')]);
		await service.refreshDisplays();
		await service.forget('one');

		expect(requests).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ method: 'POST', url: expect.stringMatching(/one\/signal$/) }),
				expect.objectContaining({ method: 'DELETE', url: expect.stringMatching(/displays\/one$/) }),
			])
		);
		expect(service.getState().displays).toEqual([]);
		service.stop();
	});

	test('a failed forget keeps the display registered and schedules a reconnect poll', async () => {
		const { service, peers, failByes } = setup([registryRow('one')]);
		await service.refreshDisplays();
		failByes();

		await expect(service.forget('one')).rejects.toThrow('bye unavailable');

		expect(service.getState().displays).toEqual([registryRow('one')]);
		expect(peers[0].channelState).toBe('closed');
		expect(jest.getTimerCount()).toBe(1);
		await jest.advanceTimersByTimeAsync(5000);
		expect(peers).toHaveLength(2);
		service.stop();
	});
});
