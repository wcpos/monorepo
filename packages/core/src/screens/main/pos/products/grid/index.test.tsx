/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { ProductGrid } from './index';

let mockResult: { hits: object[] };

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (value: unknown) => value,
	useObservableSuspense: () => mockResult,
}));
jest.mock('../../../../../query', () => ({
	useGuardedExtendLimit: () => jest.fn(),
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
	List: () => null,
	Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
		mockResult = { hits: [staleHit('second')] };
		rerender(<ProductGrid {...props} />);

		await waitFor(() => expect(getLogger([]).warn).toHaveBeenCalledTimes(2));
	});
});
