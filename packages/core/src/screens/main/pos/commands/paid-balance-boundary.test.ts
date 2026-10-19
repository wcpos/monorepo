import { settleAggregate, snapshotFromOrderJSON } from '@wcpos/order-math';

import { config } from '../../../../../jest/cart-write';
import { crossesPaidBalanceBoundary } from './paid-balance-boundary';

it.each([
	['pos-partial', true, '4', '0', 'captured', true],
	['pos-partial', true, '3', '0', 'authorized', true],
	['pos-partial', true, '2', '0', 'captured', false],
	['pos-partial', false, '4', '0', 'captured', false],
	['pos-open', true, '4', '0', 'captured', false],
	['pos-partial', true, '4', '2', 'captured', false],
	['pos-partial', true, '4', '0', 'failed', false],
])(
	'%s changed=%s paid=%s refund=%s %s → %s',
	(status, changed, amount, refund, rowStatus, expected) => {
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
			changed: !!changed,
		};
		expect(crossesPaidBalanceBoundary({ payload, result, dp: 2 })).toBe(expected);
	}
);
