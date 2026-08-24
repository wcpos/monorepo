/**
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';

import { useHidScan } from './use-hid-scan.web';

const mockUpsert = jest.fn(async (_row: unknown) => undefined);
const mockRequestDevice = jest.fn();

jest.mock('@wcpos/query', () => ({
	useDocField: () => 3,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: jest.fn() }),
}));

jest.mock('@wcpos/scanner', () => ({
	...jest.requireActual('@wcpos/scanner'),
	createScanSession: () => ({ offer: jest.fn(), reset: jest.fn() }),
	isWebHidSupported: () => true,
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => ({
		collection: {
			find: () => ({ exec: async () => [] }),
			upsert: (row: unknown) => mockUpsert(row),
		},
	}),
}));

describe('useHidScan (web)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		Object.defineProperty(navigator, 'hid', {
			configurable: true,
			value: {
				requestDevice: mockRequestDevice,
				getDevices: jest.fn(async () => []),
			},
		});
	});

	it('leaves the stored device name empty when WebHID reports no product name', async () => {
		const device = {
			vendorId: 1234,
			productId: 5678,
			open: jest.fn(async () => undefined),
			close: jest.fn(async () => undefined),
			addEventListener: jest.fn(),
			removeEventListener: jest.fn(),
		};
		mockRequestDevice.mockResolvedValue([device]);
		const { result } = renderHook(() => useHidScan(jest.fn()));

		await act(async () => result.current.connect());

		expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ deviceName: '' }));
		await act(async () => result.current.disconnect());
	});
});
