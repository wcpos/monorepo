/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../query';
import { QuerySearchInput } from './query-search-input';

// Keep the real Input + react-native-web TextInput: mocking it concealed remounts
// and the controlled-input event path. Only icon rendering is irrelevant here.
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('observable-hooks', () => ({ useSubscription: jest.fn() }));

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
	it('preserves focus and the input node when an external clear cancels a draft', () => {
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
		fireEvent.change(input, { target: { value: 'unfinished' } });
		fireEvent.click(screen.getByTestId('clear-search'));
		expect(screen.getByTestId('search')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input.value).toBe('');
		fireEvent.change(input, { target: { value: 'next' } });
		act(() => jest.advanceTimersByTime(250));
		expect(screen.getByTestId('committed-search').textContent).toBe('next');
	});

	it.each(['products', 'customers', 'orders', 'coupons', 'logs'] as const)(
		'%s preserves rapid edits without rendering query consumers per key',
		(collection) => {
			const commits: string[] = [];
			function Results() {
				const search = useQueryState((state) => state.search);
				React.useLayoutEffect(() => {
					commits.push(search);
				});
				return <span data-testid="results">{search}</span>;
			}
			render(
				<QueryStateProvider
					collection={collection}
					initialPageSize={10}
					initialSort={{ field: 'id', direction: 'asc' }}
				>
					<QuerySearchInput collectionName={collection} testID="search" />
					<Results />
				</QueryStateProvider>
			);
			const input = screen.getByTestId('search') as HTMLInputElement;
			act(() => input.focus());
			const term = 'rapidtyping12345';
			for (let i = 1; i <= term.length; i++) {
				fireEvent.change(input, { target: { value: term.slice(0, i) } });
				act(() => jest.advanceTimersByTime(10));
				expect(input.value).toBe(term.slice(0, i));
			}
			expect(commits).toEqual(['']);
			act(() => jest.advanceTimersByTime(250));
			expect(commits).toEqual(['', term]);
			for (let i = term.length - 1; i >= 0; i--) {
				fireEvent.change(input, { target: { value: term.slice(0, i) } });
				act(() => jest.advanceTimersByTime(10));
				expect(input.value).toBe(term.slice(0, i));
				expect(document.activeElement).toBe(input);
			}
			expect(commits).toEqual(['', term]);
			act(() => jest.advanceTimersByTime(250));
			expect(commits).toEqual(['', term, '']);
		}
	);
});
