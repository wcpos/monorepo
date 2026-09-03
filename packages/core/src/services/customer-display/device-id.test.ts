/** @jest-environment node */

describe('getDeviceId', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	test('reuses the display device id and is stable across calls', async () => {
		const getItem = jest.fn(() => 'existing-install');
		Object.assign(globalThis, {
			window: {
				localStorage: { getItem, setItem: jest.fn() },
				crypto: { randomUUID: jest.fn(() => 'new-install') },
			},
		});
		const { getDeviceId } = await import('./device-id');

		await expect(getDeviceId()).resolves.toBe('existing-install');
		await expect(getDeviceId()).resolves.toBe('existing-install');
		expect(getItem).toHaveBeenCalledWith('wcpos_display_device_id');
		expect(getItem).toHaveBeenCalledTimes(1);
	});

	test('persists a fallback v4 id under the display-specific key without randomUUID', async () => {
		const setItem = jest.fn();
		Object.assign(globalThis, {
			crypto: {
				getRandomValues: (array: Uint8Array) => {
					for (let i = 0; i < array.length; i += 1) array[i] = (i * 37 + 11) % 256;
					return array;
				},
			},
			window: {
				localStorage: { getItem: () => null, setItem },
				crypto: {},
			},
		});
		const { getDeviceId } = await import('./device-id');

		const id = await getDeviceId();
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(setItem).toHaveBeenCalledWith('wcpos_display_device_id', id);
	});

	test('retries after device id storage fails', async () => {
		const getItem = jest.fn().mockImplementationOnce(() => {
			throw new Error('storage unavailable');
		});
		Object.assign(globalThis, {
			crypto: { randomUUID: () => 'new-display-id' },
			window: {
				localStorage: { getItem, setItem: jest.fn() },
				crypto: { randomUUID: () => 'new-display-id' },
			},
		});
		const { getDeviceId } = await import('./device-id');

		await expect(getDeviceId()).rejects.toThrow('storage unavailable');
		await expect(getDeviceId()).resolves.toBe('new-display-id');
		expect(getItem).toHaveBeenCalledTimes(2);
	});
});
