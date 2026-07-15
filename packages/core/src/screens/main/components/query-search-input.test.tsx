/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../query';
import { QuerySearchInput } from './query-search-input';

jest.mock('@rn-primitives/hooks', () => ({
	useComposedRefs: (...refs: React.Ref<unknown>[]) => refs[0],
}));
jest.mock('observable-hooks', () => ({ useSubscription: jest.fn() }));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (value: string) => void;
		testID?: string;
	}) => (
		<input
			data-testid={testID}
			value={value}
			onChange={(event) => onChangeText(event.currentTarget.value)}
		/>
	),
}));

function Harness() {
	const search = useQueryState<'customers', string>((state) => state.search);
	const { clearSearch } = useQueryStateActions<'customers'>();

	return (
		<>
			<QuerySearchInput collectionName="customers" testID="search" />
			<span data-testid="committed-search">{search}</span>
			<button data-testid="clear-search" onClick={clearSearch} />
		</>
	);
}

describe('QuerySearchInput binding mode', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it('lets an external clear override the draft and cancel its pending commit', () => {
		render(
			<QueryStateProvider
				collection="customers"
				initialPageSize={10}
				initialSort={{ field: 'last_name', direction: 'asc' }}
			>
				<Harness />
			</QueryStateProvider>
		);

		fireEvent.change(screen.getByTestId('search'), { target: { value: 'ada' } });
		act(() => jest.advanceTimersByTime(250));
		expect(screen.getByTestId('committed-search').textContent).toBe('ada');

		fireEvent.change(screen.getByTestId('search'), { target: { value: 'grace' } });
		expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('grace');
		expect(screen.getByTestId('committed-search').textContent).toBe('ada');

		fireEvent.click(screen.getByTestId('clear-search'));
		expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('');
		expect(screen.getByTestId('committed-search').textContent).toBe('');

		act(() => jest.advanceTimersByTime(250));
		expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('');
		expect(screen.getByTestId('committed-search').textContent).toBe('');
	});
});
