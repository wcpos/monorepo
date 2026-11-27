/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { CartHeader } from './cart-header';

let mockResolvePick: (value: boolean) => void = () => {};
const mockAddCustomer = jest.fn(
	() => new Promise<boolean>((resolve) => (mockResolvePick = resolve))
);

jest.mock('../hooks/use-add-customer', () => ({
	useAddCustomer: () => ({ addCustomer: mockAddCustomer }),
}));
jest.mock('./customer', () => ({
	Customer: ({ onShowCustomerSelect }: { onShowCustomerSelect: (show: boolean) => void }) => (
		<button data-testid="customer-pill" onClick={() => onShowCustomerSelect(true)} />
	),
}));
// A pick closes the list first (the 10 ms close timer), then hands the value over.
jest.mock('@wcpos/components/combobox', () => ({
	Combobox: ({
		children,
		onValueChange,
		onOpenChange,
	}: React.PropsWithChildren<{
		onValueChange: (option: { item: object }) => void;
		onOpenChange: (open: boolean) => void;
	}>) => (
		<>
			<button
				data-testid="pick-customer"
				onClick={() => {
					onOpenChange(false);
					onValueChange({ item: { id: 7 } });
				}}
			/>
			{children}
		</>
	),
	ComboboxTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ComboboxContent: () => null,
}));
jest.mock('@wcpos/components/chip', () => ({
	Chip: ({ testID, label, disabled }: { testID: string; label: string; disabled?: boolean }) => (
		<button data-testid={testID} disabled={disabled}>
			{label}
		</button>
	),
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/skeleton', () => ({ Skeleton: () => null }));
jest.mock('react-native', () => ({
	View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/query', () => ({ useRecordField: () => undefined }));
jest.mock('./add-cart-items-menu', () => ({ AddCartItemsMenu: () => null }));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('../../components/ui-settings', () => ({ UISettingsDialog: () => null }));
jest.mock('../../components/customer-select', () => ({ CustomerSearch: () => null }));
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: {} }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../hooks/use-store-day-label', () => ({
	useStoreDayLabel: () => ({ dateTime: () => '' }),
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => '' }),
}));

beforeAll(() => {
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
});

it('T5: a pick waiting for the tax rates keeps the select shown, busy, until it resolves (#3843)', async () => {
	jest.useFakeTimers();
	render(<CartHeader />);
	fireEvent.click(screen.getByTestId('customer-pill'));
	fireEvent.click(screen.getByTestId('pick-customer'));
	// Past the close timer: the rates are not ready, so the pick still waits.
	await act(async () => void jest.advanceTimersByTime(50));
	const chip = screen.getByTestId('cart-customer-select') as HTMLButtonElement;
	expect(chip.textContent).toBe('common.loading');
	expect(chip.disabled).toBe(true);
	expect(screen.queryByTestId('customer-pill')).toBeNull();
	await act(async () => mockResolvePick(true));
	expect(screen.queryByTestId('cart-customer-select')).toBeNull();
	expect(screen.getByTestId('customer-pill')).toBeTruthy();
	jest.useRealTimers();
});
