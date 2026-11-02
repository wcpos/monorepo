/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { EngineRecord } from '@wcpos/query';

import { ProductRow, VariableRow } from './row';

const mockPush = jest.fn();
let mockReadOnly = false;
let mockCanEdit = true;
let mockCanEditVariations = true;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-haptics', () => ({}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string, options?: { count?: number }) => `${key}:${options?.count}`,
}));
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
let mockFooterProps: { handle?: unknown; shown?: unknown; drawnCount?: number } = {};
jest.mock('../components/product/variable-product-row/variations/footer', () => ({
	VariationTableFooter: (props: { handle: unknown; shown: unknown; drawnCount: number }) => {
		mockFooterProps = props;
		return null;
	},
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
const productRoute = {
	pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
	params: { productId: 'one' },
};
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
// A variable product is a record like any other: the row opens it, and is inert in preview.
it.each([
	[false, 1],
	[true, 0],
])("a variable product's row opens the product (readOnly %s)", (readOnly, calls) => {
	mockReadOnly = readOnly;
	render(
		<ProductRow record={{ ...record, payload: { ...record.payload, type: 'variable' } }} expanded />
	);
	fireEvent.click(screen.getByTestId('products-row-one'));
	expect(mockPush).toHaveBeenCalledTimes(calls);
	if (calls) expect(mockPush).toHaveBeenCalledWith(productRoute);
	expect(screen.getByTestId('products-row-one').getAttribute('aria-expanded')).toBe('true');
	expect(screen.getByTestId('icon-chevronRight')).toBeTruthy();
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

// The variations query handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
const mockVariationHandle = fakeQueryHandle({
	result: {
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
	},
	total: 1,
});
const mockVariationSync = jest.fn(async () => undefined);
mockVariationHandle.sync = mockVariationSync;
const mockVariationState = jest.fn();
const mockVariationOptions = jest.fn();
let mockServedVariationHandle: FakeHandle = mockVariationHandle;
jest.mock('../../../query', () => ({
	...jest.requireActual('../../../query'),
	useCollectionQueryHandle: (_collection: unknown, state: unknown, options: unknown) => {
		mockVariationState(state);
		mockVariationOptions(options);
		return mockServedVariationHandle;
	},
}));
// The real boundary with a reset control: the row wires `onReset` to the variations retry.
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: ({
			children,
			onReset,
			resetKeys,
		}: {
			children: React.ReactNode;
			onReset?: () => void;
			resetKeys?: unknown[];
		}) => (
			<ErrorBoundary
				onReset={onReset}
				resetKeys={resetKeys}
				fallbackRender={({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => (
					<button data-testid="variations-error-reset" onClick={() => resetErrorBoundary()} />
				)}
			>
				{children}
			</ErrorBoundary>
		),
	};
});
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
	// The row opens the product; the variations open from the button under it.
	await act(async () => fireEvent.click(screen.getByTestId('products-row-one')));
	expect(mockPush).toHaveBeenCalledWith(productRoute);
	expect(screen.queryByTestId('products-row-variation')).toBeNull();
	const button = screen.getByTestId('variable-product-expand');
	expect(button.textContent).toBe('products.n_variations:1 - common.variation_found_for_term:1');
	expect(button.getAttribute('aria-expanded')).toBe('false');
	await act(async () => fireEvent.click(button));
	expect(button.getAttribute('aria-expanded')).toBe('true');
	expect(screen.getByTestId('products-row-one').getAttribute('aria-expanded')).toBe('true');
	expect(screen.getByTestId('products-row-variation').textContent).toContain('Large');
	expect(mockVariationState).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'large' }));
	expect(mockVariationOptions).toHaveBeenLastCalledWith({ remoteIds: ['22'] });
	expect(mockVariationSync).toHaveBeenCalledTimes(1);
	// The footer acts on the live handle and counts the drawn one (the same, once answered).
	expect(mockFooterProps).toMatchObject({
		handle: mockVariationHandle,
		shown: mockVariationHandle,
		drawnCount: 1,
	});
	meta.variationStockStatus = 'outofstock';
	rerender(<VariableRow {...props} />);
	expect(screen.queryByTestId('products-row-variation')).toBeNull();
	await act(async () => fireEvent.click(screen.getByTestId('variable-product-expand')));
	expect(expanded$.value.one).toBe(false);
});

// A failed variations read must stay inside the expanded row: the products list's boundary
// above would replace the whole list, retry the products handle (which has not failed) and
// remount the list with every row collapsed.
it('keeps a failed variations read inside the row; its reset retries the variations handle', async () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	const failed = fakeQueryHandle({ ready: false, error: new Error('variations read failed') });
	const retry = jest.fn(() => {
		failed.set({ error: null, ready: false });
	});
	failed.retry = retry;
	mockServedVariationHandle = failed;
	const expanded$ = new BehaviorSubject<Record<string, boolean>>({});
	const meta = {
		expanded$,
		setRowExpanded: (id: string, on: boolean) => expanded$.next({ [id]: on }),
	};
	const props = {
		item: {
			id: 'one',
			original: {
				record: { ...record, payload: { ...record.payload, type: 'variable', variations: [22] } },
			},
		},
		table: { options: { meta } },
	} as unknown as React.ComponentProps<typeof VariableRow>;
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		// The products list's boundary, with another row beside the variable one.
		render(
			<ErrorBoundary fallbackRender={() => <div data-testid="products-list-fallback" />}>
				<div data-testid="products-row-other" />
				<VariableRow {...props} />
			</ErrorBoundary>
		);
		await act(async () => fireEvent.click(screen.getByTestId('variable-product-expand')));
		expect(screen.getByTestId('variations-error-reset')).toBeTruthy();
		expect(screen.queryByTestId('products-list-fallback')).toBeNull();
		expect(screen.getByTestId('products-row-other')).toBeTruthy();
		expect(screen.getByTestId('products-row-one')).toBeTruthy();

		act(() => {
			fireEvent.click(screen.getByTestId('variations-error-reset'));
		});
		expect(retry).toHaveBeenCalledTimes(1);
		await act(async () =>
			failed.set({
				ready: true,
				result: {
					hits: [
						{
							id: 'variation',
							record: {
								uuid: 'variation',
								remoteId: '22',
								payload: { type: 'variation', name: 'Large', price: '14' },
							},
						},
					],
				},
			})
		);
		expect(screen.getByTestId('products-row-variation').textContent).toContain('Large');
		expect(screen.queryByTestId('variations-error-reset')).toBeNull();
	} finally {
		consoleError.mockRestore();
		mockServedVariationHandle = mockVariationHandle;
	}
});

// The drill style (the POS panel's `variationsStyle`): the row opens the product, the button
// under it hands the row to the screen's drill and nothing draws under it; no expander.
it('opens on press and drills from the button in the drill style, with no expanded state', async () => {
	const drill = jest.fn();
	const expanded$ = new BehaviorSubject<Record<string, boolean>>({});
	const item = {
		id: 'one',
		original: { record: { ...record, payload: { ...record.payload, type: 'variable' } } },
	};
	render(
		<VariableRow
			{...({
				item,
				table: { options: { meta: { expanded$, drill } } },
			} as unknown as React.ComponentProps<typeof VariableRow>)}
		/>
	);
	await act(async () => fireEvent.click(screen.getByTestId('products-row-one')));
	expect(mockPush).toHaveBeenCalledWith(productRoute);
	expect(drill).not.toHaveBeenCalled();
	const button = screen.getByTestId('variable-product-expand');
	expect(button.textContent).toBe('products.n_variations:0');
	expect(button.hasAttribute('aria-expanded')).toBe(false);
	await act(async () => fireEvent.click(button));
	expect(drill).toHaveBeenCalledWith(item);
	expect(expanded$.value).toEqual({});
	expect(screen.queryByTestId('products-row-variation')).toBeNull();
	expect(screen.getByTestId('products-row-one').hasAttribute('aria-expanded')).toBe(false);
	expect(
		within(screen.getByTestId('products-row-one')).getByTestId('icon-chevronRight')
	).toBeTruthy();
});
