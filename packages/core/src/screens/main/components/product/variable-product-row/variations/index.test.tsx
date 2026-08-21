/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { Variations } from './index';

const mockActions = {
	clearSearch: jest.fn(),
	resetFilters: jest.fn(),
};
const mockState = { search: '', filters: {}, sort: {}, limit: 10 };
const mockUseCollectionBinding = jest.fn(
	(_collection: string, _state: unknown, _options: { remoteIds: readonly string[] }) => ({
		sync: jest.fn().mockResolvedValue(undefined),
	})
);

jest.mock('react-native', () => ({
	View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (
		record: { variations$: BehaviorSubject<number[]> },
		select: (value: { payload: { variations: number[] } }) => unknown
	) => {
		const { useObservableEagerState } = jest.requireActual('observable-hooks');
		const variations$ = record.variations$;
		return select({ payload: { variations: useObservableEagerState(variations$) } });
	},
}));
jest.mock('../../../../../../query', () => ({
	useQueryState: () => mockState,
	useQueryStateActions: () => mockActions,
	useCollectionBinding: (
		collection: string,
		state: unknown,
		options: { remoteIds: readonly string[] }
	) => mockUseCollectionBinding(collection, state, options),
}));
jest.mock('./filters', () => ({ VariationsFilterBar: () => null }));
jest.mock('./table', () => ({ VariationsTable: () => null }));

describe('Variations query binding', () => {
	beforeEach(() => jest.clearAllMocks());

	it('updates the bound variation ids when the parent observable changes', () => {
		const variations$ = new BehaviorSubject([11, 12]);
		const row = {
			original: {
				document: { id: 1, variations: variations$.value, variations$ },
				record: { variations$ },
			},
		} as never;

		render(<Variations row={row} />);

		expect(mockUseCollectionBinding).toHaveBeenLastCalledWith('variations', mockState, {
			remoteIds: ['11', '12'],
		});

		act(() => variations$.next([11, 12, 13]));

		expect(mockUseCollectionBinding).toHaveBeenLastCalledWith('variations', mockState, {
			remoteIds: ['11', '12', '13'],
		});
	});
});
