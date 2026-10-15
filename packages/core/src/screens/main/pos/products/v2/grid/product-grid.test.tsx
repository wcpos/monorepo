/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { ProductGrid } from './product-grid';

let mockResult: { hits: object[] };
let mockReady = true;
let mockError: unknown = null;
// Settling is `useDrawnHandle(handle) !== handle`: while set, the drawn handle the grid draws
// is a previous one, as React would hand it while the new handle suspends.
let mockSettling = false;
const mockPending = new Promise<void>(() => undefined);
const mockPreviousHandle = { key: 'previous', sync: jest.fn() };
const mockGuard = jest.fn();
// The grid reads one snapshot from the handle; the double hands it the current `mockResult`.
const mockSnapshot = () => ({
	ready: mockReady,
	error: mockError,
	result: mockResult,
	hits: mockResult.hits,
	count: mockResult.hits.length,
	searchActive: false,
	searchState: undefined,
	active: false,
	pending: false,
	exhausted: null,
	total: null,
	laneProgress: null,
});

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

// `mockUseDocField` reads settings through observable-hooks; the grid itself no longer imports it.
jest.mock('observable-hooks', () => ({
	useObservableEagerState: (value: unknown) => value,
}));
jest.mock('../../../../../../query', () => ({
	// The Suspense-native reader, as the grid sees it: an answer, or a thrown promise / error.
	useQuerySnapshot: () => {
		if (mockError) throw mockError;
		if (!mockReady) throw mockPending;
		return mockSnapshot();
	},
	useQueryHandleFields: () => mockSnapshot(),
	useQueryHandleValue: () => mockSnapshot(),
	useDrawnHandle: <T,>(handle: T): T =>
		mockSettling && (handle as { key?: string }).key === 'test'
			? (mockPreviousHandle as unknown as T)
			: handle,
	useGuardedExtendLimit: (...args: unknown[]) => {
		mockGuard(...args);
		return jest.fn();
	},
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { gridColumns$: 3, gridFields$: {} },
	}),
}));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	List: ({
		data,
		renderItem,
		ListFooterComponent,
	}: {
		data: unknown[];
		renderItem: (value: { item: unknown }) => React.ReactNode;
		ListFooterComponent?: React.ReactNode;
	}) => (
		<div>
			{data.map((item, index) => (
				<React.Fragment key={index}>{renderItem({ item })}</React.Fragment>
			))}
			{ListFooterComponent}
		</div>
	),
	Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('./grid-footer', () => ({
	ProductGridFooter: ({ renderedCount, hitCount }: { renderedCount: number; hitCount: number }) => (
		<>
			<span data-testid="product-grid-footer-count">{renderedCount}</span>
			<span data-testid="product-grid-footer-result-count">{hitCount}</span>
		</>
	),
}));
jest.mock('./inline-variable-tile', () => ({
	VariableProductTile: () => <div data-testid="popover-tile" />,
}));
// The caption row the table view draws, values in (the tax notice is its own default child).
jest.mock('../footer', () => ({
	ProductsFooter: ({
		collectionName,
		count,
		total,
		active,
	}: {
		collectionName: string;
		count: number;
		total: number | null;
		active: boolean;
	}) => (
		<div
			data-testid="products-footer"
			data-collection={collectionName}
			data-count={count}
			data-total={String(total)}
			data-active={String(active)}
		/>
	),
}));

function staleHit(uuid: string) {
	return {
		document: {},
		record: {
			uuid,
			get payload(): never {
				throw new Error(`stale ${uuid}`);
			},
		},
	};
}

beforeEach(() => {
	mockReady = true;
	mockSettling = false;
	mockError = null;
});

describe('ProductGrid stale-hit reporting', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockResult = { hits: [staleHit('first')] };
	});

	it('logs a replacement stale-hit set when the skipped count is unchanged', async () => {
		const props = {
			handle: { key: 'test', sync: jest.fn() },
			actions: { extendLimit: jest.fn() },
		} as unknown as React.ComponentProps<typeof ProductGrid>;
		const { rerender } = render(<ProductGrid {...props} />);

		await waitFor(() => expect(getLogger([]).warn).toHaveBeenCalledTimes(1));
		expect(screen.getByTestId('product-grid-footer-count').textContent).toBe('0');
		expect(screen.getByTestId('product-grid-footer-result-count').textContent).toBe('1');
		expect(mockGuard).toHaveBeenLastCalledWith(
			props.actions.extendLimit,
			1,
			expect.objectContaining({ pending: false, exhausted: null })
		);
		mockResult = { hits: [staleHit('second')] };
		rerender(<ProductGrid {...props} />);

		await waitFor(() => expect(getLogger([]).warn).toHaveBeenCalledTimes(2));
	});
});

// Keep the stage's variable-tile selector real; only its leaf tiles and motion context are doubles.
jest.mock('../deal-stack', () => ({
	DealStagedContext: jest.requireActual('react').createContext(null),
}));
jest.mock('./product-tile', () => ({
	ProductTile: ({
		record,
		onDrill,
	}: {
		record: { uuid: string; payload: { type: string } };
		onDrill?: (record: unknown) => void;
	}) => (
		<button
			data-testid={record.payload.type === 'variable' ? 'drill-tile' : 'default-tile'}
			onClick={() => onDrill?.(record)}
		/>
	),
}));

it('draws a simple product as the product tile and a variable one as the drill tile', () => {
	const simple = { uuid: 'simple', payload: { type: 'simple', name: 'Simple' } };
	const variable = { uuid: 'variable', payload: { type: 'variable', name: 'Variable' } };
	mockResult = { hits: [{ record: simple }, { record: variable }] };
	const onDrill = jest.fn();
	const props = {
		handle: { key: 'test', sync: jest.fn() },
		actions: { extendLimit: jest.fn() },
		onDrill,
		variationsStyle: 'drill',
	} as unknown as React.ComponentProps<typeof ProductGrid>;
	render(<ProductGrid {...props} />);
	expect(screen.getByTestId('default-tile')).toBeTruthy();
	fireEvent.click(screen.getByTestId('drill-tile'));
	expect(onDrill).toHaveBeenCalledWith(variable);
	expect(screen.queryByTestId('popover-tile')).toBeNull();
});

it('with the inline variations style a variable product is the popover tile', () => {
	mockResult = {
		hits: [{ record: { uuid: 'variable', payload: { type: 'variable', name: 'Variable' } } }],
	};
	const props = {
		handle: { key: 'test', sync: jest.fn() },
		actions: { extendLimit: jest.fn() },
		onDrill: jest.fn(),
		variationsStyle: 'inline',
	} as unknown as React.ComponentProps<typeof ProductGrid>;
	render(<ProductGrid {...props} />);
	expect(screen.getByTestId('popover-tile')).toBeTruthy();
	expect(screen.queryByTestId('drill-tile')).toBeNull();
});

describe('ProductGrid on the handle snapshot', () => {
	const handle = { key: 'test', sync: jest.fn() };
	const props = () =>
		({
			handle,
			actions: { extendLimit: jest.fn() },
		}) as unknown as React.ComponentProps<typeof ProductGrid>;

	it('suspends until the handle answers, then draws the rows — never the empty state between', () => {
		mockReady = false;
		mockResult = { hits: [] };
		const { rerender } = render(
			<React.Suspense fallback={<div data-testid="grid-loading" />}>
				<ProductGrid {...props()} />
			</React.Suspense>
		);
		expect(screen.getByTestId('grid-loading')).toBeTruthy();
		expect(screen.queryByTestId('no-data-message')).toBeNull();

		mockReady = true;
		mockResult = {
			hits: [{ record: { uuid: 'p1', payload: { type: 'simple', name: 'One' } } }],
		};
		rerender(
			<React.Suspense fallback={<div data-testid="grid-loading" />}>
				<ProductGrid {...props()} />
			</React.Suspense>
		);
		expect(screen.queryByTestId('grid-loading')).toBeNull();
		expect(screen.queryByTestId('no-data-message')).toBeNull();
		expect(screen.getByTestId('default-tile')).toBeTruthy();
	});

	it('treats a changed query that has not answered as pending for the paging guard', () => {
		mockResult = { hits: [] };
		mockSettling = true;
		render(<ProductGrid {...props()} />);
		expect(mockGuard).toHaveBeenLastCalledWith(
			expect.any(Function),
			0,
			expect.objectContaining({ pending: true })
		);
	});

	it('throws a failed read to the boundary above it', () => {
		mockResult = { hits: [] };
		mockError = new Error('storage gone');
		const silence = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(() => render(<ProductGrid {...props()} />)).toThrow('storage gone');
		silence.mockRestore();
	});
});

it('draws the products caption row under the tiles, as the table view does, with the rendered count', () => {
	mockResult = {
		hits: ['one', 'two'].map((uuid) => ({
			record: { uuid, payload: { type: 'simple', name: uuid } },
		})),
	};
	render(
		<ProductGrid
			{...({
				handle: { key: 'test', sync: jest.fn() },
				actions: { extendLimit: jest.fn() },
			} as unknown as React.ComponentProps<typeof ProductGrid>)}
		/>
	);
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({
		collection: 'products',
		count: '2',
		total: 'null',
		active: 'false',
	});
});
