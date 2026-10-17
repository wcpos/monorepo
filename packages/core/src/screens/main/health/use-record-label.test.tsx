/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { recordHandle } from './record-handle';
import { useRecordLabel } from './use-record-label';

const mockExec = jest.fn();
const mockFindOne = jest.fn((_query: unknown) => ({ exec: mockExec }));
let mockDatabase: unknown = {
	collections: {
		orders: { findOne: (query: unknown) => mockFindOne(query) },
		products: { findOne: (query: unknown) => mockFindOne(query) },
	},
};
let mockDbListener: ((database: unknown) => void) | null = null;
const mockEngine = {
	active: () => (mockDatabase ? { database: mockDatabase } : null),
	db$: (listener: (database: unknown) => void) => {
		mockDbListener = listener;
		return () => {
			mockDbListener = null;
		};
	},
	ready: Promise.resolve(),
};

jest.mock('@wcpos/query', () => {
	const actual = jest.requireActual('@wcpos/query');
	return {
		COLLECTION_VOCABULARY: actual.COLLECTION_VOCABULARY,
		observeEngineCollection: actual.observeEngineCollection,
		resolveLegacyField: actual.resolveLegacyField,
		useQueryRuntime: () => ({ engine: mockEngine }),
	};
});
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

describe('recordHandle', () => {
	it('names an order by number and total', () => {
		expect(recordHandle({ number: '1234', payload: { total: '45.00' } })).toBe('#1234 · 45.00');
	});

	it('names a product by its name before anything else', () => {
		expect(recordHandle({ payload: { name: ' Blue Tee ', number: 7 } })).toBe('Blue Tee');
	});

	it('names a customer by first and last name, then username', () => {
		expect(recordHandle({ payload: { first_name: 'Ada', last_name: 'Lovelace' } })).toBe(
			'Ada Lovelace'
		);
		expect(recordHandle({ payload: { username: 'ada' } })).toBe('ada');
	});

	it('falls back to a later source when the first names nothing', () => {
		expect(recordHandle({ payload: { stock_quantity: 3 } }, { name: 'Queued Name' })).toBe(
			'Queued Name'
		);
		expect(recordHandle(null, {})).toBeNull();
	});
});

describe('useRecordLabel', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockDatabase = {
			collections: {
				orders: { findOne: (query: unknown) => mockFindOne(query) },
				products: { findOne: (query: unknown) => mockFindOne(query) },
			},
		};
	});

	it('returns nothing for a row that names no record', () => {
		const { result } = renderHook(() => useRecordLabel(undefined, undefined));
		expect(result.current).toBeNull();
		expect(mockFindOne).not.toHaveBeenCalled();
	});

	it('names the order read from this device', async () => {
		mockExec.mockResolvedValue({
			toJSON: () => ({ uuid: 'o-1', number: '1234', payload: { total: '45.00' } }),
		});

		const { result } = renderHook(() => useRecordLabel('orders', 'o-1'));

		// Before the read lands the line is the kind alone, never the uuid.
		expect(result.current?.text).toBe('Order');
		await waitFor(() => expect(result.current?.text).toBe('Order: #1234 · 45.00'));
		expect(result.current?.status).toBe('found');
		expect(mockFindOne).toHaveBeenCalledWith('o-1');
	});

	it('says the record is not on this device when the read finds nothing', async () => {
		mockExec.mockResolvedValue(null);

		const { result } = renderHook(() => useRecordLabel('orders', 'ae263330-fbff'));

		await waitFor(() => expect(result.current?.status).toBe('missing'));
		expect(result.current?.text).toBe('Order (not on this device)');
		expect(result.current?.text).not.toContain('ae263330');
	});

	it('keeps the kind alone while no database is open, then names it once one opens', async () => {
		mockDatabase = null;
		mockExec.mockResolvedValue({ uuid: 'p-1', payload: { name: 'Blue Tee' } });

		const { result } = renderHook(() => useRecordLabel('products', 'p-1'));

		expect(result.current).toEqual({
			kind: 'Product',
			handle: null,
			uuid: null,
			status: 'unresolved',
			text: 'Product',
		});
		expect(mockFindOne).not.toHaveBeenCalled();

		const opened = {
			collections: { products: { findOne: (query: unknown) => mockFindOne(query) } },
		};
		mockDatabase = opened;
		act(() => mockDbListener?.(opened));

		await waitFor(() => expect(result.current?.text).toBe('Product: Blue Tee'));
		expect(result.current?.uuid).toBe('p-1');
	});

	it('still reads in the next database after a read in the previous one failed', async () => {
		mockExec
			.mockRejectedValueOnce(new Error('database closing'))
			.mockResolvedValueOnce({ uuid: 'o-2', number: '77', payload: {} });

		const { result } = renderHook(() => useRecordLabel('orders', 'o-2'));
		await waitFor(() => expect(mockExec).toHaveBeenCalledTimes(1));
		expect(result.current?.status).toBe('unresolved');

		const reopened = {
			collections: { orders: { findOne: (query: unknown) => mockFindOne(query) } },
		};
		mockDatabase = reopened;
		act(() => mockDbListener?.(reopened));

		await waitFor(() => expect(result.current?.text).toBe('Order: #77'));
	});

	// Store ids overlap across stores: another store's name must not stand in.
	it('drops the previous answer when the engine moves to another database', async () => {
		mockExec.mockResolvedValueOnce({ uuid: 'p-1', payload: { name: 'Store A Tee' } });
		const { result } = renderHook(() => useRecordLabel('products', '80'));
		await waitFor(() => expect(result.current?.text).toBe('Product: Store A Tee'));

		mockDatabase = null;
		act(() => mockDbListener?.(null));

		expect(result.current?.status).toBe('unresolved');
		expect(result.current?.text).toBe('Product');
	});

	it('looks up a pull-only collection by its store id too', async () => {
		mockDatabase = {
			collections: { taxRates: { findOne: (query: unknown) => mockFindOne(query) } },
		};
		mockExec.mockResolvedValue({ uuid: 't-1', remoteId: '5', payload: { name: 'VAT' } });

		const { result } = renderHook(() => useRecordLabel('tax_rates', '5'));

		await waitFor(() => expect(result.current?.text).toBe('Tax rates: VAT'));
		expect(mockFindOne).toHaveBeenCalledWith({ selector: { remoteId: '5' } });
	});

	// Pull-side repair rows (`apply.escalation`, SYNC331) carry the store's
	// numeric id, not the local uuid the primary key is.
	it("finds a record by the store's id when the row carries a numeric one", async () => {
		mockExec.mockResolvedValue({ uuid: 'p-uuid', remoteId: '80', payload: { name: 'Blue Tee' } });

		const { result } = renderHook(() => useRecordLabel('products', '80'));

		await waitFor(() => expect(result.current?.status).toBe('found'));
		expect(mockFindOne).toHaveBeenCalledWith({ selector: { remoteId: '80' } });
		expect(result.current?.uuid).toBe('p-uuid');
	});
});
