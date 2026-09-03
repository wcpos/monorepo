let mockStored: string | undefined;
const mockWrite = jest.fn((value: string) => {
	mockStored = value;
});
const mockUuid = jest.fn(() => 'native-device-id');

jest.mock('expo-file-system', () => ({
	Paths: { document: 'documents' },
	File: class {
		get exists() {
			return mockStored !== undefined;
		}
		async text() {
			return mockStored ?? '';
		}
		write(value: string) {
			mockWrite(value);
		}
	},
}));
jest.mock('uuid', () => ({ v4: () => mockUuid() }));

describe('getDeviceId on native', () => {
	beforeEach(() => {
		jest.resetModules();
		mockStored = undefined;
		mockWrite.mockClear();
		mockUuid.mockClear();
	});

	it('mints, persists, and memoises one id', async () => {
		const { getDeviceId } = await import('./device-id');
		await expect(getDeviceId()).resolves.toBe('native-device-id');
		await expect(getDeviceId()).resolves.toBe('native-device-id');
		expect(mockWrite).toHaveBeenCalledTimes(1);
		expect(mockStored).toBe('native-device-id');
		expect(mockUuid).toHaveBeenCalledTimes(1);
	});
});
