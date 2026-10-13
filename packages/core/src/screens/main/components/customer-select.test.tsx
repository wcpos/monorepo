/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { CustomerList } from './customer-select';

// The search-select handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>, key?: string) => FakeHandle;
};
const mockComboboxItem = jest.fn();
let mockListProps: Record<string, unknown> = {};

jest.mock('@wcpos/components/avatar', () => ({ Avatar: () => null }));
jest.mock('@wcpos/components/combobox', () => {
	const React = jest.requireActual<typeof import('react')>('react');
	return {
		ComboboxList: ({
			data,
			renderItem,
			...rest
		}: {
			data: unknown[];
			renderItem: ({ item }: { item: unknown }) => React.ReactNode;
		}) => {
			mockListProps = rest;
			return (
				<>
					{data.map((item, index) => (
						<React.Fragment key={index}>{renderItem({ item })}</React.Fragment>
					))}
				</>
			);
		},
		ComboboxItem: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
			mockComboboxItem(props);
			return <div data-testid={props.testID as string}>{children}</div>;
		},
		ComboboxEmpty: ({ children }: React.PropsWithChildren) => <>{children}</>,
	};
});
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/sync-core', () => ({
	// The real module beneath (the query handles' imports read it); the guest id is the file's.
	...jest.requireActual('@wcpos/sync-core'),
	GUEST_CUSTOMER_ID: 37,
	isGuestCustomer: (id: unknown) => id === 37,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../query', () => {
	// The real readers: what this file pins is how the list draws the handle.
	const handles = jest.requireActual<typeof import('../../../query/query-handles')>(
		'../../../query/query-handles'
	);
	return {
		useSearchSelect: jest.fn(),
		useDrawnHandle: handles.useDrawnHandle,
		useQuerySnapshot: handles.useQuerySnapshot,
		// The real guard: what this file pins is the picker's paging, and a hand-rolled stub
		// would only re-state the wiring back to itself.
		useGuardedExtension: jest.requireActual<
			typeof import('../../../query/use-guarded-extend-limit')
		>('../../../query/use-guarded-extend-limit').useGuardedExtension,
	};
});
jest.mock('../hooks/use-customer-name-format/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'registered customer' }),
}));

const hits = (count: number) =>
	Array.from({ length: count }, (_unused, index) => ({
		id: `customer-${index}`,
		record: { uuid: `customer-${index}`, payload: { id: index, email: 'a@example.test' } },
	}));

const answered = (rows: unknown[], key?: string) =>
	fakeQueryHandle({ result: { hits: rows } }, key);

const select = (overrides: Record<string, unknown> = {}) =>
	({
		handle: answered([]),
		limit: 50,
		extendLimit: () => undefined,
		...overrides,
	}) as never;

describe('CustomerList', () => {
	beforeEach(() => {
		mockListProps = {};
		mockComboboxItem.mockClear();
	});

	it('renders the configured guest sentinel with the guest label', () => {
		render(<CustomerList select={select()} withGuest={true} />);

		expect(screen.getByText('common.guest')).toBeTruthy();
	});

	/**
	 * #1553: the picker rendered a fixed 50 rows and passed no end-reached handler at all, so
	 * a 5,000-customer store could not be scrolled past the first page. Asserting the handler
	 * is PRESENT is not enough — an inert one looks identical from the outside.
	 */
	it('extends the window when the list reaches its end on a full page', () => {
		const extendLimit = jest.fn();
		render(
			<CustomerList
				select={select({ handle: answered(hits(2)), limit: 2, extendLimit })}
				withGuest={false}
			/>
		);
		(mockListProps.onEndReached as () => void)();

		expect(extendLimit).toHaveBeenCalledTimes(1);

		// The virtualizer fires end-reached repeatedly while the extension is outstanding;
		// one page per fire would abort and re-issue the wire request each time (#1221).
		(mockListProps.onEndReached as () => void)();
		expect(extendLimit).toHaveBeenCalledTimes(1);
	});

	it('does not extend the window on a short page — a short page IS the end', () => {
		const extendLimit = jest.fn();
		render(
			<CustomerList
				select={select({ handle: answered(hits(1)), limit: 2, extendLimit })}
				withGuest={false}
			/>
		);
		(mockListProps.onEndReached as () => void)();

		expect(extendLimit).not.toHaveBeenCalled();
	});

	it('emits the engine record payload as the selected item', () => {
		const payload = {
			id: 42,
			first_name: 'Ada',
			last_name: 'Lovelace',
			email: 'ada@example.test',
		};
		const handle = answered([
			{
				id: 'customer-uuid',
				record: { uuid: 'customer-uuid', payload },
				document: { id: 999, first_name: 'Legacy' },
			},
		]);

		render(<CustomerList select={select({ handle })} withGuest={false} />);

		expect(mockComboboxItem).toHaveBeenCalledWith(
			expect.objectContaining({ value: '42', label: '42', item: payload })
		);
	});

	/**
	 * A typed search is a new handle, unanswered until the engine reads it. The list draws the
	 * previous handle meanwhile (`useDrawnHandle`): the options stay put instead of the
	 * popover's list flashing to its fallback on every keystroke, and the new options replace
	 * them when the search answers.
	 */
	it('keeps the previous options while a typed search’s handle answers', async () => {
		const before = answered(hits(2), 'before');
		const typed = fakeQueryHandle({ ready: false }, 'typed');
		const view = (handle: FakeHandle) => (
			<React.Suspense fallback={<span data-testid="list-fallback" />}>
				<CustomerList select={select({ handle })} withGuest={false} />
			</React.Suspense>
		);
		const options = () =>
			screen.queryAllByTestId(/^customer-select-option-/).map((node) => node.dataset.testid);
		const { rerender } = render(view(before));
		expect(options()).toEqual(['customer-select-option-0', 'customer-select-option-1']);

		rerender(view(typed));
		await act(async () => undefined);

		expect(screen.queryByTestId('list-fallback')).toBeNull();
		expect(options()).toEqual(['customer-select-option-0', 'customer-select-option-1']);

		await act(async () => typed.set({ ready: true, result: { hits: hits(1) } }));

		expect(screen.queryByTestId('list-fallback')).toBeNull();
		expect(options()).toEqual(['customer-select-option-0']);
	});

	/**
	 * The rows drawn while a typed search settles are the PREVIOUS search's: a full old page
	 * reaching its end must not grow the new search's window before its first page has
	 * answered (the over-declaration the paging reset exists to stop).
	 */
	it('does not page a typed search before its first page answers', async () => {
		const extendLimit = jest.fn();
		const before = answered(hits(2), 'before');
		const typed = fakeQueryHandle({ ready: false }, 'typed');
		const view = (handle: FakeHandle) => (
			<React.Suspense fallback={<span data-testid="list-fallback" />}>
				<CustomerList select={select({ handle, limit: 2, extendLimit })} withGuest={false} />
			</React.Suspense>
		);
		const { rerender } = render(view(before));
		rerender(view(typed));
		await act(async () => undefined);

		(mockListProps.onEndReached as () => void)();
		expect(extendLimit).not.toHaveBeenCalled();

		await act(async () => typed.set({ ready: true, result: { hits: hits(2) } }));
		(mockListProps.onEndReached as () => void)();
		expect(extendLimit).toHaveBeenCalledTimes(1);
	});

	it('suspends to its fallback on a first open, then shows the options once answered', async () => {
		const handle = fakeQueryHandle({ ready: false }, 'first-open');
		render(
			<React.Suspense fallback={<span data-testid="list-fallback" />}>
				<CustomerList select={select({ handle })} withGuest={false} />
			</React.Suspense>
		);
		expect(screen.getByTestId('list-fallback')).toBeTruthy();
		expect(screen.queryAllByTestId(/^customer-select-option-/)).toHaveLength(0);

		await act(async () => handle.set({ ready: true, result: { hits: hits(1) } }));

		expect(screen.queryByTestId('list-fallback')).toBeNull();
		expect(screen.getByTestId('customer-select-option-0')).toBeTruthy();
	});
});
