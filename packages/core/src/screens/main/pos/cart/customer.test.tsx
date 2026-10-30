/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Customer } from './customer';

type ChipMock = {
	testID: string;
	onPress: () => void;
	action: { onPress: () => void; testID: string; accessibilityLabel: string; muted?: boolean };
};
let mockBilling: Record<string, string> = {};

jest.mock('@wcpos/query', () => ({
	useRecordField: (_record: unknown, select: (order: object) => unknown) =>
		select({ payload: { billing: mockBilling, shipping: {}, customer_id: 7 } }),
}));
// The split itself is the Chip's test; here, which half opens what.
jest.mock('@wcpos/components/chip', () => ({
	Chip: ({ testID, onPress, action }: ChipMock) => (
		<>
			<button data-testid={`${testID}-label`} onClick={onPress} />
			<button
				data-testid={action.testID}
				data-muted={String(!!action.muted)}
				aria-label={action.accessibilityLabel}
				onClick={action.onPress}
			/>
		</>
	),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) => (
		<div data-testid="dialog" data-open={String(open)}>
			{children}
		</div>
	),
	DialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('./edit-cart-customer', () => ({ EditCartCustomerForm: () => null }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../components/user-avatar/customer-avatar', () => ({ CustomerAvatar: () => null }));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Ada Lovelace' }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: {} }),
}));

it('opens the picker from the name and the address editor from the pin', () => {
	const onShowCustomerSelect = jest.fn();
	render(<Customer onShowCustomerSelect={onShowCustomerSelect} />);
	expect(screen.getByTestId('dialog').getAttribute('data-open')).toBe('false');
	fireEvent.click(screen.getByTestId('cart-customer-name-label'));
	expect(onShowCustomerSelect).toHaveBeenCalledWith(true);
	expect(screen.getByTestId('dialog').getAttribute('data-open')).toBe('false');
	fireEvent.click(screen.getByTestId('cart-customer-address'));
	expect(screen.getByTestId('dialog').getAttribute('data-open')).toBe('true');
	expect(onShowCustomerSelect).toHaveBeenCalledTimes(1);
	expect(screen.getByTestId('cart-customer-address').getAttribute('aria-label')).toBe(
		'pos_cart.edit_customer_address'
	);
});

it.each([
	[{}, 'true'],
	[{ first_name: 'Ada' }, 'true'],
	[{ city: 'London' }, 'false'],
	[{ postcode: 'N1' }, 'false'],
])('greys the pin until billing %j has an address', (billing, muted) => {
	mockBilling = billing;
	render(<Customer onShowCustomerSelect={jest.fn()} />);
	expect(screen.getByTestId('cart-customer-address').getAttribute('data-muted')).toBe(muted);
});
