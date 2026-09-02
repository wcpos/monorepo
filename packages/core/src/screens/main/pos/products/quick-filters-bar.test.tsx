/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { log } from '@wcpos/utils/logger';

import { QuickFiltersBar } from './quick-filters-bar';
import { createReadonlyView } from '../../../../extensions/slots';

import type { QuickFilter } from './quick-filters';
import type { SlotEntryProps } from '../../../../extensions/slots';
import type { FiltersOf } from '../../../../query';

let mockQuickFilters: QuickFilter[] = [];

// uuid ships ESM only; the house pattern is to stub it per suite.
jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));

jest.mock('@wcpos/query', () => ({
	useDocField: (source: unknown, select: (value: unknown) => unknown) => select(source),
}));
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: {
			get quickFilters() {
				return mockQuickFilters;
			},
		},
	}),
}));
// The slots barrel pulls in the <Slot> host, whose ErrorBoundary fallback drags in
// reanimated; jsdom can't load it and this suite renders the entry directly anyway.
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	// `variant` is the pill's active signal: the muted variant is the inactive state.
	ButtonPill: ({
		children,
		testID,
		variant,
		onPress,
	}: {
		children: React.ReactNode;
		testID: string;
		variant?: string;
		onPress: () => void;
	}) => (
		<button data-testid={testID} data-active={variant === undefined} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const api = {
	setFilter: jest.fn(async () => undefined),
	clearFilter: jest.fn(async () => undefined),
	resetFilters: jest.fn(async () => undefined),
	setSearch: jest.fn(async () => undefined),
};

const entry = {
	id: 'quick-filters',
	slot: 'pos.products.filter-bar.item' as const,
	order: 10,
	title: 'Quick filters',
	capabilities: [],
	slotApiVersion: 1,
};

const filter = (over: Partial<QuickFilter>): QuickFilter => ({
	id: 'qf-1',
	label: 'Quick',
	kind: 'category',
	value: '',
	...over,
});

function renderBar(search = '', filters: Partial<FiltersOf<'products'>> = {}) {
	const state = {
		search,
		filters: { categories: [], tags: [], brands: [], ...filters } as FiltersOf<'products'>,
	};
	const data = createReadonlyView({ getState: () => state, subscribe: () => () => undefined });
	return render(
		<QuickFiltersBar
			{...({ data, api, entry } as unknown as SlotEntryProps<'pos.products.filter-bar.item'>)}
		/>
	);
}

const pill = () => screen.getByTestId('quick-filter-qf-1');

describe('QuickFiltersBar', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockQuickFilters = [];
	});

	it('renders nothing when no quick filters are configured', () => {
		expect(renderBar().container.innerHTML).toBe('');
	});

	it('skips a value-taking filter that was never given a value', () => {
		mockQuickFilters = [filter({ kind: 'stock_status', value: '' })];
		expect(renderBar().container.innerHTML).toBe('');
	});

	it.each([
		['category', 'categories'],
		['tag', 'tags'],
		['brand', 'brands'],
	] as const)('adds a %s id to the %s array filter', (kind, field) => {
		mockQuickFilters = [filter({ kind, value: '42' })];
		renderBar('', { [field]: [7] });

		expect(pill().dataset.active).toBe('false');
		fireEvent.click(pill());
		expect(api.setFilter).toHaveBeenCalledWith(field, [7, 42]);
	});

	it('removes a taxonomy id that is already applied, and reads as active', () => {
		mockQuickFilters = [filter({ kind: 'tag', value: '42' })];
		renderBar('', { tags: [7, 42] });

		expect(pill().dataset.active).toBe('true');
		fireEvent.click(pill());
		expect(api.setFilter).toHaveBeenCalledWith('tags', [7]);
	});

	it.each(['featured', 'on_sale'] as const)('toggles the %s boolean filter on', (kind) => {
		mockQuickFilters = [filter({ kind })];
		renderBar();

		fireEvent.click(pill());
		expect(api.setFilter).toHaveBeenCalledWith(kind, true);
	});

	it('clears a boolean filter that is already on', () => {
		mockQuickFilters = [filter({ kind: 'featured' })];
		renderBar('', { featured: true });

		expect(pill().dataset.active).toBe('true');
		fireEvent.click(pill());
		expect(api.clearFilter).toHaveBeenCalledWith('featured');
	});

	it('sets stock_status, and clears it when it is already the active one', () => {
		mockQuickFilters = [filter({ kind: 'stock_status', value: 'outofstock' })];
		renderBar();
		fireEvent.click(pill());
		expect(api.setFilter).toHaveBeenCalledWith('stock_status', 'outofstock');

		cleanup();
		jest.clearAllMocks();
		renderBar('', { stock_status: 'outofstock' });
		expect(pill().dataset.active).toBe('true');
		fireEvent.click(pill());
		expect(api.clearFilter).toHaveBeenCalledWith('stock_status');
	});

	it('reports a rejected host call instead of leaving an unhandled rejection', async () => {
		mockQuickFilters = [filter({ kind: 'featured' })];
		api.setFilter.mockRejectedValueOnce(new Error('host refused'));
		renderBar();

		expect(() => fireEvent.click(pill())).not.toThrow();
		await act(async () => undefined);

		expect(log.warn).toHaveBeenCalledTimes(1);
		const [message, options] = (log.warn as jest.Mock).mock.calls[0];
		expect(message).toContain('setFilter');
		expect(message).toContain('Quick');
		expect(options.context).toMatchObject({ method: 'setFilter', quickFilterId: 'qf-1' });
	});

	it('sets the search term, and clears it when it is already the current search', () => {
		mockQuickFilters = [filter({ kind: 'search', value: 'gift card' })];
		renderBar();
		fireEvent.click(pill());
		expect(api.setSearch).toHaveBeenCalledWith('gift card');

		cleanup();
		jest.clearAllMocks();
		renderBar('gift card');
		expect(pill().dataset.active).toBe('true');
		fireEvent.click(pill());
		expect(api.setSearch).toHaveBeenCalledWith('');
	});
});
