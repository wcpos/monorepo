/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { POSFilterBar } from './pos-filter-bar';

const push = jest.fn();
let filterBar: unknown = [];

jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, read: (value: unknown) => unknown) => read({ filterBar }),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID: string; onPress?: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('../../../components/product/filter-bar/stock-status-pill', () => ({
	StockStatusPill: () => <span data-testid="pill-stock_status" />,
}));
jest.mock('../../../components/product/filter-bar/featured-pill', () => ({
	FeaturedPill: () => <span data-testid="pill-featured" />,
}));
jest.mock('../../../components/product/filter-bar/on-sale-pill', () => ({
	OnSalePill: () => <span data-testid="pill-on_sale" />,
}));
jest.mock('../../../components/product/filter-bar/category-pill', () => ({
	CategoryPill: () => <span data-testid="pill-categories" />,
}));
jest.mock('../../../components/product/filter-bar/tag-pill', () => ({
	TagPill: () => <span data-testid="pill-tags" />,
}));
jest.mock('../../../components/product/filter-bar/brands-pill', () => ({
	BrandsPill: () => <span data-testid="pill-brands" />,
}));
jest.mock('./quick-filter-button', () => ({
	QuickFilterButton: ({ quickFilter }: { quickFilter: { id: string } }) => (
		<span data-testid={`quick-filter-${quickFilter.id}`} />
	),
}));
jest.mock('../../../hooks/use-engine-document', () => ({ useEngineRecordByWooId: () => ({}) }));
jest.mock('../../../../../query', () => ({
	useQueryState: (read: (state: unknown) => unknown) =>
		read({ filters: { tags: [8], brands: [9] } }),
}));
jest.mock('../../../contexts/ui-settings', () => ({ useUISettings: () => ({ uiSettings: {} }) }));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

it('renders shown pills and quick filters in persisted order, followed by customise', () => {
	filterBar = [
		{ id: 'tags', type: 'pill', show: true },
		{ id: 'featured', type: 'pill', show: false },
		{ id: 'saved', type: 'quick', label: 'Saved', conditions: [{ field: 'on_sale', value: true }] },
		{ id: 'stock_status', type: 'pill', show: true },
		{ id: 'on_sale', type: 'pill', show: false },
		{ id: 'categories', type: 'pill', show: false },
		{ id: 'brands', type: 'pill', show: false },
	];

	render(<POSFilterBar />);

	expect(screen.queryByTestId('pill-featured')).toBeNull();
	expect(
		screen
			.getAllByTestId(/^(pill-|quick-filter-|filter-bar-customize)/)
			.map((node) => node.getAttribute('data-testid'))
	).toEqual(['pill-tags', 'quick-filter-saved', 'pill-stock_status', 'filter-bar-customize']);

	fireEvent.click(screen.getByTestId('filter-bar-customize'));
	expect(push).toHaveBeenCalledWith('/(app)/(modals)/filter-bar');
});
