/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useCartLineAutosave } from './use-cart-line-autosave';

import type { UseFormReturn } from 'react-hook-form';

const mockMarkSaved = jest.fn();
let change: (changes: Record<string, unknown>) => Promise<boolean>;
jest.mock('@wcpos/components/form', () => ({
	useMarkSaved: () => mockMarkSaved,
	useFormChangeHandler: (options: { onChange: typeof change }) => {
		change = options.onChange;
		return { flush: jest.fn() };
	},
}));
const mockUpdate = jest.fn();
jest.mock('../../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: mockUpdate }),
}));
const uuidRow = (uuid: string) => ({ key: '_woocommerce_pos_uuid', value: uuid });
const mockRecord = {
	uuid: 'order-1',
	getLatest: () => mockRecord,
	payload: {
		fee_lines: [
			{ meta_data: [uuidRow('other'), { id: 3, key: 'note', value: 'x' }] },
			{ meta_data: [uuidRow('fee-1'), { id: 7, key: 'note', value: 'old' }] },
		],
	},
};
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockRecord }),
}));

const values: Record<string, unknown> = {};
const form = {
	getValues: (root: string) => values[root],
	trigger: async () => true,
} as unknown as UseFormReturn<Record<string, unknown>>;

beforeEach(() => {
	jest.clearAllMocks();
	mockUpdate.mockResolvedValue({ document: {} });
});

it.each([
	['a field writes its own root', 'amount', '12.5', { amount: '12.5' }],
	['the tax class goes out as Woo spells it', 'tax_class', 'standard', { tax_class: '' }],
	[
		// The sheet opened before the store numbered the row: the edit updates it, never appends.
		'a custom field takes the id this line holds for its key',
		'meta_data.1.value',
		[uuidRow('fee-1'), { key: 'note', value: 'new' }],
		{ meta_data: [uuidRow('fee-1'), { id: 7, key: 'note', value: 'new' }] },
	],
])('%s, on the order the sheet opened on', async (_name, path, value, patch) => {
	const root = path.split('.')[0];
	values[root] = value;
	renderHook(() => useCartLineAutosave('fee_lines', 'fee-1', form));
	expect(await change({ [path]: value })).toBe(true);
	expect(mockUpdate).toHaveBeenCalledWith('fee_lines', 'fee-1', patch, { record: mockRecord });
	expect(mockMarkSaved).toHaveBeenCalledWith([root]);
});
it('a custom field edit on a variation line carries its attribute rows as they are', async () => {
	const attributes = [
		{ attr_id: 3, display_key: 'Colour', display_value: 'Red' },
		{ attr_id: 0, display_key: 'Size', display_value: 'Large' },
	];
	values.meta_data = [uuidRow('fee-1'), ...attributes, { key: 'note', value: 'new' }];
	renderHook(() => useCartLineAutosave('fee_lines', 'fee-1', form));
	await change({ 'meta_data.3.value': 'new' });
	expect(mockUpdate).toHaveBeenCalledWith(
		'fee_lines',
		'fee-1',
		{ meta_data: [uuidRow('fee-1'), ...attributes, { id: 7, key: 'note', value: 'new' }] },
		{ record: mockRecord }
	);
});
it('a refused write is not marked saved', async () => {
	mockUpdate.mockResolvedValue(false);
	values.name = 'Fee';
	renderHook(() => useCartLineAutosave('fee_lines', 'fee-1', form));
	expect(await change({ name: 'Fee' })).toBe(false);
	expect(mockMarkSaved).not.toHaveBeenCalled();
});
