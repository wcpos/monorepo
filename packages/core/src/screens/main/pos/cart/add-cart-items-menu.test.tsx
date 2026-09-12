/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { AddCartItemsMenu } from './add-cart-items-menu';

const mockTooltip = jest.fn();

// No provider is mounted here; avoid loading the settings provider's ESM-only dependencies.
jest.mock('../../contexts/ui-settings', () => ({ useUISettings: jest.fn() }));

jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogContent: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuItem: ({
		children,
		testID,
		disabled,
		onPress,
	}: React.PropsWithChildren<{
		testID: string;
		disabled?: boolean;
		onPress?: () => void;
	}>) => (
		<button data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	DropdownMenuSeparator: () => null,
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children, ...props }: { children: React.ReactNode; showOnNative?: boolean }) => {
		mockTooltip(props);
		return <>{children}</>;
	},
	TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: false } }),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canCreateCustomers: false } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./add-coupon', () => ({ AddCoupon: () => null }));
jest.mock('./add-customer', () => ({ AddCustomerDialog: () => null }));
jest.mock('./add-discount', () => ({ AddDiscount: () => null }));
jest.mock('./add-fee', () => ({ AddFee: () => null }));
jest.mock('./add-misc-product', () => ({ AddMiscProduct: () => null }));
jest.mock('./add-shipping', () => ({ AddShipping: () => null }));

it('renders the non-Pro customer upgrade guidance on native', () => {
	render(<AddCartItemsMenu />);

	expect(mockTooltip.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ showOnNative: true }));
});

it('enables coupons and discounts for non-Pro tills, and opens the discount dialog', () => {
	render(<AddCartItemsMenu />);
	expect((screen.getByTestId('menu-add-coupon') as HTMLButtonElement).disabled).toBe(false);
	expect((screen.getByTestId('menu-add-discount') as HTMLButtonElement).disabled).toBe(false);
	expect((screen.getByTestId('menu-add-customer') as HTMLButtonElement).disabled).toBe(true);
	const ids = screen.getAllByRole('button').map((button) => button.dataset.testid);
	expect(ids[ids.indexOf('menu-add-fee') + 1]).toBe('menu-add-discount');
	fireEvent.click(screen.getByTestId('menu-add-discount'));
	expect(screen.getByTestId('add-discount-dialog').textContent).toBe('pos_cart.add_discount');
});
