import { reportCartFailure, reportCartInvariant, reportStaleCartLine } from './cart-failure';

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => {
		if (error instanceof Error) return error.message;
		return String(error);
	},
}));

jest.mock('@wcpos/utils/logger/generated/error-codes.generated', () => ({
	ERROR_CODES: {
		CART_UPDATE_FAILED: 'CART_UPDATE_FAILED',
		UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
	},
}));

const logger = {
	error: jest.fn(),
	warn: jest.fn(),
};

describe('cart-failure', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('reports a cashier-visible failure with the default code', () => {
		reportCartFailure(logger as never, 'Cart write failed', {
			toastTitle: 'Could not update cart',
			context: { orderId: 7 },
		});

		expect(logger.error).toHaveBeenCalledWith('Cart write failed', {
			showToast: true,
			code: 'CART_UPDATE_FAILED',
			toast: { title: 'Could not update cart' },
			context: { orderId: 7 },
		});
	});

	it('uses an explicit error code override', () => {
		reportCartFailure(logger as never, 'Cart write failed', {
			toastTitle: 'Could not update cart',
			code: 'UNEXPECTED_ERROR' as never,
		});

		expect(logger.error).toHaveBeenCalledWith('Cart write failed', {
			showToast: true,
			code: 'UNEXPECTED_ERROR',
			toast: { title: 'Could not update cart' },
			context: undefined,
		});
	});

	it('adds the extracted error message without losing other context', () => {
		reportCartFailure(logger as never, 'Cart write failed', {
			toastTitle: 'Could not update cart',
			context: { orderId: 7, error: 'old' },
			error: new Error('boom'),
		});

		expect(logger.error).toHaveBeenCalledWith('Cart write failed', {
			showToast: true,
			code: 'CART_UPDATE_FAILED',
			toast: { title: 'Could not update cart' },
			context: { orderId: 7, error: 'boom' },
		});
	});

	it('reports a stale cart line as a warning without an error code', () => {
		reportStaleCartLine(logger as never, 'Line is stale', {
			toastTitle: 'Line no longer exists',
			context: { uuid: 'line-1' },
		});

		expect(logger.warn).toHaveBeenCalledWith('Line is stale', {
			showToast: true,
			toast: { title: 'Line no longer exists' },
			context: { uuid: 'line-1' },
		});
	});

	it('reports an invariant without any toast options', () => {
		reportCartInvariant(logger as never, 'Impossible cart state', {
			uuid: 'line-1',
		});

		expect(logger.error).toHaveBeenCalledWith('Impossible cart state', {
			code: 'UNEXPECTED_ERROR',
			context: { uuid: 'line-1' },
		});
		expect(logger.error.mock.calls[0][1]).not.toHaveProperty('showToast');
		expect(logger.error.mock.calls[0][1]).not.toHaveProperty('toast');
	});
});
