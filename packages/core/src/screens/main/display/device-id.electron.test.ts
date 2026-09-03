/** @jest-environment jsdom */

describe('getDeviceId on Electron', () => {
	it('returns the preload install id', async () => {
		Object.assign(window, { electron: { installId: 'electron-install-id' } });
		const { getDeviceId } = await import('./device-id.electron');

		await expect(getDeviceId()).resolves.toBe('electron-install-id');
	});
});
