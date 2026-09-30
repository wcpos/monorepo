/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';
import { ObservableResource } from 'observable-hooks';

import type { EngineRecord } from '@wcpos/query';

import { ProductRow, VariableRow } from './row';

const mockPush = jest.fn();
let mockReadOnly = false;
let mockCanEdit = true;
let mockCanEditVariations = true;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
jest.mock('@wcpos/components/image', () => ({ Image: () => <span data-testid="image" /> }));
jest.mock('@wcpos/query', () => ({
	useRecordField: (r: unknown, select: (r: unknown) => unknown) => select(r),
}));
jest.mock('../contexts/pro-access', () => ({ useProAccess: () => ({ readOnly: mockReadOnly }) }));
jest.mock('../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({
		caps: { canEditProducts: mockCanEdit, canEditVariations: mockCanEditVariations },
	}),
}));
jest.mock('../hooks/use-image-attachment', () => ({
	useImageAttachment: () => ({ uri: 'image' }),
}));
jest.mock('../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({ getLabel: () => 'In stock' }),
}));
jest.mock('../components/product/price-with-tax', () => ({
	PriceWithTax: ({ price }: { price: string }) => <span>{price}</span>,
}));
jest.mock('../components/product/variable-product-row/variations/filters', () => ({
	VariationsFilterBar: () => null,
}));
jest.mock('../components/product/variable-product-row/variations/footer', () => ({
	VariationTableFooter: () => null,
}));
const record = {
	uuid: 'one',
	payload: {
		type: 'simple',
		name: 'Hat &amp; scarf',
		sku: 'HAT',
		price: '12.50',
		manage_stock: true,
		stock_quantity: 8,
		stock_status: 'instock',
	},
} as EngineRecord<'products'>;
beforeEach(() => {
	mockPush.mockClear();
	mockReadOnly = false;
	mockCanEdit = true;
	mockCanEditVariations = true;
});
it('shows decoded name over SKU, price, image and quantity with a stock word', () => {
	render(<ProductRow record={record} />);
	const row = screen.getByTestId('products-row-one');
	expect(row.textContent).toContain('Hat & scarfHAT');
	expect(row.textContent).toContain('12.50');
	expect(row.textContent).toContain('8 · In stock');
	expect(screen.getByTestId('image')).toBeTruthy();
});
it.each([
	[false, true, 1],
	[true, true, 0],
	[false, false, 0],
])('gates product editing (readOnly %s, capability %s)', (readOnly, allowed, calls) => {
	mockReadOnly = readOnly;
	mockCanEdit = allowed;
	render(<ProductRow record={record} />);
	fireEvent.click(screen.getByTestId('products-row-one'));
	expect(mockPush).toHaveBeenCalledTimes(calls);
	if (calls)
		expect(mockPush).toHaveBeenCalledWith({
			pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
			params: { productId: 'one' },
		});
});
it('toggles variable expansion instead of editing, including in preview', () => {
	mockReadOnly = true;
	const toggle = jest.fn();
	render(
		<ProductRow
			record={{ ...record, payload: { ...record.payload, type: 'variable' } }}
			expanded
			onToggle={toggle}
		/>
	);
	fireEvent.click(screen.getByTestId('products-row-one'));
	expect(toggle).toHaveBeenCalledTimes(1);
	expect(mockPush).not.toHaveBeenCalled();
	expect(screen.getByTestId('icon-chevronUp')).toBeTruthy();
});
it('names the variation from its attributes and respects the variation capability', () => {
	const variation = {
		...record,
		payload: {
			...record.payload,
			type: 'variation',
			attributes: [{ name: 'Size', option: 'Large' }],
		},
	} as unknown as EngineRecord<'variations'>;
	const { unmount } = render(<ProductRow record={variation} />);
	expect(screen.getByTestId('products-row-one').textContent).toContain('Large');
	fireEvent.click(screen.getByTestId('products-row-one'));
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/products/(modals)/edit/variation/[variationId]',
		params: { variationId: 'one' },
	});
	unmount();
	mockPush.mockClear();
	mockCanEditVariations = false;
	render(<ProductRow record={variation} />);
	fireEvent.click(screen.getByTestId('products-row-one'));
	expect(mockPush).not.toHaveBeenCalled();
});

jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));

const mockVariationResult = new BehaviorSubject({
	hits: [
		{
			id: 'variation',
			record: {
				uuid: 'variation',
				remoteId: '22',
				payload: { type: 'variation', name: 'Large', price: '14', stock_status: 'instock' },
			},
		},
	],
});
const mockVariationBinding = {
	resource: new ObservableResource(mockVariationResult),
	active$: of(false),
	total$: of(1),
	sync: jest.fn(async () => undefined),
};
const mockVariationState = jest.fn();
jest.mock('../../../query', () => ({
	...jest.requireActual('../../../query'),
	useCollectionBinding: (_collection: unknown, state: unknown) => {
		mockVariationState(state);
		return mockVariationBinding;
	},
}));
it('keeps touch variations inline, seeds relational matches and follows stock filters', async () => {
	const expanded$ = new BehaviorSubject<Record<string, boolean>>({});
	const meta = {
		expanded$,
		variationStockStatus: undefined as string | undefined,
		setRowExpanded: (id: string, on: boolean) => expanded$.next({ [id]: on }),
	};
	const props = {
		item: {
			id: 'one',
			original: {
				record: { ...record, payload: { ...record.payload, type: 'variable', variations: [22] } },
				childrenSearchCount: 1,
				parentSearchTerm: 'large',
			},
		},
		table: { options: { meta } },
	} as unknown as React.ComponentProps<typeof VariableRow>;
	const { rerender } = render(<VariableRow {...props} />);
	await act(async () => fireEvent.click(screen.getByTestId('products-row-one')));
	expect(screen.getByTestId('products-row-variation').textContent).toContain('Large');
	expect(mockVariationState).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'large' }));
	expect(mockVariationBinding.sync).toHaveBeenCalled();
	meta.variationStockStatus = 'outofstock';
	rerender(<VariableRow {...props} />);
	expect(screen.queryByTestId('products-row-variation')).toBeNull();
	await act(async () => fireEvent.click(screen.getByTestId('products-row-one')));
	expect(expanded$.value.one).toBe(false);
});
