import { settleAggregate, snapshotFromOrderJSON } from '@wcpos/order-math';

import { config } from '../../../../../jest/cart-write';
import { crossesPaidBalanceBoundary } from './paid-balance-boundary';

it.each([
	['pos-partial', true, '4', '0', 'captured', true],
	['pos-partial', true, '2', '0', 'captured', false],
	['pos-partial', false, '4', '0', 'captured', false],
	['pos-open', true, '4', '0', 'captured', false],
	['pos-partial', true, '4', '2', 'captured', false],
	['pos-partial', true, '4', '0', 'failed', false],
])(
	'%s changed=%s paid=%s refund=%s %s → %s',
	(status, changed, amount, refund, rowStatus, expected) => {
		expect(crosses(status, !!changed, amount, refund, rowStatus)).toBe(expected);
	}
);

// ADR 0040 D6: an authorization is not money taken, so it cannot settle the cart.
it('an authorized row does not cross the boundary', () => {
	expect(crosses('pos-partial', true, '3', '0', 'authorized')).toBe(false);
	expect(crosses('pos-partial', true, '3', '0', 'captured')).toBe(true);
});

function crosses(
	status: string,
	changed: boolean,
	amount: string,
	refund: string,
	rowStatus: string
): boolean {
	const payload = {
		status,
		total: '10',
		line_items: [{ total: '3', subtotal: '3' }],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: {
					schema: 1,
					payments: [{ id: 'leg', status: rowStatus, amount, refunded_amount: refund }],
				},
			},
		],
	};
	const result = {
		...settleAggregate(snapshotFromOrderJSON(payload), config),
		changed,
	};
	return crossesPaidBalanceBoundary({ payload, result, dp: 2 });
}
