/** @jest-environment node */

describe('getDeviceId', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	test('reuses wcpos_install_id and is stable across calls', async () => {
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
		expect(getItem).toHaveBeenCalledTimes(1);
	});

	test('persists a new browser install id', async () => {
		const setItem = jest.fn();
		Object.assign(globalThis, {
			window: {
				localStorage: { getItem: () => null, setItem },
				crypto: { randomUUID: () => 'new-install' },
			},
		});
		const { getDeviceId } = await import('./device-id');

		await expect(getDeviceId()).resolves.toBe('new-install');
		expect(setItem).toHaveBeenCalledWith('wcpos_install_id', 'new-install');
	});
});
