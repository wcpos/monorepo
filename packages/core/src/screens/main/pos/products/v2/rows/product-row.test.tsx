/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ProductRow } from './product-row';
const add = jest.fn();
let lines = [{ product_id: 12, quantity: 3 }];
jest.mock('@wcpos/query', () => ({
	useDocField: (_: unknown, select: (v: object) => unknown) =>
		select({ payload: { line_items: lines } }),
}));
jest.mock('../../../hooks/use-add-product', () => ({ useAddProduct: () => ({ addProduct: add }) }));
jest.mock('../../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: {} }),
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('../../../../components/data-table/v2/rows', () => ({
	DataTableRow: ({ onPress, trailing }: { onPress: () => void; trailing: React.ReactNode }) => (
		<div>
			<button data-testid="row" onClick={onPress} />
			{trailing}
		</div>
	),
}));
const record = { remoteId: 12, uuid: 'product' };
const props = { item: { original: { record } } } as unknown as React.ComponentProps<
	typeof ProductRow
>;
it('adds the record when the row is pressed and replaces + with an in-cart count', () => {
	render(<ProductRow {...props} />);
	fireEvent.click(screen.getByTestId('row'));
	expect(add).toHaveBeenCalledWith(record);
	expect(screen.queryByTestId('add-to-cart-button')).toBeNull();
	expect(screen.getByLabelText('pos_products.in_cart_count').textContent).toBe('3');
});
it('renders the add button for a product not in the order', () => {
	lines = [];
	render(<ProductRow {...props} />);
	fireEvent.click(screen.getByTestId('add-to-cart-button'));
	expect(add).toHaveBeenCalledWith(record);
});
