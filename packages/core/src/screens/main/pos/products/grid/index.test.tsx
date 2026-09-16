/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { ProductGrid } from './index';

let mockResult: { hits: object[] };
const mockGuard = jest.fn();

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (value: unknown) => value,
	useObservableSuspense: () => mockResult,
}));
jest.mock('../../../../../query', () => ({
	useGuardedExtendLimit: (...args: unknown[]) => {
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
	List: ({ ListFooterComponent }: { ListFooterComponent?: React.ReactNode }) => (
		<div>{ListFooterComponent}</div>
	),
	Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('./grid-footer', () => ({
	ProductGridFooter: ({ count, resultCount }: { count: number; resultCount: number }) => (
		<>
			<span data-testid="product-grid-footer-count">{count}</span>
			<span data-testid="product-grid-footer-result-count">{resultCount}</span>
		</>
	),
}));
jest.mock('./product-tile', () => ({ ProductTile: () => null }));
jest.mock('./variable-product-tile', () => ({ VariableProductTile: () => null }));
jest.mock('../../../components/data-table/footer', () => ({ DataTableFooter: () => null }));
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

describe('ProductGrid stale-hit reporting', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockResult = { hits: [staleHit('first')] };
	});

	it('logs a replacement stale-hit set when the skipped count is unchanged', async () => {
		const props = {
			binding: { resource: {}, active$: {}, total$: {}, sync: jest.fn() },
			actions: { extendLimit: jest.fn() },
		} as unknown as React.ComponentProps<typeof ProductGrid>;
		const { rerender } = render(<ProductGrid {...props} />);

		await waitFor(() => expect(getLogger([]).warn).toHaveBeenCalledTimes(1));
		expect(screen.getByTestId('product-grid-footer-count').textContent).toBe('0');
		expect(screen.getByTestId('product-grid-footer-result-count').textContent).toBe('1');
		expect(mockGuard).toHaveBeenLastCalledWith(props.actions.extendLimit, 1, props.binding);
		mockResult = { hits: [staleHit('second')] };
		rerender(<ProductGrid {...props} />);

		await waitFor(() => expect(getLogger([]).warn).toHaveBeenCalledTimes(2));
	});
});
