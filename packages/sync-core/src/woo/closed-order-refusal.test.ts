import { describe, expect, it } from 'vitest';

import { POS_META_KEYS } from '../pos-carrier/carrier';
import { isClosedOrderStatus, roundingFeeAmount } from './closed-order-refusal';

describe('isClosedOrderStatus (Sentry POS-338)', () => {
	it.each(['processing', 'completed', 'cancelled', 'refunded'])('%s is closed', (status) => {
		expect(isClosedOrderStatus(status)).toBe(true);
	});

	it.each([['pending'], ['failed'], ['pos-open'], ['pos-partial'], [undefined], [42]])(
		'%s is not closed',
		(status) => {
			expect(isClosedOrderStatus(status)).toBe(false);
		}
	);
});

describe('roundingFeeAmount (Sentry POS-338)', () => {
	const fee = (over: Record<string, unknown>, posData?: unknown) => ({
		name: 'Cash rounding',
		total: '0.02',
		meta_data: posData === undefined ? [] : [{ key: POS_META_KEYS.posData, value: posData }],
		...over,
	});

	it('returns the total of a rounding fee whose posData is an object', () => {
		expect(roundingFeeAmount({ fee_lines: [fee({}, { rounding: true })] })).toBe('0.02');
	});

	it('returns the total of a rounding fee whose posData is a JSON string', () => {
		expect(roundingFeeAmount({ fee_lines: [fee({}, JSON.stringify({ rounding: true }))] })).toBe(
			'0.02'
		);
	});

	it('returns the first rounding fee, skipping a plain fee ahead of it', () => {
		const payload = {
			fee_lines: [
				fee({ name: 'Service', total: '5.00' }),
				fee({ total: '-0.03' }, { rounding: true }),
			],
		};
		expect(roundingFeeAmount(payload)).toBe('-0.03');
	});

	it('ignores a sweep tombstone (name: null)', () => {
		expect(
			roundingFeeAmount({ fee_lines: [fee({ name: null }, { rounding: true })] })
		).toBeUndefined();
	});

	it('ignores a plain fee with no rounding', () => {
		expect(roundingFeeAmount({ fee_lines: [fee({}, { rounding: false })] })).toBeUndefined();
		expect(roundingFeeAmount({ fee_lines: [fee({})] })).toBeUndefined();
	});

	it('returns undefined for a payload with no fee_lines', () => {
		expect(roundingFeeAmount({ id: 'rec-A' })).toBeUndefined();
		expect(roundingFeeAmount(undefined)).toBeUndefined();
	});

	it('returns undefined for malformed posData JSON', () => {
		expect(roundingFeeAmount({ fee_lines: [fee({}, '{"rounding":')] })).toBeUndefined();
	});
});
