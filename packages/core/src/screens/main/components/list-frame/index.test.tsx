/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { QueryHandle } from '@wcpos/query';

import { ListColumn, ListPage } from './index';

let mockPhone = false;
let mockBottom = 0;
let mockPointer: 'fine' | 'coarse' = 'fine';
let mockResult: { hits: { id: string }[]; searchState?: 'pending' | 'answered' } = { hits: [] };
const mockActions = {
	setSort: jest.fn(),
	extendLimit: jest.fn(),
	setFilter: jest.fn(),
	resetFilters: jest.fn(),
	clearSearch: jest.fn(),
};
jest.mock('react-native', () => ({
	View: ({
		className,
		testID,
		style,
		children,
	}: React.PropsWithChildren<{ className?: string; testID?: string; style?: object }>) => (
		<div data-testid={testID} data-class={className} style={style as React.CSSProperties}>
			{children}
		</div>
	),
}));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: mockBottom, left: 0 }),
}));
jest.mock('@wcpos/components/lib/device', () => ({
	useIsPhone: () => mockPhone,
	usePointer: () => mockPointer,
}));
jest.mock('@wcpos/components/empty-state', () => ({
	EmptyState: (props: {
		kind: string;
		title: string;
		description?: string;
		action?: { label: string; onPress: () => void };
	}) => (
		<div data-testid={`empty-${props.kind}`} data-title={props.title}>
			{props.description}
			{props.action && (
				<button data-testid="empty-clear" onClick={props.action.onPress}>
					{props.action.label}
				</button>
			)}
		</div>
	),
}));
// The handle as the body reads it: the drawn answer, set per test.
jest.mock('../../../../query', () => ({
	useQueryStateActions: () => mockActions,
	useDrawnHandle: (handle: unknown) => handle,
	useQuerySnapshot: () => ({ result: mockResult }),
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: jest.requireActual('react').Suspense }));
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: ({
			children,
			onReset,
			resetKeys,
		}: React.PropsWithChildren<{ onReset?: () => void; resetKeys?: unknown[] }>) => (
			<ErrorBoundary
				onReset={onReset}
				resetKeys={resetKeys}
				fallbackRender={({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => (
					<button data-testid="error-reset" onClick={() => resetErrorBoundary()} />
				)}
			>
				{children}
			</ErrorBoundary>
		),
	};
});
jest.mock('@wcpos/components/chip-row', () => ({
	ChipRowSkeleton: () => <div data-testid="chip-row-skeleton" />,
}));
jest.mock('../pro-guard', () => ({
	withProAccess: (Component: React.ComponentType<object>, page: string) =>
		function Guarded(props: object) {
			return (
				<div data-testid={`guard-${page}`}>
					<Component {...props} />
				</div>
			);
		},
}));

const handle = { retry: jest.fn() } as unknown as QueryHandle;
const never = new Promise<never>(() => {});
function Suspends(): React.ReactElement {
	throw never;
}

// The list form's props, the table drawn by `children`.
const list = {
	id: 'items',
	handle,
	renderRow: {
		coarse: ({ item }: { item: { id: string } }) => <div data-testid={`coarse-${item.id}`} />,
		fine: ({ item }: { item: { id: string } }) => <div data-testid={`fine-${item.id}`} />,
	},
	narrowed: false,
	empty: { title: 'No items yet', description: 'Items you add show here' },
	noResults: { title: 'Nothing matches', clear: 'Clear filters' },
};
const listBody = () => <div data-testid="list" />;

beforeEach(() => {
	mockPhone = false;
	mockBottom = 0;
	mockPointer = 'fine';
	mockResult = { hits: [] };
	jest.clearAllMocks();
});

const nodes = (...ids: string[]) => ids.map((id) => screen.getByTestId(id));
// Document order: each node precedes the next.
const inOrder = (list: HTMLElement[]) =>
	list.every(
		(node, index) =>
			index === 0 ||
			Boolean(list[index - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
	);
const classOf = (node: Element | null | undefined) => node?.getAttribute('data-class');

it('stands the bar, the chips, the rows and the body in that order', () => {
	render(
		<ListPage testID="screen" bar={<div data-testid="bar" />}>
			<ListColumn
				testID="column"
				chips={<div data-testid="chips" />}
				rows={<div data-testid="row" />}
				{...list}
				skeleton={<div data-testid="skeleton" />}
			>
				{listBody}
			</ListColumn>
		</ListPage>
	);
	expect(inOrder(nodes('bar', 'chips', 'row', 'list'))).toBe(true);
	expect(classOf(screen.getByTestId('screen'))).toBe('bg-background flex-1');
	expect(screen.getByTestId('column').contains(screen.getByTestId('chips'))).toBe(true);
	// The rows: inset at the page gutter and stacked at it, the chip row's bottom gutter taken
	// back so an empty stack adds nothing.
	expect(classOf(screen.getByTestId('row').parentElement)?.split(' ')).toEqual(
		expect.arrayContaining(['gap-gutter', 'px-gutter', '-mt-gutter'])
	);
	// The chip row brings the gutter over the card: the body adds none, and `min-h-0` keeps an
	// `h-full` skeleton inside the column (Codex, Orders).
	expect(classOf(screen.getByTestId('list').parentElement?.parentElement)).toBe('min-h-0 flex-1');
});

it('keeps the chip row up while the body suspends, and the skeleton under it', () => {
	render(
		<ListColumn
			chips={<div data-testid="chips" />}
			{...list}
			skeleton={<div data-testid="skeleton" />}
		>
			{() => <Suspends />}
		</ListColumn>
	);
	expect(inOrder(nodes('chips', 'skeleton'))).toBe(true);
});

it('holds the chip row in its skeleton while a pill suspends, with the body drawn', () => {
	render(
		<ListColumn chips={<Suspends />} {...list} skeleton={<div data-testid="skeleton" />}>
			{listBody}
		</ListColumn>
	);
	expect(inOrder(nodes('chip-row-skeleton', 'list'))).toBe(true);
});

it('retries the handle from the body boundary and leaves the chips up', () => {
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	let fail = true;
	function Body() {
		if (fail) throw new Error('read failed');
		return <div data-testid="list" />;
	}
	try {
		render(
			<ListColumn chips={<div data-testid="chips" />} {...list} skeleton={null}>
				{() => <Body />}
			</ListColumn>
		);
		expect(screen.getByTestId('chips')).toBeTruthy();
		fail = false;
		act(() => {
			fireEvent.click(screen.getByTestId('error-reset'));
		});
		expect(handle.retry).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('list')).toBeTruthy();
	} finally {
		consoleError.mockRestore();
	}
});

// Without a handle the body brings its own boundary (the POS stage, whose skeleton is measured
// from the body it would replace): the column draws none around it.
it('renders the body bare without a handle', () => {
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	function Body(): React.ReactElement {
		throw new Error('read failed');
	}
	try {
		expect(() =>
			render(
				<ListColumn chips={<div data-testid="chips" />}>
					<Body />
				</ListColumn>
			)
		).toThrow('read failed');
		expect(screen.queryByTestId('error-reset')).toBeNull();
	} finally {
		consoleError.mockRestore();
	}
});

// Customers' rule: the row above the card brings the gutter; with none, the body does, and the
// phone's list runs edge to edge under the search row.
it.each([
	[false, 'min-h-0 flex-1 pt-gutter'],
	[true, 'min-h-0 flex-1'],
])('gives the body the top gutter when there is no chip row (phone: %s)', (phone, classes) => {
	mockPhone = phone;
	render(
		<ListColumn {...list} skeleton={null}>
			{listBody}
		</ListColumn>
	);
	expect(classOf(screen.getByTestId('list').parentElement?.parentElement)).toBe(classes);
});

// On Free the overlay must leave the bar's menu, bell and cashier reachable.
it('guards the column, never the bar', () => {
	render(
		<ListPage pro="products" bar={<div data-testid="bar" />}>
			<ListColumn chips={<div data-testid="chips" />} rows={<div data-testid="row" />}>
				<div data-testid="list" />
			</ListColumn>
		</ListPage>
	);
	const guard = screen.getByTestId('guard-products');
	for (const id of ['chips', 'row', 'list']) {
		expect(guard.contains(screen.getByTestId(id))).toBe(true);
	}
	expect(guard.contains(screen.getByTestId('bar'))).toBe(false);
});

it('pads the bottom inset unless its column already does', () => {
	mockBottom = 34;
	const { unmount } = render(
		<ListPage testID="screen" bar={null}>
			{null}
		</ListPage>
	);
	expect(screen.getByTestId('screen').style.paddingBottom).toBe('34px');
	unmount();
	render(
		<ListPage testID="screen" insetBottom={false} bar={null}>
			{null}
		</ListPage>
	);
	expect(screen.getByTestId('screen').style.paddingBottom).toBe('');
});

describe('the list body', () => {
	type Table = {
		actions: object;
		renderItem: (params: { item: { id: string } }) => React.ReactElement;
		noDataMessage: React.ReactElement;
	};
	let table: Table | undefined;
	let drawn: unknown;
	const draw = (props: Partial<typeof list> = {}) =>
		render(
			<ListColumn {...list} {...props} skeleton={null}>
				{(handed: Table, result: unknown) => {
					table = handed;
					drawn = result;
					return (
						<div data-testid="list">
							{mockResult.hits.length
								? mockResult.hits.map((item) => (
										<React.Fragment key={item.id}>{handed.renderItem({ item })}</React.Fragment>
									))
								: handed.noDataMessage}
						</div>
					);
				}}
			</ListColumn>
		);

	it.each([
		['pending over rows', { hits: [{ id: 'a' }], searchState: 'pending' as const }, true],
		['pending with no rows', { hits: [], searchState: 'pending' as const }, false],
		['answered', { hits: [{ id: 'a' }], searchState: 'answered' as const }, false],
	])('shows the searching line and dims the rows only %s', (_, result, searching) => {
		mockResult = result;
		draw();
		expect(screen.queryByTestId('items-searching-line') !== null).toBe(searching);
		expect(classOf(screen.getByTestId('list').parentElement)).toBe(
			searching ? 'flex-1 opacity-60' : 'flex-1'
		);
		expect(drawn).toBe(result);
	});

	it.each([
		['coarse', 'coarse-a'],
		['fine', 'fine-a'],
	] as const)('draws the %s row for that pointer', (pointer, testID) => {
		mockPointer = pointer;
		mockResult = { hits: [{ id: 'a' }], searchState: 'answered' };
		draw();
		expect(screen.getByTestId(testID)).toBeTruthy();
	});

	it('says the store is empty with no clear when nothing narrows the list', () => {
		draw();
		const empty = screen.getByTestId('empty-empty');
		expect(empty.getAttribute('data-title')).toBe('No items yet');
		expect(empty.textContent).toBe('Items you add show here');
		expect(screen.queryByTestId('empty-clear')).toBeNull();
	});

	it('says nothing matches when narrowed, and its clear resets the filters and the search', () => {
		draw({ narrowed: true });
		expect(screen.getByTestId('empty-no-results').getAttribute('data-title')).toBe(
			'Nothing matches'
		);
		fireEvent.click(screen.getByTestId('empty-clear'));
		expect(mockActions.resetFilters).toHaveBeenCalledTimes(1);
		expect(mockActions.clearSearch).toHaveBeenCalledTimes(1);
	});

	it('hands the table the store’s sort, paging and filter actions, the same object each render', () => {
		const { rerender } = draw();
		const first = table?.actions;
		expect(first).toEqual({
			setSort: mockActions.setSort,
			extendLimit: mockActions.extendLimit,
			setFilter: mockActions.setFilter,
		});
		rerender(
			<ListColumn {...list} skeleton={null}>
				{(handed: Table) => {
					table = handed;
					return null;
				}}
			</ListColumn>
		);
		expect(table?.actions).toBe(first);
	});
});
