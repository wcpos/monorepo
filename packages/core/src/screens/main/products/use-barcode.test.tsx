/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { Subject } from 'rxjs';

import { useBarcode } from './use-barcode';

const barcode$ = new Subject<string>();
const barcodeSearch = jest.fn(async () => [{ id: 42 }]);

jest.mock('../hooks/barcodes', () => ({
	useBarcodeDetection: () => ({ barcode$, onKeyPress: jest.fn() }),
	useBarcodeSearch: () => ({ barcodeSearch }),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

function Harness({ setSearch }: { setSearch: (search: string) => void }) {
	useBarcode(setSearch);
	return null;
}

describe('admin products barcode search', () => {
	beforeEach(() => jest.clearAllMocks());

	it('commits the scanned barcode through the products query-state search action', async () => {
		const setSearch = jest.fn();
		render(<Harness setSearch={setSearch} />);

		await act(async () => barcode$.next('123456'));

		expect(barcodeSearch).toHaveBeenCalledWith('123456');
		expect(setSearch).toHaveBeenCalledWith('123456');
	});
});
