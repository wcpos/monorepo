/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { Subject } from 'rxjs';

import { useStoreLabel } from './use-store-label';

const mockFindOne = jest.fn();

jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		userDB: {
			stores: {
				findOne: mockFindOne,
			},
		},
	}),
}));

describe('useStoreLabel', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('uses the store id fallback until the store document is available, then displays the store name', async () => {
		const store$ = new Subject<unknown>();
		mockFindOne.mockReturnValue({ $: store$.asObservable() });

		const { result } = renderHook(() => useStoreLabel('7'));

		expect(mockFindOne).toHaveBeenCalledWith({ selector: { id: 7 } });
		expect(result.current).toEqual({ id: 7, label: '7', document: undefined });

		act(() => {
			store$.next({ id: 7, name: 'Downtown' });
		});

		await waitFor(() => expect(result.current.label).toBe('Downtown'));
		expect(result.current.document).toEqual({ id: 7, name: 'Downtown' });
	});

	it('keeps the id as the label when the store does not exist', () => {
		mockFindOne.mockReturnValue({ $: new Subject<unknown>().asObservable() });

		const { result } = renderHook(() => useStoreLabel('99'));

		expect(result.current).toEqual({ id: 99, label: '99', document: undefined });
	});

	it('returns an empty label without querying when the store id is missing', () => {
		const { result } = renderHook(() => useStoreLabel(undefined));

		expect(mockFindOne).not.toHaveBeenCalled();
		expect(result.current).toEqual({ id: undefined, label: '', document: undefined });
	});

	it('returns the raw metadata value without querying when the store id is not numeric', () => {
		const { result } = renderHook(() => useStoreLabel('legacy-store'));

		expect(mockFindOne).not.toHaveBeenCalled();
		expect(result.current).toEqual({ id: undefined, label: 'legacy-store', document: undefined });
	});
});
