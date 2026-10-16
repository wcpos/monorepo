/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { usePaymentMethodOptions } from './use-payment-method-options';
import { mergePaymentMethodOptions } from './payment-method-options';

it('unites inventory and split history with descriptor, observed-title, then id labels', () => {
	const result = mergePaymentMethodOptions(
		[
			{ id: 'pos_cash', title: 'Cash', kind: 'cash', order: 0, pos_enabled: false },
			{ id: 'stripe', title: '', kind: 'card', order: 0, pos_enabled: false },
		],
		[
			{
				payment_method: 'pos_cash',
				payment_method_title: 'Old cash',
				indexMethods: ['pos_cash', 'legacy'],
			},
			{
				payment_method: 'stripe',
				payment_method_title: 'Old card',
				indexMethods: ['legacy', 'legacy'],
			},
			{ payment_method: 'retired', payment_method_title: 'Retired gateway', indexMethods: [] },
		]
	);
	expect(result.items).toEqual([
		{ value: 'pos_cash', label: 'Cash', kind: 'cash' },
		{ value: 'stripe', label: 'Old card', kind: 'card' },
		{ value: 'legacy', label: 'legacy', kind: 'other' },
		{ value: 'retired', label: 'Retired gateway', kind: 'other' },
	]);
	expect(result.getLabel('unknown')).toBe('unknown');
});

it('groups kinds in order, sorts inventory by order then id, and appends alphabetical history', () => {
	const result = mergePaymentMethodOptions(
		[
			{ id: 'other', title: 'Z inventory', kind: 'other', order: 0 },
			{ id: 'bank', title: 'Bank', kind: 'bank_transfer', order: 0 },
			{ id: 'stored', title: 'Stored', kind: 'stored_value', order: 0 },
			{ id: 'card', title: 'Card', kind: 'card', order: 0 },
			{ id: 'cash_b', title: 'B', kind: 'cash', order: 2 },
			{ id: 'cash_a', title: 'A', kind: 'cash', order: 2 },
			{ id: 'cash_z', title: 'Z', kind: 'cash', order: 1 },
		],
		[{ payment_method: 'z', payment_method_title: 'Z history', indexMethods: ['a'] }]
	);
	expect(result.groups.map((group) => group.map((item) => item.value))).toEqual([
		['cash_z', 'cash_a', 'cash_b'],
		['card'],
		['stored'],
		['bank'],
		['other', 'a', 'z'],
	]);
});

it('omits empty ids and empty groups', () => {
	const result = mergePaymentMethodOptions([], [{ payment_method: '', indexMethods: ['', ''] }]);
	expect(result.items).toEqual([]);
	expect(result.groups).toEqual([]);
});

type Order = {
	payload: {
		payment_method: string;
		payment_method_title?: string;
		meta_data: { key: string; value: string }[];
	};
};
type Database = { collections: { orders: { find: () => { $: BehaviorSubject<Order[]> } } } };
const mockDatabases = new BehaviorSubject<Database | null>(null);
const mockRuntime = {
	engine: {
		db$: (next: (db: Database | null) => void) => {
			const subscription = mockDatabases.subscribe(next);
			return () => subscription.unsubscribe();
		},
	},
};
const mockInventory = [
	{ id: 'pos_cash', title: 'Cash', kind: 'cash', order: 0, pos_enabled: false },
];
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => mockRuntime }));
jest.mock('./use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: mockInventory }),
}));

it('observes payloads and all split legs live, rebinds on reset, and unsubscribes on unmount', () => {
	const first = new BehaviorSubject<Order[]>([
		{
			payload: {
				payment_method: 'old_card',
				payment_method_title: 'Old card',
				meta_data: [
					{ key: '_wcpos_payment_method', value: 'pos_cash' },
					{ key: '_wcpos_payment_method', value: 'gift' },
					{ key: '_wcpos_payment_method', value: 'gift' },
				],
			},
		},
	]);
	mockDatabases.next({ collections: { orders: { find: () => ({ $: first }) } } });
	const { result, unmount } = renderHook(() => usePaymentMethodOptions());
	expect(result.current.items.map((item) => item.value)).toEqual(['pos_cash', 'gift', 'old_card']);
	expect(result.current.getLabel('old_card')).toBe('Old card');
	act(() => first.next([{ payload: { payment_method: 'new_card', meta_data: [] } }]));
	expect(result.current.items.map((item) => item.value)).toEqual(['pos_cash', 'new_card']);
	const second = new BehaviorSubject<Order[]>([]);
	act(() => mockDatabases.next({ collections: { orders: { find: () => ({ $: second }) } } }));
	act(() => first.next([{ payload: { payment_method: 'stale', meta_data: [] } }]));
	expect(result.current.items.map((item) => item.value)).toEqual(['pos_cash']);
	unmount();
	expect(mockDatabases.observed).toBe(false);
	expect(second.observed).toBe(false);
});
