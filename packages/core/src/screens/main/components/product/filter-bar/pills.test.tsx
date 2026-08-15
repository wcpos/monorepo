/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState } from '../../../../../query';
import { BrandsPill } from './brands-pill';
import { CategoryPill } from './category-pill';
import { FeaturedPill } from './featured-pill';
import { OnSalePill } from './on-sale-pill';
import { StockStatusPill } from './stock-status-pill';
import { TagPill } from './tag-pill';

import type { FiltersOf } from '../../../../../query';

jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: (resource: { value?: unknown }) => resource.value ?? null,
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({
		children,
		onPress,
		onRemove,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		onRemove?: () => void;
	}) => (
		<div>
			<button data-testid="activate-filter" onClick={onPress} />
			{children}
			<button data-testid="clear-filter" onClick={onRemove} />
		</div>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/combobox', () => ({
	Combobox: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (option: { value: string; label: string }) => void;
	}) => (
		<div>
			<button
				data-testid="choose-combobox"
				onClick={() => onValueChange({ value: '42', label: 'Selected' })}
			/>
			{children}
		</div>
	),
	ComboboxContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ComboboxTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/select', () => ({
	Select: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (option: { value: string; label: string }) => void;
	}) => (
		<div>
			<button
				data-testid="choose-stock-status"
				onClick={() => onValueChange({ value: 'outofstock', label: 'Out of stock' })}
			/>
			{children}
		</div>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: () => null,
	SelectPrimitiveTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/tree-combobox', () => ({
	TreeCombobox: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (options: { value: string; label: string }[]) => void;
	}) => (
		<div>
			<button
				data-testid="choose-categories"
				onClick={() =>
					onValueChange([
						{ value: '11', label: 'Shirts' },
						{ value: '22', label: 'Sale' },
					])
				}
			/>
			{children}
		</div>
	),
	TreeComboboxContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TreeComboboxTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: { id?: number }) =>
		key === 'common.id_2' ? `ID: ${values?.id}` : key,
}));
jest.mock('../../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({
		items: [
			{ value: 'instock', label: 'In stock' },
			{ value: 'outofstock', label: 'Out of stock' },
		],
	}),
}));
jest.mock('../../../hooks/use-engine-document', () => ({
	useEngineDocumentsByWooId: () => ({ value: [] }),
}));
jest.mock('../brand-select', () => ({ BrandSearch: () => null }));
jest.mock('../category-select', () => ({ CategoryTreeLoader: () => null }));
jest.mock('../tag-select', () => ({ TagSearch: () => null }));

function ProductFilterProbe() {
	const filters = useQueryState<'products', FiltersOf<'products'>>((state) => state.filters);
	return <div data-testid="product-filters">{JSON.stringify(filters)}</div>;
}

function renderPill(pill: React.ReactNode, initialFilters?: Partial<FiltersOf<'products'>>) {
	return render(
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
			initialFilters={initialFilters}
		>
			{pill}
			<ProductFilterProbe />
		</QueryStateProvider>
	);
}

function storePill(Component: React.ComponentType<never>, props: Record<string, unknown> = {}) {
	return React.createElement(
		Component as unknown as React.ComponentType<Record<string, unknown>>,
		props
	);
}

function filters(): FiltersOf<'products'> {
	return JSON.parse(
		screen.getByTestId('product-filters').textContent ?? '{}'
	) as FiltersOf<'products'>;
}

describe('product filter pills', () => {
	it('sets and clears the featured filter through query-state actions', () => {
		renderPill(storePill(FeaturedPill));

		fireEvent.click(screen.getByTestId('activate-filter'));
		expect(filters()).toMatchObject({ featured: true });
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).not.toHaveProperty('featured');
	});

	it('sets and clears the on-sale filter through query-state actions', () => {
		renderPill(storePill(OnSalePill));

		fireEvent.click(screen.getByTestId('activate-filter'));
		expect(filters()).toMatchObject({ on_sale: true });
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).not.toHaveProperty('on_sale');
	});

	it('sets and clears the stock-status filter through query-state actions', () => {
		renderPill(storePill(StockStatusPill));

		fireEvent.click(screen.getByTestId('choose-stock-status'));
		expect(filters()).toMatchObject({ stock_status: 'outofstock' });
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).not.toHaveProperty('stock_status');
	});

	it('sets and clears the category id-array filter through query-state actions', () => {
		renderPill(storePill(CategoryPill));

		fireEvent.click(screen.getByTestId('choose-categories'));
		expect(filters().categories).toEqual([11, 22]);
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters().categories).toEqual([]);
	});

	it('sets and clears the tag id-array filter through query-state actions', () => {
		renderPill(storePill(TagPill, { resource: { value: null }, selectedID: undefined }));

		fireEvent.click(screen.getByTestId('choose-combobox'));
		expect(filters().tags).toEqual([42]);
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters().tags).toEqual([]);
	});

	it('sets and clears the brand id-array filter through query-state actions', () => {
		renderPill(storePill(BrandsPill, { resource: { value: null }, selectedID: undefined }));

		fireEvent.click(screen.getByTestId('choose-combobox'));
		expect(filters().brands).toEqual([42]);
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters().brands).toEqual([]);
	});
});
