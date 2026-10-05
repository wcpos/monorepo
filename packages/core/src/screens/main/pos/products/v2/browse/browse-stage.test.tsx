/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { BrowseStage } from './browse-stage';

jest.mock('./use-browse-terms', () => ({
	useBrowseTerms: () => ({
		all: [{ kind: 'term', id: 1, name: 'Drinks', count: 12 }],
		rootsOf: () => [{ kind: 'term', id: 1, name: 'Drinks', count: 12 }],
		childrenOf: () => [],
		idsFor: () => [1],
		quickFilterFor: () => undefined,
	}),
}));
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { gridColumns: 2 } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: Record<string, unknown>, read: (value: Record<string, unknown>) => unknown) =>
		read(doc),
}));
let mockSearch = '';
jest.mock('../../../../../../query', () => ({
	useQueryState: () => ({
		search: mockSearch,
		filters: {},
		sort: { field: 'name', direction: 'asc' },
	}),
}));
// The term set's leaves pull in native-only modules; which set is on the stage is what is tested.
jest.mock('../deal-stack', () => ({
	DealStagedContext: jest.requireActual('react').createContext(null),
}));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => false }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Root: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	List: ({
		data,
		renderItem,
	}: {
		data: unknown[];
		renderItem: (input: { item: unknown; index: number }) => React.ReactNode;
	}) => (
		<div>
			{data.map((item, index) => (
				<React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>
			))}
		</div>
	),
	Item: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));
jest.mock('../../../../components/product/product-image-placeholder', () => ({
	PRODUCT_IMAGE_PLACEHOLDER: 'placeholder.png',
}));

const renderProducts = () => <span data-testid="products">products</span>;

afterEach(() => {
	mockSearch = '';
});

it('opens on the root term set, not the products, in grid and table', () => {
	const { rerender } = render(
		<BrowseStage source="categories" viewMode="grid" renderProducts={renderProducts} />
	);
	expect(screen.getByTestId('browse-root')).toBeTruthy();
	expect(screen.getByTestId('browse-term-1')).toBeTruthy();
	expect(screen.queryByTestId('products')).toBeNull();
	rerender(<BrowseStage source="categories" viewMode="table" renderProducts={renderProducts} />);
	expect(screen.getByTestId('browse-root')).toBeTruthy();
	expect(screen.getByTestId('browse-term-1')).toBeTruthy();
	expect(screen.queryByTestId('products')).toBeNull();
});

it('a search displaces the term set with the catalogue-wide products', () => {
	mockSearch = 'lat';
	render(<BrowseStage source="categories" viewMode="grid" renderProducts={renderProducts} />);
	expect(screen.getByTestId('products')).toBeTruthy();
	expect(screen.queryByTestId('browse-root')).toBeNull();
});
