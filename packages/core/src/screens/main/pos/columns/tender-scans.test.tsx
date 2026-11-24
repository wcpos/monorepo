/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';
import { Subject } from 'rxjs';

import type { ScanEvent } from '@wcpos/scanner';

import { TenderScans } from './tender-scans';

// #3506: the checkout column's scan consumer runs the real `useBarcode` over these seams.
const mockScans = new Subject<ScanEvent>();
const mockBarcodeSearch = jest.fn();
const mockAddProduct = jest.fn();
const mockFetcher = jest.fn();
const mockFeedback = {
	searchingOnline: jest.fn(),
	added: jest.fn(),
	addFailed: jest.fn(),
	notFound: jest.fn(),
	ambiguous: jest.fn(),
	chooseVariation: jest.fn(),
	error: jest.fn(),
	outOfStock: jest.fn(),
	unavailable: jest.fn(),
	storageUnavailable: jest.fn(),
};

jest.mock('@wcpos/utils/logger', () => {
	const logger = { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
	return {
		getErrorMessage: (error: unknown) => String(error),
		getLogger: () => ({ ...logger, success: jest.fn() }),
		__logger: logger,
	};
});
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
	useQueryRuntime: () => ({
		engine: {
			status: () => ({ connectivity: 'online', gatedBy: null }),
			hostTransport: () => ({
				syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
				fetcher: mockFetcher,
			}),
		},
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { showOutOfStock: true } }),
}));
jest.mock('../use-till-location', () => ({ useTillLocation: () => ({ inPos: true }) }));
jest.mock('../../hooks/barcodes', () => ({
	useBarcodeDetection: () => ({ scanEvents$: mockScans, onKeyPress: jest.fn() }),
}));
jest.mock('../../hooks/barcodes/use-barcode-search', () => ({
	useBarcodeSearch: () => ({ barcodeSearch: mockBarcodeSearch, findProductById: jest.fn() }),
}));
jest.mock('../hooks/use-add-product', () => ({
	useAddProduct: () => ({ addProduct: mockAddProduct }),
	showCountingNotice: jest.fn(),
}));
jest.mock('../hooks/use-add-variation', () => ({
	useAddVariation: () => ({ addVariation: jest.fn() }),
}));
jest.mock('../hooks/use-action-context', () => ({
	useActionContext: () => ({ readCounting: async () => false, readPriceCheck: async () => false }),
}));
jest.mock('../products/use-scan-feedback', () => ({
	useScanFeedback: () => ({ begin: () => mockFeedback }),
}));

const mockLogger = jest.requireMock('@wcpos/utils/logger').__logger as { error: jest.Mock };

const product = {
	uuid: 'product-41',
	remoteId: '41',
	payload: { id: 41, name: 'Keyboard', type: 'simple', status: 'publish', stock_status: 'instock' },
};

function scan(code: string) {
	act(() => mockScans.next({ code, source: { kind: 'wedge' }, timestamp: 0 }));
}

beforeEach(() => {
	jest.clearAllMocks();
	mockAddProduct.mockResolvedValue(true);
});

it('a scan at checkout adds the product to the cart', async () => {
	mockBarcodeSearch.mockResolvedValue([product]);
	render(<TenderScans />);
	scan('ABC');
	await waitFor(() => expect(mockFeedback.added).toHaveBeenCalledWith('Keyboard'));
	expect(mockAddProduct).toHaveBeenCalledTimes(1);
	expect(mockAddProduct).toHaveBeenCalledWith(product, { silent: true });
	expect(mockLogger.error).not.toHaveBeenCalled();
});

it('a not-found scan at checkout shows the not-found feedback and throws nothing', async () => {
	mockBarcodeSearch.mockResolvedValue([]);
	mockFetcher.mockResolvedValue({
		ok: true,
		status: 200,
		text: async () => JSON.stringify({ code: 'NOPE', found: false, match: null, ambiguous: [] }),
	});
	render(<TenderScans />);
	scan('NOPE');
	await waitFor(() => expect(mockFeedback.notFound).toHaveBeenCalledWith('NOPE'));
	expect(mockAddProduct).not.toHaveBeenCalled();
	expect(mockFeedback.error).not.toHaveBeenCalled();
	expect(mockLogger.error).not.toHaveBeenCalled();
});
