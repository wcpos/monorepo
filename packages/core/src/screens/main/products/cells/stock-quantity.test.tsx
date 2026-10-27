/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { StockQuantity } from './stock-quantity';

const mockSwitch = jest.fn();
const mockQuantity = jest.fn();

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('react-native', () => ({
	View: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/switch', () => ({
	SwitchWithLabel: (props: Record<string, unknown>) => {
		mockSwitch(props);
		return null;
	},
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../components/quantity-input', () => ({
	QuantityInput: (props: Record<string, unknown>) => {
		mockQuantity(props);
		return null;
	},
}));
const mockProAccess = { readOnly: true };
jest.mock('../../contexts/pro-access', () => ({ useProAccess: () => mockProAccess }));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditProducts: true, canEditVariations: true } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

const renderCell = (product: Record<string, unknown>, onChange = jest.fn()) =>
	render(
		<StockQuantity
			row={{ original: { document: product, record: { payload: product } } } as never}
			table={{ options: { meta: { onChange } } } as never}
			column={{} as never}
			cell={{} as never}
			getValue={jest.fn()}
			renderValue={jest.fn()}
		/>
	);

beforeEach(() => {
	mockQuantity.mockClear();
	mockProAccess.readOnly = true;
});

it('does not update manage-stock state when editing is disabled', () => {
	const onChange = jest.fn();
	renderCell({ type: 'simple', stock_quantity: 4, manage_stock: false }, onChange);

	const onCheckedChange = mockSwitch.mock.calls[0]?.[0].onCheckedChange as (value: boolean) => void;
	onCheckedChange(true);

	expect(onChange).not.toHaveBeenCalled();
});

it('the stock is a whole count on the keypad: no trash, its testID kept, a typed 0 written', () => {
	mockProAccess.readOnly = false;
	const onChange = jest.fn();
	const product = { type: 'simple', stock_quantity: -2, manage_stock: true };
	renderCell(product, onChange);
	const props = mockQuantity.mock.calls[0]?.[0];
	expect(props).toMatchObject({
		testID: 'stock-quantity-input',
		value: -2,
		decimals: 0,
		disabled: false,
	});
	expect(props.onRemove).toBeUndefined();
	props.onChangeText(0);
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({ changes: { stock_quantity: 0 } })
	);
});

it('the stock keypad is disabled while stock is not managed', () => {
	mockProAccess.readOnly = false;
	renderCell({ type: 'simple', stock_quantity: 4, manage_stock: false });
	expect(mockQuantity.mock.calls[0]?.[0].disabled).toBe(true);
});

it('returns whether the stock was saved, so the keypad takes a refused step back', async () => {
	mockProAccess.readOnly = false;
	const onChange = jest.fn().mockResolvedValue(false);
	renderCell({ type: 'simple', stock_quantity: 4, manage_stock: true }, onChange);
	await expect(mockQuantity.mock.calls[0]?.[0].onChangeText(5)).resolves.toBe(false);
});
