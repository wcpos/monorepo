/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ProductVariationName, VariationParentNameContext } from './variation-name';

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('@wcpos/query/collection-map', () => ({
	sanitizeVariationAttributesRead: (attributes: unknown) => attributes,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./stock-quantity', () => ({ StockQuantity: () => null }));
jest.mock('../../../components/product/resolve-variation-name', () => ({
	resolveVariationName: () => 'Jacket - L, Gray',
}));

const Cell = ProductVariationName as unknown as React.ComponentType<{
	row: { original: { record: unknown } };
	column: { columnDef: { meta?: unknown } };
}>;
const row = {
	original: {
		record: {
			payload: {
				attributes: [
					{ name: 'Size', option: 'L' },
					{ name: 'Color', option: 'Gray' },
				],
			},
		},
	},
};
const column = { columnDef: {} };

describe('ProductVariationName', () => {
	it('names the parent above the chips on a pane row, so the options have a noun', () => {
		render(
			<VariationParentNameContext.Provider value="Adrienne Trek Jacket">
				<Cell row={row} column={column} />
			</VariationParentNameContext.Provider>
		);
		expect(screen.getByTestId('variation-parent-name').textContent).toBe('Adrienne Trek Jacket');
		expect(screen.getByText('L')).toBeTruthy();
		expect(screen.getByText('Gray')).toBeTruthy();
	});

	it('prints only the chips on an inline row, where the parent row is the line above', () => {
		render(<Cell row={row} column={column} />);
		expect(screen.queryByTestId('variation-parent-name')).toBeNull();
		expect(screen.getByText('Gray')).toBeTruthy();
	});
});
