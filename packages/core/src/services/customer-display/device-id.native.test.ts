/** @jest-environment node */

test('persists one native device id and remains stable across calls', async () => {
	jest.resetModules();
	const read = jest.fn().mockRejectedValue(new Error('missing'));
	const write = jest.fn().mockResolvedValue(undefined);
	jest.doMock('expo-file-system/legacy', () => ({
		documentDirectory: 'file:///documents/',
		readAsStringAsync: read,
		writeAsStringAsync: write,
	}));
	jest.doMock('expo-crypto', () => ({ randomUUID: () => 'native-install-id' }));
	const { getDeviceId } = await import('./device-id.native');

	await expect(getDeviceId()).resolves.toBe('native-install-id');
	await expect(getDeviceId()).resolves.toBe('native-install-id');
	expect(read).toHaveBeenCalledTimes(1);
	expect(write).toHaveBeenCalledWith('file:///documents/wcpos_install_id', 'native-install-id');
});
