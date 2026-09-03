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
	let now = new Date('2026-09-03T10:00:00Z');
	const requests: Parameters<HttpFunction>[0][] = [];
	const http: HttpFunction = async <T>(request: Parameters<HttpFunction>[0]) => {
		requests.push(request);
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
});
