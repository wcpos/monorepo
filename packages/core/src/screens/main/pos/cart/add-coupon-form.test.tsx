/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { AddCouponFormDialog } from './add-coupon-form';

const mockCreateCoupon = jest.fn();
const mockAddCoupon = jest.fn();
const mockSuccess = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockOnOpenChange = jest.fn();
const mockFormData = { code: 'SUMMER', discount_type: 'percent', amount: '10' };

jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => undefined }));
jest.mock('react-hook-form', () => ({
	useForm: () => ({
		handleSubmit: (submit: (data: typeof mockFormData) => Promise<void>) => () =>
			submit(mockFormData),
	}),
}));
jest.mock('../../components/coupon/coupon-form', () => ({
	couponFormSchema: jest.requireActual('../../components/coupon/coupon-schema').couponFormSchema,
	CouponForm: ({ footer }: { footer: import('@wcpos/components/dialog').DialogFooterProps }) => {
		const { DialogFooter } = jest.requireActual('../../../../../jest/footer.test-utils');
		return <DialogFooter {...footer} />;
	},
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? <>{children}</> : null,
	DialogContent: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'left' }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../coupons/commands/use-coupon-record', () => ({
	useCouponRecord: () => ({ createCoupon: mockCreateCoupon }),
}));
jest.mock('../hooks/use-add-coupon', () => ({
	useAddCoupon: () => ({ addCoupon: mockAddCoupon }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		success: (...args: unknown[]) => mockSuccess(...args),
		warn: (...args: unknown[]) => mockWarn(...args),
		error: (...args: unknown[]) => mockError(...args),
	}),
	getErrorMessage: (error: unknown) => String(error),
	isErrorReported: () => true,
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockCreateCoupon.mockResolvedValue({ payload: { code: 'summer' } });
	mockAddCoupon.mockResolvedValue({ success: true });
});

async function submit() {
	render(<AddCouponFormDialog open onOpenChange={mockOnOpenChange} />);
	await act(async () => {
		fireEvent.click(screen.getByTestId('coupon-form-add'));
	});
}

it('creates from the form, applies the created code, then closes', async () => {
	await submit();
	expect(mockCreateCoupon).toHaveBeenCalledWith(mockFormData);
	expect(mockAddCoupon).toHaveBeenCalledWith('summer');
	expect(mockCreateCoupon.mock.invocationCallOrder[0]).toBeLessThan(
		mockAddCoupon.mock.invocationCallOrder[0]!
	);
	expect(mockAddCoupon.mock.invocationCallOrder[0]).toBeLessThan(
		mockOnOpenChange.mock.invocationCallOrder[0]!
	);
	expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	expect(mockSuccess).toHaveBeenCalledWith(
		'pos_cart.coupon_created_applied',
		expect.objectContaining({ showToast: true, context: { couponCode: 'summer' } })
	);
});

it('warns and closes when the saved coupon cannot be applied', async () => {
	mockAddCoupon.mockResolvedValue({ success: false, error: 'Minimum spend not met' });
	await submit();
	expect(mockWarn).toHaveBeenCalledWith(
		'pos_cart.coupon_created_not_applied',
		expect.objectContaining({
			showToast: true,
			toast: {
				title: 'pos_cart.coupon_created_not_applied',
				text2: 'Minimum spend not met',
			},
		})
	);
	expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	expect(mockSuccess).not.toHaveBeenCalled();
});

it('leaves the form open without applying when creation fails', async () => {
	mockCreateCoupon.mockResolvedValue(undefined);
	await submit();
	expect(mockAddCoupon).not.toHaveBeenCalled();
	expect(mockOnOpenChange).not.toHaveBeenCalled();
	expect(mockError).not.toHaveBeenCalled();
	expect(screen.getByTestId('coupon-form-add').getAttribute('data-loading')).toBe('false');
});

it('does not report an already reported rejection again', async () => {
	mockCreateCoupon.mockRejectedValue(new Error('Already reported'));
	await submit();
	expect(mockError).not.toHaveBeenCalled();
	expect(mockAddCoupon).not.toHaveBeenCalled();
	expect(mockOnOpenChange).not.toHaveBeenCalled();
});
