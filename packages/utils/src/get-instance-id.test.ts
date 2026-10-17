/** @jest-environment jsdom */
type GetInstanceId = typeof import('./get-instance-id.web').getInstanceId;

describe('getInstanceId (web)', () => {
	let getInstanceId: GetInstanceId;
	beforeEach(() => {
		window.localStorage.clear();
		// The id is memoised per process; each test starts from a fresh module.
		jest.isolateModules(() => {
			({ getInstanceId } =
				jest.requireActual<typeof import('./get-instance-id.web')>('./get-instance-id.web'));
		});
	});

	it('mints once and returns the same id afterwards, under its own key', async () => {
		const first = await getInstanceId();
		expect(first).toMatch(/^[0-9a-f-]{36}$/);
		expect(await getInstanceId()).toBe(first);
		expect(window.localStorage.getItem('wcpos_instance_id')).toBe(first);
		// Not the telemetry id: consent denial removes that one, never this.
		expect(window.localStorage.getItem('wcpos_install_id')).toBeNull();
	});

	it('serializes concurrent first calls with the cross-tab lock', async () => {
		let queue = Promise.resolve<string | undefined>(undefined);
		const request = jest.fn((_name: string, read: () => string | undefined) => {
			return (queue = queue.then(read));
		});
		Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
		try {
			const ids = await Promise.all([getInstanceId(), getInstanceId()]);
			expect(ids[0]).toBeTruthy();
			expect(ids[1]).toBe(ids[0]);
			expect(request).toHaveBeenCalledWith('wcpos-instance-id', expect.any(Function));
		} finally {
			Reflect.deleteProperty(navigator, 'locks');
		}
	});

	it('re-reads the winner after minting without locks', async () => {
		const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
		const read = jest
			.spyOn(Storage.prototype, 'getItem')
			.mockReturnValueOnce(null)
			.mockReturnValue('winner');
		expect(await getInstanceId()).toBe('winner');
		write.mockRestore();
		read.mockRestore();
	});

	it('converges unlocked tab memos and storage despite delayed channel delivery', async () => {
		jest.useFakeTimers();
		const channels: DelayedChannel[] = [];
		class DelayedChannel {
			onmessage: ((event: { data: unknown }) => void) | null = null;
			constructor() {
				channels.push(this);
			}
			postMessage(data: unknown) {
				for (const peer of channels.filter((peer) => peer !== this))
					setTimeout(() => peer.onmessage?.({ data }), 100);
			}
			close() {
				this.onmessage = null;
			}
		}
		const second = jest.requireActual<{ getInstanceId: GetInstanceId }>(
			'./get-instance-id.web'
		).getInstanceId;
		Object.defineProperty(globalThis, 'BroadcastChannel', {
			configurable: true,
			value: DelayedChannel,
		});
		const a = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
		const b = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
		const candidates: ReturnType<Crypto['randomUUID']>[] = [b, a];
		const mint = jest
			.spyOn(window.crypto, 'randomUUID')
			.mockImplementation(() => candidates.shift() ?? a);
		const read = jest
			.spyOn(Storage.prototype, 'getItem')
			.mockReturnValueOnce(null)
			.mockReturnValueOnce(b)
			.mockReturnValueOnce(b)
			.mockReturnValueOnce(null);
		try {
			const first = getInstanceId();
			await jest.advanceTimersByTimeAsync(60);
			const other = second();
			await jest.advanceTimersByTimeAsync(110);
			expect(await getInstanceId()).toBe(a);
			await jest.advanceTimersByTimeAsync(500);
			await Promise.all([first, other]);
			expect(await getInstanceId()).toBe(a);
			expect(await second()).toBe(a);
			expect(window.localStorage.getItem('wcpos_instance_id')).toBe(a);
		} finally {
			jest.useRealTimers();
			read.mockRestore();
			mint.mockRestore();
			jest.resetModules();
			Reflect.deleteProperty(globalThis, 'BroadcastChannel');
		}
	});

	it('settles with the smallest candidate when an announced peer never acknowledges', async () => {
		jest.useFakeTimers();
		const channel = { onmessage: (_event: { data: unknown }) => {}, postMessage() {}, close() {} };
		Object.defineProperty(globalThis, 'BroadcastChannel', {
			configurable: true,
			value: jest.fn(() => channel),
		});
		window.localStorage.setItem('wcpos_instance_id', 'c');
		try {
			let result: string | undefined;
			const pending = getInstanceId().then((id) => (result = id));
			channel.onmessage({ data: { candidate: 'b', nonce: 'departed-peer' } });
			await jest.advanceTimersByTimeAsync(299);
			expect(result).toBeUndefined();
			await jest.advanceTimersByTimeAsync(1);
			expect(result).toBe('b');
			await pending;
			expect(await getInstanceId()).toBe('b');
			expect(window.localStorage.getItem('wcpos_instance_id')).toBe('b');
			channel.onmessage({ data: { candidate: 'a', nonce: 'late-peer' } });
			expect(await getInstanceId()).toBe('a');
			expect(window.localStorage.getItem('wcpos_instance_id')).toBe('a');
		} finally {
			jest.useRealTimers();
			Reflect.deleteProperty(globalThis, 'BroadcastChannel');
		}
	});

	it('returns undefined when storage throws', async () => {
		const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(await getInstanceId()).toBeUndefined();
		spy.mockRestore();
	});
});

it('falls back to persistent storage when Web Locks rejects', async () => {
	window.localStorage.clear();
	Object.defineProperty(navigator, 'locks', {
		configurable: true,
		value: { request: () => Promise.reject(new Error('SecurityError')) },
	});
	try {
		const { getInstanceId } = await import('./get-instance-id.web');
		const id = await getInstanceId();
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		expect(window.localStorage.getItem('wcpos_instance_id')).toBe(id);
	} finally {
		Reflect.deleteProperty(navigator, 'locks');
	}
});

it('loads the root barrel without native Expo modules', () => {
	jest.isolateModules(() => {
		jest.doMock(
			'expo-file-system',
			() => {
				throw new Error('Native Expo module loaded');
			},
			{ virtual: true }
		);
		expect(() => jest.requireActual('./index')).not.toThrow();
	});
});
