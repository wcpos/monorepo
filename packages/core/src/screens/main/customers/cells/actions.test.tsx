/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Actions } from './actions';

let mockReadOnly = false;
let mockCanEdit = true;
let mockTooltipShown = false;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../contexts/pro-access', () => ({
	useProAccess: () => ({ readOnly: mockReadOnly }),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditCustomers: mockCanEdit } }),
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltip: ({ children, show }: { children: React.ReactNode; show: boolean }) => {
		mockTooltipShown = show;
		return <>{children}</>;
	},
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		testID,
		onPress,
		disabled,
		accessibilityLabel,
	}: {
		testID: string;
		onPress: () => void;
		disabled?: boolean;
		accessibilityLabel: string;
	}) => (
		<button
			data-testid={testID}
			aria-label={accessibilityLabel}
			disabled={disabled}
			onClick={onPress}
		/>
	),
}));

const props = { row: { original: { record: { uuid: 'one' } } } } as unknown as React.ComponentProps<
	typeof Actions
>;

beforeEach(() => {
	mockReadOnly = false;
	mockCanEdit = true;
	mockPush.mockClear();
});

it('the caret opens the edit route', () => {
	render(<Actions {...props} />);
	const caret = screen.getByTestId('customer-open-button');
	expect(caret.getAttribute('aria-label')).toBe('customers.open_customer');
	fireEvent.click(caret);
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/customers/edit/[customerId]',
		params: { customerId: 'one' },
	});
	expect(mockTooltipShown).toBe(false);
});

it('is disabled, with the capability hint, without the edit capability', () => {
	mockCanEdit = false;
	render(<Actions {...props} />);
	const caret = screen.getByTestId('customer-open-button') as HTMLButtonElement;
	expect(caret.disabled).toBe(true);
	expect(mockTooltipShown).toBe(true);
});

it('is disabled when read-only', () => {
	mockReadOnly = true;
	render(<Actions {...props} />);
	expect((screen.getByTestId('customer-open-button') as HTMLButtonElement).disabled).toBe(true);
});
