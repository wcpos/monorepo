/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';

import { useBarcode } from './use-barcode';

const barcode$ = new Subject<unknown>();
const onKeyPress = jest.fn();
const mockUseBarcodeDetection = jest.fn();

jest.mock('../hooks/barcodes', () => ({
	useBarcodeDetection: (...args: unknown[]) => {
		mockUseBarcodeDetection(...args);
		return { barcode$, onKeyPress };
	},
}));

describe('orders barcode search', () => {
	beforeEach(() => jest.clearAllMocks());

	it('commits scanned barcodes through the orders search action', () => {
		const setSearch = jest.fn();
		renderHook(() => useBarcode(setSearch));

		act(() => barcode$.next(123456));

		expect(setSearch).toHaveBeenCalledWith('123456');
		expect(mockUseBarcodeDetection).toHaveBeenCalledWith();
	});
});
