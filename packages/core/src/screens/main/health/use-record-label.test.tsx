/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject, defer, from, type Observable } from 'rxjs';

import { recordHandle } from './record-handle';
import { useRecordLabel } from './use-record-label';

const mockExec = jest.fn();
// `$` replays mockExec's answer, so each test drives the reactive read the
// same way; `mockDoc$`, when set, stands in for a live document stream.
let mockDoc$: Observable<unknown> | null = null;
const mockFindOne = jest.fn((_query: unknown) => ({
	exec: mockExec,
	$: mockDoc$ ?? defer(() => from(Promise.resolve(mockExec()))),
}));
let mockDatabase: unknown = {
	collections: {
		orders: { findOne: (query: unknown) => mockFindOne(query) },
		products: { findOne: (query: unknown) => mockFindOne(query) },
	},
};
let mockDbListener: ((database: unknown) => void) | null = null;
let mockEventListener: ((event: unknown) => void) | null = null;
const mockEngine = {
	active: () => (mockDatabase ? { database: mockDatabase } : null),
	db$: (listener: (database: unknown) => void) => {
		mockDbListener = listener;
		return () => {
			mockDbListener = null;
		};
	},
	ready: Promise.resolve(),
	events: (listener: (event: unknown) => void) => {
		mockEventListener = listener;
		return () => {
			mockEventListener = null;
		};
	},
};

// The named read (`@wcpos/query/record-readers`) runs for real against the mock engine.
jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

describe('recordHandle', () => {
	it('names an order by number and total', () => {
		expect(recordHandle('orders', { number: '1234', payload: { total: '45.00' } })).toBe(
			'#1234 · 45.00'
		);
	});

	it('names a product by its name before anything else', () => {
		expect(recordHandle('products', { payload: { name: ' Blue Tee ', number: 7 } })).toBe(
			'Blue Tee'
		);
	});

	it('names a customer by first and last name, then username', () => {
		expect(
			recordHandle('customers', { payload: { first_name: 'Ada', last_name: 'Lovelace' } })
		).toBe('Ada Lovelace');
		expect(recordHandle('customers', { payload: { username: 'ada' } })).toBe('ada');
	});

	it('skips a blank value so the payload or a later source still names it', () => {
		expect(recordHandle('products', { name: '  ', payload: { name: 'Blue Tee' } })).toBe(
			'Blue Tee'
		);
		expect(
			recordHandle('products', { name: '', payload: { name: ' ' } }, { name: 'Queued Name' })
		).toBe('Queued Name');
		expect(recordHandle('orders', { number: '', payload: { number: '1234' } })).toBe('#1234');
	});

	// Woo collapses a variation's stored name to the parent's at three or more
	// attributes, so every sibling would read the same.
	it('names a variation by its own attribute options, not the stored name', () => {
		expect(
			recordHandle('variations', {
				payload: {
					name: 'Hoodie',
					attributes: [
						{ name: 'Colour', option: 'Blue' },
						{ name: 'Size', option: 'M' },
						{ name: 'Fit', option: 'Slim' },
					],
				},
			})
		).toBe('Blue, M, Slim');
		expect(recordHandle('variations', { payload: { name: 'Hoodie - Blue' } })).toBe(
			'Hoodie - Blue'
		);
	});

	// A sale rejected before the store numbered it keeps its total and billing.
	it('names a born-local order with no number by billing name and total', () => {
		expect(
			recordHandle('orders', {
				number: '',
				total: '12.50',
				payload: { billing: { first_name: 'Ada', last_name: 'Lovelace' } },
			})
		).toBe('Ada Lovelace · 12.50');
		expect(recordHandle('orders', { number: '', payload: { total: '9.00', billing: {} } })).toBe(
			'9.00'
		);
	});

	it('names a coupon by its code', () => {
		expect(recordHandle('coupons', { payload: { code: ' SAVE10 ', amount: '10' } })).toBe('SAVE10');
	});

	it('falls back to a later source when the first names nothing', () => {
		expect(
			recordHandle('products', { payload: { stock_quantity: 3 } }, { name: 'Queued Name' })
		).toBe('Queued Name');
		expect(recordHandle('products', null, {})).toBeNull();
	});
});

describe('useRecordLabel', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockDoc$ = null;
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

	// Clear & re-download replaces the collection inside the SAME database, so
	// db$ stays quiet; the reset event must re-read, and a record the reset
	// removed must stop reading as found (Open record hangs off 'found').
	it('re-reads after Clear & re-download replaces the collection', async () => {
		mockExec.mockResolvedValueOnce({ uuid: 'o-1', number: '1234', payload: {} });
		const { result } = renderHook(() => useRecordLabel('orders', 'o-1'));
		await waitFor(() => expect(result.current?.status).toBe('found'));

		mockExec.mockResolvedValueOnce(null);
		act(() =>
			mockEventListener?.({ type: 'collection-reset', scopeId: 's', collection: 'products' })
		);
		expect(result.current?.status).toBe('found');

		act(() =>
			mockEventListener?.({ type: 'collection-reset', scopeId: 's', collection: 'orders' })
		);
		await waitFor(() => expect(result.current?.status).toBe('missing'));
		expect(result.current?.text).toBe('Order (not on this device)');
	});

	it('labels a coupon by its code', async () => {
		mockDatabase = {
			collections: { coupons: { findOne: (query: unknown) => mockFindOne(query) } },
		};
		mockExec.mockResolvedValue({ uuid: 'c-1', payload: { code: 'SAVE10' } });

		const { result } = renderHook(() => useRecordLabel('coupons', 'c-1'));

		await waitFor(() => expect(result.current?.text).toBe('Coupon: SAVE10'));
	});

	// The reset's refill lands AFTER the collection is replaced: a one-shot read
	// at reset time would say "not on this device" for good.
	it('follows the document, so a refill after Clear & re-download names it', async () => {
		const doc$ = new BehaviorSubject<unknown>(null);
		mockDoc$ = doc$;
		const { result } = renderHook(() => useRecordLabel('orders', 'o-9'));
		await waitFor(() => expect(result.current?.status).toBe('missing'));

		act(() => doc$.next({ uuid: 'o-9', number: '9', payload: { total: '1.00' } }));

		await waitFor(() => expect(result.current?.text).toBe('Order: #9 · 1.00'));
		expect(result.current?.status).toBe('found');
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
