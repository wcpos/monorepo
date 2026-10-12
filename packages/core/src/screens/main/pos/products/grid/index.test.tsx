/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { ProductGrid } from './index';

let mockResult: { hits: object[] };
let mockReady = true;
let mockSettling = false;
let mockError: unknown = null;
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
jest.mock('../../../../../query', () => ({
	useQueryHandleView: () => ({
		value: mockSnapshot(),
		current: mockSnapshot(),
		settling: mockSettling,
		error: mockError,
	}),
	useQueryHandleValue: () => mockSnapshot(),
	useGuardedExtendLimitFor: (...args: unknown[]) => {
		mockGuard(...args);
		return jest.fn();
	},
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { gridColumns$: 3, gridFields$: {} },
	}),
}));
jest.mock('../../../contexts/tax-rates', () => ({ useTaxSettings: () => ({ calcTaxes: false }) }));
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
jest.mock('./product-tile', () => ({ ProductTile: () => <div data-testid="default-tile" /> }));
jest.mock('./variable-product-tile', () => ({
	VariableProductTile: () => <div data-testid="default-variable-tile" />,
}));
jest.mock('../../../components/data-table/footer', () => ({ DataTableFooterFor: () => null }));
jest.mock('../../../components/product/tax-based-on', () => ({ TaxBasedOn: () => null }));

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

it('uses supplied tiles for both kinds and retains the defaults otherwise', () => {
	mockResult = {
		hits: ['simple', 'variable'].map((type) => ({
			record: { uuid: type, payload: { type, name: type } },
		})),
	};
	const props = {
		handle: { key: 'test', sync: jest.fn() },
		actions: { extendLimit: jest.fn() },
	} as unknown as React.ComponentProps<typeof ProductGrid>;
	const { rerender } = render(<ProductGrid {...props} />);
	expect(screen.getByTestId('default-tile')).toBeTruthy();
	expect(screen.getByTestId('default-variable-tile')).toBeTruthy();
	rerender(
		<ProductGrid
			{...props}
			tile={() => <div data-testid="custom-tile" />}
			variableTile={() => <div data-testid="custom-variable-tile" />}
		/>
	);
	expect(screen.getByTestId('custom-tile')).toBeTruthy();
	expect(screen.getByTestId('custom-variable-tile')).toBeTruthy();
	expect(screen.queryByTestId('default-tile')).toBeNull();
	expect(screen.queryByTestId('default-variable-tile')).toBeNull();
});

describe('ProductGrid on the handle snapshot', () => {
	const props = () =>
		({
			handle: { key: 'test', sync: jest.fn() },
			actions: { extendLimit: jest.fn() },
			loading: <div data-testid="grid-loading" />,
		}) as unknown as React.ComponentProps<typeof ProductGrid>;

	it('draws the loading state until the handle answers, then the rows — never the empty state between', () => {
		mockReady = false;
		mockResult = { hits: [] };
		const { rerender } = render(<ProductGrid {...props()} />);
		expect(screen.getByTestId('grid-loading')).toBeTruthy();
		expect(screen.queryByTestId('no-data-message')).toBeNull();

		mockReady = true;
		mockResult = {
			hits: [{ record: { uuid: 'p1', payload: { type: 'simple', name: 'One' } } }],
		};
		rerender(<ProductGrid {...props()} />);
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
