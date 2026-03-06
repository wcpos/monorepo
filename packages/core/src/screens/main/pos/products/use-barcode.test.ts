/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useBarcode } from './use-barcode';

const mockBarcodeSearch = jest.fn();
const mockUseSubscription = jest.fn();

jest.mock('observable-hooks', () => ({
	useObservableEagerState: jest.fn(() => false),
	useSubscription: (...args: any[]) => mockUseSubscription(...args),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		error: jest.fn(),
		success: jest.fn(),
		warn: jest.fn(),
	})),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, params?: Record<string, unknown>) => {
		if (key === 'common.barcode_scanned') {
			return `Barcode scanned: ${params?.barcode}`;
		}
		return key;
	},
}));

jest.mock('../../contexts/storage-health/provider', () => ({
	useStorageHealth: () => ({
		status: 'degraded',
		isDegraded: true,
	}),
}));

jest.mock('../../hooks/barcodes', () => ({
	useBarcodeDetection: () => ({
		barcode$: { subscribe: jest.fn() },
		onKeyPress: jest.fn(),
	}),
	useBarcodeSearch: () => ({
		barcodeSearch: mockBarcodeSearch,
	}),
}));

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: {
			showOutOfStock$: {},
		},
	}),
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => ({
		collection: {
			findOne: jest.fn(() => ({
				exec: jest.fn(),
			})),
		},
	}),
}));

jest.mock('../hooks/use-add-product', () => ({
	useAddProduct: () => ({
		addProduct: jest.fn(),
	}),
}));

jest.mock('../hooks/use-add-variation', () => ({
	useAddVariation: () => ({
		addVariation: jest.fn(),
	}),
}));

const mockLoggerError = (
	(getLogger as unknown as jest.Mock).mock.results[0].value as {
		error: jest.Mock;
	}
).error;

describe('useBarcode', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('does not search products when storage health is degraded', async () => {
		let callback: ((barcode: unknown) => Promise<void>) | undefined;
		mockUseSubscription.mockImplementation((_stream, next) => {
			callback = next;
		});

		const productQuery = {
			search: jest.fn(),
		};
		const querySearchInputRef = {
			current: {
				setSearch: jest.fn(),
				onSearch: jest.fn(),
			},
		};

		renderHook(() => useBarcode(productQuery as any, querySearchInputRef as any));

		await act(async () => {
			await callback?.('123456');
		});

		expect(mockBarcodeSearch).not.toHaveBeenCalled();
		expect(mockLoggerError).toHaveBeenCalled();
		expect(productQuery.search).not.toHaveBeenCalled();
	});
});
