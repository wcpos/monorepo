/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { resolveStock, useVariationStock, VariationStockBadge } from './stock-status';

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({
		label,
		variant,
		testID,
	}: {
		label: string;
		variant: string;
		testID?: string;
	}) => (
		<div data-testid={testID} data-variant={variant}>
			{label}
		</div>
	),
}));
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, params?: Record<string, unknown>) =>
		params ? `${key}|${JSON.stringify(params)}` : key,
}));
jest.mock('../../../../hooks/use-number-format', () => ({
	useNumberFormat: () => ({ format: (value: number) => String(value) }),
}));

type FakeVariation = Parameters<typeof useVariationStock>[0];

function variation(fields: {
	manage_stock: boolean | 'parent';
	stock_quantity?: number | null;
	stock_status: string;
	backorders?: string;
}): FakeVariation {
	return {
		payload: {
			manage_stock: fields.manage_stock,
			stock_quantity: fields.stock_quantity ?? null,
			stock_status: fields.stock_status,
			backorders: fields.backorders ?? 'no',
		},
	} as unknown as FakeVariation;
}

function Probe({
	doc,
	parent = { manage_stock: false },
}: {
	doc: FakeVariation;
	parent?: Partial<EngineRecord<'products'>['payload']>;
}) {
	const stock = useVariationStock(doc, { payload: parent } as EngineRecord<'products'>);
	return (
		<>
			<div data-testid="sellable">{String(stock.sellable)}</div>
			<VariationStockBadge stock={stock} />
		</>
	);
}

const badge = () => screen.queryByTestId('variation-popover-stock-badge');

describe('useVariationStock / VariationStockBadge', () => {
	it('shows a success quantity badge for managed in-stock', () => {
		render(
			<Probe doc={variation({ manage_stock: true, stock_quantity: 8, stock_status: 'instock' })} />
		);
		expect(screen.getByTestId('sellable').textContent).toBe('true');
		expect(badge()!.getAttribute('data-variant')).toBe('success');
		expect(badge()!.textContent).toBe('pos_products.in_stock|{"quantity":"8"}');
	});

	it('supports decimal quantities', () => {
		render(
			<Probe
				doc={variation({ manage_stock: true, stock_quantity: 3.5, stock_status: 'instock' })}
			/>
		);
		expect(badge()!.textContent).toContain('3.5');
	});

	it('blocks managed stock at zero with backorders off', () => {
		render(
			<Probe
				doc={variation({ manage_stock: true, stock_quantity: 0, stock_status: 'outofstock' })}
			/>
		);
		expect(screen.getByTestId('sellable').textContent).toBe('false');
		expect(badge()!.getAttribute('data-variant')).toBe('error');
		expect(badge()!.textContent).toBe('common.out_of_stock');
	});

	it('stays sellable on backorder with a warning badge', () => {
		render(
			<Probe
				doc={variation({
					manage_stock: true,
					stock_quantity: 0,
					stock_status: 'onbackorder',
					backorders: 'notify',
				})}
			/>
		);
		expect(screen.getByTestId('sellable').textContent).toBe('true');
		expect(badge()!.getAttribute('data-variant')).toBe('warning');
		expect(badge()!.textContent).toBe('common.on_backorder');
	});

	it('shows no badge for unmanaged in-stock variations', () => {
		render(<Probe doc={variation({ manage_stock: false, stock_status: 'instock' })} />);
		expect(screen.getByTestId('sellable').textContent).toBe('true');
		expect(badge()).toBeNull();
	});

	it('blocks unmanaged variations flagged outofstock', () => {
		render(<Probe doc={variation({ manage_stock: false, stock_status: 'outofstock' })} />);
		expect(screen.getByTestId('sellable').textContent).toBe('false');
		expect(badge()!.getAttribute('data-variant')).toBe('error');
	});

	it('follows the child status when neither record manages stock', () => {
		render(
			<Probe
				doc={variation({ manage_stock: 'parent', stock_quantity: 5, stock_status: 'outofstock' })}
			/>
		);
		expect(screen.getByTestId('sellable').textContent).toBe('false');
		expect(badge()!.textContent).toBe('common.out_of_stock');
	});

	it.each([
		{ quantity: 0, backorders: 'no', sellable: 'false', label: 'common.out_of_stock' },
		{
			quantity: 3,
			backorders: 'no',
			sellable: 'true',
			label: 'pos_products.in_stock|{"quantity":"3"}',
		},
		{ quantity: 0, backorders: 'notify', sellable: 'true', label: 'common.on_backorder' },
	] as const)('uses parent quantity $quantity with backorders $backorders', (expected) => {
		render(
			<Probe
				doc={variation({ manage_stock: 'parent', stock_status: 'instock' })}
				parent={{
					manage_stock: true,
					stock_quantity: expected.quantity,
					stock_status: 'instock',
					backorders: expected.backorders,
				}}
			/>
		);
		expect(screen.getByTestId('sellable').textContent).toBe(expected.sellable);
		expect(badge()?.textContent).toBe(expected.label);
	});

	it('uses the child quantity when it owns stock even if the parent has stock', () => {
		render(
			<Probe
				doc={variation({ manage_stock: true, stock_quantity: 0, stock_status: 'instock' })}
				parent={{ manage_stock: true, stock_quantity: 5, stock_status: 'instock' }}
			/>
		);
		expect(screen.getByTestId('sellable').textContent).toBe('false');
		expect(badge()!.textContent).toBe('common.out_of_stock');
	});

	it('preserves the child out-of-stock status when both records are unmanaged', () => {
		render(
			<Probe
				doc={variation({ manage_stock: false, stock_status: 'outofstock' })}
				parent={{ manage_stock: false, stock_status: 'instock' }}
			/>
		);
		expect(screen.getByTestId('sellable').textContent).toBe('false');
		expect(badge()!.textContent).toBe('common.out_of_stock');
	});
});

describe('resolveStock', () => {
	it.each([
		{
			name: 'managed positive quantity',
			input: {
				manage_stock: true,
				stock_quantity: 2.5,
				stock_status: 'outofstock',
				backorders: 'no',
			},
			expected: { status: 'instock', quantity: 2.5, sellable: true },
		},
		{
			name: 'managed depleted stock without backorders',
			input: {
				manage_stock: true,
				stock_quantity: 0,
				stock_status: 'instock',
				backorders: 'no',
			},
			expected: { status: 'outofstock', quantity: null, sellable: false },
		},
		{
			name: 'managed depleted stock with backorders',
			input: {
				manage_stock: true,
				stock_quantity: 0,
				stock_status: 'outofstock',
				backorders: 'notify',
			},
			expected: { status: 'onbackorder', quantity: null, sellable: true },
		},
		{
			// WooCommerce defaults backorders to 'no' (abstract-wc-product.php) —
			// a partial payload missing the field must sell out at zero, exactly
			// like the online store (owner ruling 2026-08-20).
			name: 'managed depleted stock with the backorders field missing',
			input: {
				manage_stock: true,
				stock_quantity: 0,
				stock_status: 'instock',
			},
			expected: { status: 'outofstock', quantity: null, sellable: false },
		},
		{
			name: 'unmanaged out-of-stock status',
			input: {
				manage_stock: false,
				stock_quantity: 9,
				stock_status: 'outofstock',
				backorders: 'yes',
			},
			expected: { status: 'outofstock', quantity: null, sellable: false },
		},
		{
			name: 'unmanaged backorder status',
			input: {
				manage_stock: false,
				stock_quantity: null,
				stock_status: 'onbackorder',
				backorders: 'no',
			},
			expected: { status: 'onbackorder', quantity: null, sellable: true },
		},
	])('resolves $name', ({ input, expected }) => {
		expect(resolveStock(input)).toEqual(expected);
	});
});
