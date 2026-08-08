/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { AddCartItemsMenu } from './add-cart-items-menu';

const mockTooltip = jest.fn();

jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
jest.mock('../../hooks/use-license', () => ({ useLicense: () => ({ isPro: false }) }));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canCreateCustomers: false } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./add-coupon', () => ({ AddCoupon: () => null }));
jest.mock('./add-customer', () => ({ AddCustomerDialog: () => null }));
jest.mock('./add-fee', () => ({ AddFee: () => null }));
jest.mock('./add-misc-product', () => ({ AddMiscProduct: () => null }));
jest.mock('./add-shipping', () => ({ AddShipping: () => null }));

it('renders the non-Pro customer upgrade guidance on native', () => {
	render(<AddCartItemsMenu />);

	expect(mockTooltip.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ showOnNative: true }));
});
