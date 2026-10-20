import { classifyRefundFailure } from './refund-failure';

const t = (key: string) => key;

describe('classifyRefundFailure', () => {
	it('says no refund was made — and not "offline" — when the app was only backgrounded', () => {
		const asleep = Object.assign(new Error('asleep'), { isSleeping: true });

		expect(classifyRefundFailure(asleep, t)).toEqual({
			level: 'info',
			title: 'orders.refund_background',
			text2: 'common.try_again_now',
		});
	});

	it('says no refund was made when sign-in cancelled the refused request, never "outcome unknown"', () => {
		const cancelled = Object.assign(new Error('canceled'), {
			name: 'CanceledError',
			code: 'ERR_CANCELED',
		});

		expect(classifyRefundFailure(cancelled, t)).toEqual({
			level: 'warn',
			code: 'AUTH101',
			title: 'orders.refund_sign_in',
		});
	});

	it('says no refund was made when the request never left (offline)', () => {
		const offline = Object.assign(new Error('offline'), { blockCode: 'preflight-offline' });

		expect(classifyRefundFailure(offline, t)).toEqual({
			level: 'warn',
			code: 'SYNC121',
			title: 'orders.refund_offline',
			text2: 'common.reconnect_then_retry',
		});
	});

	it('shows the store’s own sentence for a refusal', () => {
		const refused = Object.assign(new Error('Request failed with status code 400'), {
			response: {
				status: 400,
				data: {
					code: 'woocommerce_rest_invalid_refund_amount',
					message: 'Invalid refund amount.',
					data: { status: 400 },
				},
			},
		});

		expect(classifyRefundFailure(refused, t)).toEqual({
			level: 'error',
			code: 'SYNC211',
			title: 'Invalid refund amount.',
		});
	});

	it('keeps the HTTP client’s mapped WordPress code for a refusal', () => {
		const noRoute = Object.assign(new Error('404'), {
			wpCode: 'AUTH311',
			response: { status: 404, data: { code: 'rest_no_route', message: 'No route was found.' } },
		});

		expect(classifyRefundFailure(noRoute, t)).toEqual({
			level: 'error',
			code: 'AUTH311',
			title: 'No route was found.',
		});
	});

	it('codes a permission refusal as the cashier’s role', () => {
		const forbidden = Object.assign(new Error('403'), {
			response: { status: 403, data: { code: 'x', message: 'Sorry, you are not allowed.' } },
		});

		expect(classifyRefundFailure(forbidden, t).code).toBe('AUTH201');
	});

	// Each retry mints a new idempotency key, so a lost reply must never read as
	// "failed, try again" — that is a double refund.
	it.each([
		['a lost reply', new Error('Network Error')],
		['a server error', Object.assign(new Error('500'), { response: { status: 500 } })],
		['a still-processing conflict', Object.assign(new Error('409'), { response: { status: 409 } })],
	])('sends the cashier to the order’s refunds after %s', (_label, error) => {
		expect(classifyRefundFailure(error, t)).toEqual({
			level: 'error',
			code: 'PAYMENT311',
			title: 'orders.refund_outcome_unknown',
			text2: 'orders.refund_check_before_retry',
		});
	});
});
