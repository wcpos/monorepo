/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { Subject } from 'rxjs';

import { parseRemoteId, useCashierLabel } from './use-cashier-label';

const mockFindOne = jest.fn();
const mockFormat = jest.fn((json: { id?: number; first_name?: string; last_name?: string }) => {
	const name = [json.first_name, json.last_name].filter(Boolean).join(' ');
	return name || `ID: ${json.id}`;
});

jest.mock('./use-collection', () => ({
	useCollection: () => ({
		collection: {
			findOne: mockFindOne,
		},
	}),
}));

jest.mock('./use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: mockFormat }),
}));

describe('parseRemoteId', () => {
	it('normalizes numeric metadata values and rejects invalid ids', () => {
		expect(parseRemoteId(42)).toBe(42);
		expect(parseRemoteId('42')).toBe(42);
		expect(parseRemoteId(' 42 ')).toBe(42);
		expect(parseRemoteId('42abc')).toBeUndefined();
		expect(parseRemoteId('')).toBeUndefined();
		expect(parseRemoteId(undefined)).toBeUndefined();
	});
});

describe('useCashierLabel', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('uses the id fallback until the cashier document is available, then formats the name', async () => {
		const cashier$ = new Subject<unknown>();
		mockFindOne.mockReturnValue({ $: cashier$.asObservable() });

		const { result } = renderHook(() => useCashierLabel('42'));

		expect(mockFindOne).toHaveBeenCalledWith({ selector: { id: 42 } });
		expect(result.current).toEqual({ id: 42, label: 'ID: 42', document: undefined });

		act(() => {
			cashier$.next({ id: 42, first_name: 'Ada', last_name: 'Lovelace' });
		});

		await waitFor(() => expect(result.current.label).toBe('Ada Lovelace'));
		expect(result.current.document).toEqual({ id: 42, first_name: 'Ada', last_name: 'Lovelace' });
	});

	it('returns an empty label without querying when the id is missing or invalid', () => {
		const { result } = renderHook(() => useCashierLabel('not-a-number'));

		expect(mockFindOne).not.toHaveBeenCalled();
		expect(result.current).toEqual({ id: undefined, label: '', document: undefined });
	});
});
