/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { OrderRow } from './row';

jest.mock('expo-haptics', () => ({}));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (r: unknown) => unknown) => select(record),
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Jane Cooper' }),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({ getLabel: () => 'Completed' }),
}));
jest.mock('../../../../hooks/use-store-day-label', () => ({
	useStoreDayLabel: () => ({ day: () => 'Sat 12 Sep', dateTime: () => 'Sat 12 Sep · 15:48' }),
}));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => true }));
const record = {
	uuid: 'one',
	payload: {
		number: '1187',
		status: 'completed',
		date_created_gmt: '2026-09-12T19:48:00',
		total: '25',
		payment_method_title: 'Cash',
		customer_note: 'Deliver',
		refunds: [{ total: '-5' }],
	},
} as EngineRecord<'orders'>;
it('shows identity, note, status/date/payment and refund; press selects the record', () => {
	const onSelect = jest.fn();
	render(<OrderRow record={record} onSelect={onSelect} />);
	expect(screen.getByTestId('order-number-1187').textContent).toBe('#1187');
	expect(screen.getByTestId('orders-row-one').textContent).toContain('Jane Cooper');
	expect(screen.getByTestId('icon-messageLines')).toBeTruthy();
	expect(screen.getByTestId('orders-row-one').textContent).toContain('Completed');
	expect(screen.getByTestId('orders-row-one').textContent).toContain('Sat 12 Sep · Cash');
	expect(screen.getByTestId('orders-row-one').textContent).toContain('£25.00');
	expect(screen.getByTestId('orders-row-one').textContent).toContain('£-5.00');
	fireEvent.click(screen.getByTestId('orders-row-one'));
	expect(onSelect).toHaveBeenCalledWith('one');
});
it('omits absent notes and refunds', () => {
	render(
		<OrderRow
			record={{ ...record, payload: { ...record.payload, customer_note: '', refunds: [] } }}
			onSelect={jest.fn()}
		/>
	);
	expect(screen.queryByTestId('icon-messageLines')).toBeNull();
	expect(screen.getByTestId('orders-row-one').textContent).not.toContain('£-');
});
