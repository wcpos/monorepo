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
	const { clearSearch, setSearch } = useQueryStateActions<'customers'>();

	return (
		<>
			<QuerySearchInput collectionName="customers" testID="search" />
			<span data-testid="committed-search">{search}</span>
			<button data-testid="clear-search" onClick={clearSearch} />
			<button data-testid="external-set-search" onClick={() => setSearch('external')} />
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

	it('keeps the input mounted and focused across its own debounce commits (#904)', () => {
		render(
			<QueryStateProvider
				collection="customers"
				initialPageSize={10}
				initialSort={{ field: 'last_name', direction: 'asc' }}
			>
				<Harness />
			</QueryStateProvider>
		);

		const input = screen.getByTestId('search') as HTMLInputElement;
		act(() => input.focus());

		// Type past several debounce commits — each keystroke separated by more
		// than the 250ms debounce so every one round-trips through the store.
		const term = 'wrench';
		for (let index = 1; index <= term.length; index += 1) {
			fireEvent.change(input, { target: { value: term.slice(0, index) } });
			act(() => jest.advanceTimersByTime(251));
			expect(screen.getByTestId('committed-search').textContent).toBe(term.slice(0, index));
			// Same DOM node must survive every commit — a remount would drop focus.
			expect(screen.getByTestId('search')).toBe(input);
			expect(document.activeElement).toBe(input);
		}

		expect(input.value).toBe('wrench');
	});

	it('adopts an external committed search and cancels the pending draft commit', () => {
		render(
			<QueryStateProvider
				collection="customers"
				initialPageSize={10}
				initialSort={{ field: 'last_name', direction: 'asc' }}
			>
				<Harness />
			</QueryStateProvider>
		);

		fireEvent.change(screen.getByTestId('search'), { target: { value: 'pending' } });
		fireEvent.click(screen.getByTestId('external-set-search'));

		expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('external');
		expect(screen.getByTestId('committed-search').textContent).toBe('external');

		// The stale draft's pending commit must not overwrite the external value.
		act(() => jest.advanceTimersByTime(250));
		expect(screen.getByTestId('committed-search').textContent).toBe('external');
		expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('external');
	});

	it('cancels a pending draft when clearSearch is a committed-value no-op', () => {
		render(
			<QueryStateProvider
				collection="customers"
				initialPageSize={10}
				initialSort={{ field: 'last_name', direction: 'asc' }}
			>
				<Harness />
			</QueryStateProvider>
		);

		fireEvent.change(screen.getByTestId('search'), { target: { value: 'ABC-123' } });
		expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('ABC-123');
		expect(screen.getByTestId('committed-search').textContent).toBe('');

		fireEvent.click(screen.getByTestId('clear-search'));
		expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('');

		act(() => jest.advanceTimersByTime(250));
		expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('');
		expect(screen.getByTestId('committed-search').textContent).toBe('');
	});
});
