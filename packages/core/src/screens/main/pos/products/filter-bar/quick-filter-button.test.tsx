/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QuickFilterButton } from './quick-filter-button';

import type { QuickFilter } from './filter-bar-layout';

const events: string[] = [];
let active = false;
const actions = {
	resetFilters: jest.fn(() => events.push('reset')),
	setFilter: jest.fn((field: string, value: unknown) =>
		events.push(`filter:${field}:${JSON.stringify(value)}`)
	),
	setSearch: jest.fn((term: string) => events.push(`search:${term}`)),
	clearSearch: jest.fn(() => events.push('clear-search')),
	setSort: jest.fn((field: string, direction: string) => events.push(`sort:${field}:${direction}`)),
};

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID: string; onPress: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, read: (value: unknown) => unknown) =>
		read({ sortBy: 'name', sortDirection: 'asc' }),
}));
jest.mock('../../../../../query', () => ({
	useQueryState: (read: (state: unknown) => unknown) =>
		read(
			active
				? { search: 'shirt', filters: { categories: [2], tags: [], brands: [], on_sale: true } }
				: { search: '', filters: { categories: [], tags: [], brands: [] } }
		),
	useQueryStateActions: () => actions,
}));
jest.mock('../../../contexts/ui-settings', () => ({ useUISettings: () => ({ uiSettings: {} }) }));

const quickFilter: QuickFilter = {
	id: 'summer',
	type: 'quick',
	label: 'Summer',
	conditions: [
		{ field: 'categories', value: [2] },
		{ field: 'on_sale', value: true },
		{ field: 'search', value: 'shirt' },
	],
	sort: { field: 'sortable_price', direction: 'desc' },
};

beforeEach(() => {
	active = false;
	events.length = 0;
	jest.clearAllMocks();
});

it('resets then applies filters, search, and the quick-filter sort when inactive', () => {
	render(<QuickFilterButton quickFilter={quickFilter} />);
	fireEvent.click(screen.getByTestId('quick-filter-summer'));

	expect(events).toEqual([
		'reset',
		'filter:categories:[2]',
		'filter:on_sale:true',
		'search:shirt',
		'sort:sortable_price:desc',
	]);
});

it('resets filters, search, and settings sort when active', () => {
	active = true;
	render(<QuickFilterButton quickFilter={quickFilter} />);
	fireEvent.click(screen.getByTestId('quick-filter-summer'));

	expect(events).toEqual(['reset', 'clear-search', 'sort:name:asc']);
});
