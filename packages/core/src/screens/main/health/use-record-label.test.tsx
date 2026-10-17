/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';

import { recordHandle } from './record-handle';
import { useRecordLabel } from './use-record-label';

const mockExec = jest.fn();
const mockFindOne = jest.fn((_id: string) => ({ exec: mockExec }));
let mockDatabase: unknown = {
	collections: {
		orders: { findOne: (id: string) => mockFindOne(id) },
		products: { findOne: (id: string) => mockFindOne(id) },
	},
};
const mockEngine = { active: () => ({ database: mockDatabase }) };

jest.mock('@wcpos/query', () => {
	const actual = jest.requireActual('@wcpos/query');
	return {
		COLLECTION_VOCABULARY: actual.COLLECTION_VOCABULARY,
		engineCollection: actual.engineCollection,
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
				orders: { findOne: (id: string) => mockFindOne(id) },
				products: { findOne: (id: string) => mockFindOne(id) },
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

	it('keeps the kind alone while no database is open', () => {
		mockDatabase = null;

		const { result } = renderHook(() => useRecordLabel('products', 'p-1'));

		expect(result.current).toEqual({
			kind: 'Product',
			handle: null,
			status: 'unresolved',
			text: 'Product',
		});
		expect(mockFindOne).not.toHaveBeenCalled();
	});
});
