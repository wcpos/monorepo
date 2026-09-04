/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { QuickFilterPreview } from './quick-filter-preview';

import type { QuickFilter } from './filter-bar-layout';

const actions = {
	resetFilters: jest.fn(),
	setFilter: jest.fn(),
	setSearch: jest.fn(),
	clearSearch: jest.fn(),
	setSort: jest.fn(),
};
let hits: { id: string; record: { payload: { name: string } } }[] = [];

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) => {
		const messages: Record<string, string> = {
			'pos_products.quick_filter_preview_count': '{n} products match on this device',
			'pos_products.quick_filter_preview_count_capped': '200+ products match on this device',
			'pos_products.quick_filter_preview_empty':
				'No products match right now. You can still save this button.',
		};
		return (messages[key] ?? key).replace('{n}', String(values?.n));
	},
}));
// The POS products settings the preview must mirror; tests override per case.
let settings: { showOutOfStock: boolean; sortBy: string; sortDirection: string } = {
	showOutOfStock: false,
	sortBy: 'name',
	sortDirection: 'asc',
};
const providerProps: Record<string, unknown>[] = [];

jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, read: (value: unknown) => unknown) => read(settings),
}));
jest.mock('../../../contexts/ui-settings', () => ({ useUISettings: () => ({ uiSettings: {} }) }));
jest.mock('../../../../../query', () => ({
	QueryStateProvider: ({
		children,
		...props
	}: React.PropsWithChildren<Record<string, unknown>>) => {
		providerProps.push(props);
		return <>{children}</>;
	},
	useQueryState: () => ({ filters: {}, search: '', sort: { field: 'name', direction: 'asc' } }),
	useQueryStateActions: () => actions,
	useRelationalCollectionBinding: () => ({ resource: {} }),
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: () => ({ hits }) }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));

const draft: QuickFilter = {
	id: 'preview',
	type: 'quick',
	label: 'Preview',
	conditions: [{ field: 'on_sale', value: true }],
};

beforeEach(() => {
	jest.useFakeTimers();
	hits = [];
	providerProps.length = 0;
	settings = { showOutOfStock: false, sortBy: 'name', sortDirection: 'asc' };
	jest.clearAllMocks();
});

it('seeds the preview with the POS baseline: in-stock only unless shown, and the settings sort', () => {
	settings = { showOutOfStock: false, sortBy: 'sku', sortDirection: 'desc' };
	render(<QuickFilterPreview draft={draft} />);
	expect(providerProps[0]).toMatchObject({
		initialFilters: { status: 'publish', stock_status: 'instock' },
		initialSort: { field: 'sku', direction: 'desc' },
	});
	act(() => jest.advanceTimersByTime(250));
	// A button without its own sort previews under the settings sort, as the grid would.
	expect(actions.setSort).toHaveBeenCalledWith('sku', 'desc');

	providerProps.length = 0;
	settings = { showOutOfStock: true, sortBy: 'name', sortDirection: 'asc' };
	render(<QuickFilterPreview draft={draft} />);
	expect(providerProps[0]).toMatchObject({ initialFilters: { status: 'publish' } });
	expect((providerProps[0] as { initialFilters: object }).initialFilters).not.toHaveProperty(
		'stock_status'
	);
});

afterEach(() => jest.useRealTimers());

it('shows the local match count and first five product names', () => {
	hits = Array.from({ length: 6 }, (_, index) => ({
		id: String(index),
		record: { payload: { name: `Product ${index + 1}` } },
	}));
	render(<QuickFilterPreview draft={draft} />);

	expect(screen.getByTestId('quick-filter-preview-count').textContent).toBe(
		'6 products match on this device'
	);
	expect(screen.getByTestId('quick-filter-preview-item-4').textContent).toBe('Product 5');
	expect(screen.queryByTestId('quick-filter-preview-item-5')).toBeNull();
});

it('caps a full preview page at 200+', () => {
	hits = Array.from({ length: 200 }, (_, index) => ({
		id: String(index),
		record: { payload: { name: `Product ${index + 1}` } },
	}));
	render(<QuickFilterPreview draft={draft} />);

	expect(screen.getByTestId('quick-filter-preview-count').textContent).toBe(
		'200+ products match on this device'
	);
});

it('shows a warning when no products match', () => {
	render(<QuickFilterPreview draft={draft} />);

	expect(screen.getByTestId('quick-filter-preview-empty').textContent).toBe(
		'No products match right now. You can still save this button.'
	);
});

it('resets filters before applying every quick-filter patch entry', () => {
	const filtered: QuickFilter = {
		...draft,
		conditions: [
			{ field: 'on_sale', value: true },
			{ field: 'stock_status', value: 'instock' },
		],
	};
	render(<QuickFilterPreview draft={filtered} />);

	act(() => jest.advanceTimersByTime(250));

	expect(actions.resetFilters).toHaveBeenCalledTimes(1);
	expect(actions.setFilter).toHaveBeenNthCalledWith(1, 'on_sale', true);
	expect(actions.setFilter).toHaveBeenNthCalledWith(2, 'stock_status', 'instock');
	expect(actions.resetFilters.mock.invocationCallOrder[0]).toBeLessThan(
		actions.setFilter.mock.invocationCallOrder[0]
	);
});
