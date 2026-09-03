/** @jest-environment node */

import { CustomerDisplayService } from './service';

import type { OffererPeer } from './peer';
import type { DisplayRegistryRow, HttpFunction } from './signaling-client';

const mockLoggerWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: (...args: unknown[]) => mockLoggerWarn(...args) }),
}));

class FakePeer implements OffererPeer {
	channelState: 'connecting' | 'open' | 'closed' = 'connecting';
	sent: string[] = [];
	sendError?: Error;
	private openListener: () => void = () => undefined;
	private messageListener: (text: string) => void = () => undefined;
	private closeListener: () => void = () => undefined;
	async createOffer() {
		return { sdp: 'offer' };
	}
	async acceptAnswer() {}
	async addCandidate() {}
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
	open(configured = true) {
		this.channelState = 'open';
		this.openListener();
		if (configured)
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

const registryRow = (id: string, storeId = 7): DisplayRegistryRow => ({
	id,
	name: id,
	device_id: 'device-1',
	store_id: storeId,
	paired_at: 1788429600,
	last_seen: 1788429600,
	connected: false,
});

function setup(initialDisplays: DisplayRegistryRow[] = []) {
	let displays = initialDisplays;
	let registryFailures = 0;
	let byeFailures = 0;
	let deleteFailures = 0;
	const signalReadFailures = new Set<string>();
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
			if ([...signalReadFailures].some((id) => request.url.endsWith(`/${id}/signal`))) {
				signalReadFailures.delete(request.url.split('/').at(-2)!);
				throw new Error('signal unavailable');
			}
		if (request.method === 'GET' && request.url.endsWith('/signal'))
			return { data: { messages: [] } as T };
		if (request.method === 'DELETE' && deleteFailures > 0) {
			deleteFailures -= 1;
			throw new Error('delete unavailable');
		}
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
		failDeletes: (count = 1) => (deleteFailures = count),
		failSignalRead: (id: string) => signalReadFailures.add(id),
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

	test('continues polling other displays when one session poll fails', async () => {
		const { service, requests, failSignalRead } = setup([registryRow('one'), registryRow('two')]);
		failSignalRead('one');

		await expect(service.refreshDisplays()).resolves.toBeUndefined();

		expect(
			requests
				.filter(({ method, url }) => method === 'GET' && url.endsWith('/signal'))
				.map(({ url }) => url)
		).toEqual(['/wcpos/v2/display/displays/one/signal', '/wcpos/v2/display/displays/two/signal']);
		expect(mockLoggerWarn).toHaveBeenCalledWith('Customer display session poll failed', {
			context: { displayId: 'one', error: expect.any(Error) },
		});
		service.stop();
	});

	test('only creates sessions for this store and unscoped displays', async () => {
		const { service, peers } = setup([
			registryRow('mine', 7),
			registryRow('unscoped', 0),
			registryRow('other', 8),
		]);

		await service.refreshDisplays();

		expect(service.getState().displays.map(({ id }) => id)).toEqual(['mine', 'unscoped']);
		expect(peers).toHaveLength(2);
		service.stop();
	});

	test('keeps registry polling scheduled while an open session is unconfigured', async () => {
		const { service, peers, requests } = setup([registryRow('one')]);
		await service.refreshDisplays();
		peers[0].open(false);
		const registryReads = requests.filter(({ url }) => url.endsWith('/displays')).length;

		await jest.advanceTimersByTimeAsync(5000);

		expect(requests.filter(({ url }) => url.endsWith('/displays'))).toHaveLength(registryReads + 1);
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

	test('keeps an open session connected when the registry row is stale', async () => {
		const { service, peers } = setup([registryRow('one')]);
		await service.refreshDisplays();
		peers[0].open();

		await service.refreshDisplays();

		expect(service.getState().displays[0].connected).toBe(true);
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

	test('emits when an expired pairing code is cleared', async () => {
		const { service, advance } = setup();
		await service.mintPairingCode();
		const listener = jest.fn();
		service.subscribe(listener);

		advance(600_001);
		expect(service.getState().pairingCode).toBeNull();

		expect(listener).toHaveBeenCalledTimes(1);
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

	test('continues publishing when one display transport throws', async () => {
		const { service, peers } = setup([registryRow('one'), registryRow('two')]);
		await service.refreshDisplays();
		peers.forEach((peer) => peer.open());
		const secondBefore = peers[1].sent.length;
		peers[0].sendError = new Error('channel send failed');

		expect(() =>
			service.publish({ action: 'cart.updated', payload: { order: { id: 1 }, ledger: {} } })
		).not.toThrow();

		expect(peers[0].channelState).toBe('closed');
		expect(peers[1].sent).toHaveLength(secondBefore + 1);
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

	test('keeps the newer registry result when refresh and pairing reads resolve in reverse order', async () => {
		const resolvers: ((value: { data: DisplayRegistryRow[] }) => void)[] = [];
		const http: HttpFunction = async <T>(request: Parameters<HttpFunction>[0]) => {
			if (request.method === 'GET' && request.url.endsWith('/displays')) {
				return new Promise<{ data: T }>((resolve) => {
					resolvers.push(resolve as (value: { data: DisplayRegistryRow[] }) => void);
				});
			}
			if (request.url.endsWith('/pairings')) {
				return { data: { code: '123456', expires_at: 1788430200 } as T };
			}
			return { data: { messages: [] } as T };
		};
		const service = new CustomerDisplayService({
			http,
			deviceId: 'device-1',
			storeId: 7,
			siteRestRoot: '/wcpos/v2/display',
			createPeer: () => new FakePeer(),
		});

		const olderRefresh = service.refreshDisplays();
		const newerPairing = service.mintPairingCode();
		resolvers[1]({ data: [registryRow('newer')] });
		await newerPairing;
		resolvers[0]({ data: [registryRow('older')] });
		await olderRefresh;

		expect(service.getState().displays.map(({ id }) => id)).toEqual(['newer']);
		service.stop();
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

	test('a failed registry delete recreates the stopped display session on refresh', async () => {
		const { service, peers, failDeletes } = setup([registryRow('one')]);
		await service.refreshDisplays();
		failDeletes();

		await expect(service.forget('one')).rejects.toThrow('delete unavailable');
		expect(service.getState().displays).toEqual([registryRow('one')]);
		expect(jest.getTimerCount()).toBe(1);

		await service.refreshDisplays();
		expect(peers).toHaveLength(2);
		service.stop();
	});
});
