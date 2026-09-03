/** @jest-environment jsdom */

const mockUuid = jest.fn(() => 'new-device-id');

jest.mock('uuid', () => ({ v4: () => mockUuid() }));

describe('getDeviceId on web', () => {
	beforeEach(() => {
		jest.resetModules();
		window.localStorage.clear();
		mockUuid.mockClear();
	});

	it('mints once, persists, and memoises the device id', async () => {
		const { getDeviceId } = await import('./device-id.web');

		await expect(getDeviceId()).resolves.toBe('new-device-id');
		await expect(getDeviceId()).resolves.toBe('new-device-id');
		expect(window.localStorage.getItem('wcpos_device_id')).toBe('new-device-id');
		expect(mockUuid).toHaveBeenCalledTimes(1);
	});

	it('reuses the persisted id after a module reload', async () => {
		window.localStorage.setItem('wcpos_device_id', 'saved-device-id');
		const { getDeviceId } = await import('./device-id.web');

		await expect(getDeviceId()).resolves.toBe('saved-device-id');
		expect(mockUuid).not.toHaveBeenCalled();
	});
});
