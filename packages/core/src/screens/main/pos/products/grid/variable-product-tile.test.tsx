/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { VariableProductTile } from './variable-product-tile';

// The popover root is the tile's box: it carries the size class.
jest.mock('@wcpos/components/popover', () => ({
	Popover: ({ className, children }: React.PropsWithChildren<{ className?: string }>) => (
		<div data-testid="inline-tile-box" data-class-name={className}>
			{children}
		</div>
	),
	PopoverTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
	PopoverContent: () => null,
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: object, select: (value: object) => unknown) => select(record),
}));
jest.mock('../cells/variations-popover', () => ({
	useProductsStockStatusFilter: () => undefined,
	VariationsPopover: () => null,
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../hooks/use-add-variation', () => ({ useAddVariation: () => ({}) }));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../../components/product/price-with-tax', () => ({ PriceWithTax: () => null }));
jest.mock('./tile-image', () => ({ TileImage: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

const record = {
	uuid: 'hoodie',
	remoteId: 7,
	payload: { name: 'Hoodie', meta_data: [] },
} as unknown as React.ComponentProps<typeof VariableProductTile>['record'];
const gridFields = {
	name: true,
	price: false,
	tax: false,
	on_sale: false,
	category: false,
	sku: false,
	barcode: false,
	stock_quantity: false,
	cost_of_goods_sold: false,
};

it('grows to its row in a dealt cell, and shares the row with flex-1 elsewhere', () => {
	const size = () =>
		(screen.getByTestId('inline-tile-box').getAttribute('data-class-name') ?? '').split(' ');
	const { rerender } = render(<VariableProductTile record={record} gridFields={gridFields} />);
	expect(size()).toContain('flex-1');
	expect(size()).not.toContain('grow');
	rerender(<VariableProductTile record={record} gridFields={gridFields} grow />);
	expect(size()).toContain('grow');
	expect(size()).not.toContain('flex-1');
});
