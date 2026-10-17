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
