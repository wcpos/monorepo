/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { QueryStateProvider } from '../../../../../query';
import { FilterBar } from './index';

const mockUseEngineDocumentByWooId = jest.fn((_collection: string, _id: number) => ({
	kind: 'resource',
}));

jest.mock('../../../hooks/use-engine-document', () => ({
	useEngineDocumentByWooId: (collection: string, id: number) =>
		mockUseEngineDocumentByWooId(collection, id),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./stock-status-pill', () => ({
	StockStatusPill: () => <div data-testid="stock-status-pill" />,
}));
jest.mock('./featured-pill', () => ({ FeaturedPill: () => <div data-testid="featured-pill" /> }));
jest.mock('./on-sale-pill', () => ({ OnSalePill: () => <div data-testid="on-sale-pill" /> }));
jest.mock('./category-pill', () => ({ CategoryPill: () => <div data-testid="category-pill" /> }));
jest.mock('./tag-pill', () => ({ TagPill: () => <div data-testid="tag-pill" /> }));
jest.mock('./brands-pill', () => ({ BrandsPill: () => <div data-testid="brands-pill" /> }));

describe('product FilterBar query-state fan-out', () => {
	it('reads tag and brand ids from state and renders all six filters without a fluent Query', () => {
		render(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
				initialFilters={{ tags: [17], brands: [29] }}
			>
				{React.createElement(FilterBar as unknown as React.ComponentType)}
			</QueryStateProvider>
		);

		for (const name of ['stock-status', 'featured', 'on-sale', 'category', 'tag', 'brands']) {
			expect(screen.getByTestId(`${name}-pill`)).toBeTruthy();
		}
		expect(mockUseEngineDocumentByWooId).toHaveBeenCalledWith('products/tags', 17);
		expect(mockUseEngineDocumentByWooId).toHaveBeenCalledWith('products/brands', 29);
	});
});
