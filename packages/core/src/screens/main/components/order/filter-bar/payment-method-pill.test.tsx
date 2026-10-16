/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { PaymentMethodPill } from './payment-method-pill';
import { QueryStateProvider, useQueryState } from '../../../../../query';

jest.mock('expo-haptics', () => ({}));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));

const mockItems = [
	{ value: 'pos_cash', label: 'Cash', kind: 'cash' },
	{ value: 'stripe', label: 'Card', kind: 'card' },
];
let mockGroups = mockItems.map((item) => [item]);
jest.mock('../../../hooks/use-payment-method-options', () => ({
	usePaymentMethodOptions: () => ({
		items: mockGroups.flat(),
		groups: mockGroups,
		getLabel: (id: string) => mockItems.find((item) => item.value === id)?.label ?? id,
	}),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
const Selection = React.createContext<(option: { value: string; label: string }) => void>(
	() => undefined
);
jest.mock('@wcpos/components/select', () => ({
	Select: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (option: { value: string; label: string }) => void;
	}) => <Selection.Provider value={onValueChange}>{children}</Selection.Provider>,
	SelectPrimitiveTrigger: ({ children }: { children: React.ReactNode }) => children,
	SelectContent: ({ children }: { children: React.ReactNode }) => children,
	SelectSeparator: () => <hr />,
	SelectItem: ({
		value,
		label,
		disabled,
		testID,
	}: {
		value: string;
		label: string;
		disabled?: boolean;
		testID?: string;
	}) => {
		const select = React.useContext(Selection);
		return (
			<button
				disabled={disabled}
				data-testid={testID ?? 'empty'}
				onClick={() => select({ value, label })}
			>
				{label}
			</button>
		);
	},
}));
function FilterValue() {
	const id = useQueryState<'orders', string | undefined>((state) => state.filters.payment_method);
	return <span data-testid="filter">{id}</span>;
}
it('selects a gateway id by label and clears the filter', () => {
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<PaymentMethodPill />
			<FilterValue />
		</QueryStateProvider>
	);
	expect(screen.getByTestId('order-filter-payment-method').textContent).toBe(
		'common.payment_method'
	);
	expect(screen.getAllByRole('separator')).toHaveLength(1);
	fireEvent.click(screen.getByTestId('order-filter-payment-method-pos_cash'));
	expect(screen.getByTestId('filter').textContent).toBe('pos_cash');
	expect(screen.getByTestId('order-filter-payment-method').textContent).toBe('Cash');
	fireEvent.click(screen.getByTestId('order-filter-payment-method-remove'));
	expect(screen.getByTestId('filter').textContent).toBe('');
});

it('keeps an unknown selected gateway visible and clearable', () => {
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={10}
			initialFilters={{ payment_method: 'retired' }}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<PaymentMethodPill />
			<FilterValue />
		</QueryStateProvider>
	);
	expect(screen.getByTestId('order-filter-payment-method').textContent).toBe('retired');
	fireEvent.click(screen.getByTestId('order-filter-payment-method-remove'));
	expect(screen.getByTestId('filter').textContent).toBe('');
});

it('renders a disabled empty-state option', () => {
	mockGroups = [];
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<PaymentMethodPill />
		</QueryStateProvider>
	);
	expect(screen.getByTestId('empty').textContent).toBe('common.no_payment_methods_found');
	expect(screen.getByTestId('empty').hasAttribute('disabled')).toBe(true);
});
