import { type Correction, deriveSettled } from './settled-figures';

const recorded = {
	expected: { cash: '100.0000', card: '20.0000' },
	counted: { cash: '98.0000', card: '20.0000' },
	variance: { cash: '-2.0000', card: '0.0000' },
	period_sales_total: '120.0000',
	period_refunds_total: '5.0000',
	perpetual_sales_total: '1000.0000',
	perpetual_refunds_total: '50.0000',
};
const correction = (
	id: number,
	type: Correction['type'],
	figures: Correction['figures'],
	created_at = '2026-09-17 12:00:00'
): Correction => ({
	id,
	type,
	figures,
	created_at,
	actor: { id: 1, name: 'Pat' },
	approver: null,
	reason: 'Audit',
});
// Revert: mutate the recorded baseline or emit unchanged comparison fields.
it('preserves the baseline and omits untouched figures', () => {
	const result = deriveSettled(recorded, []);
	expect(result.settled).toEqual(recorded);
	expect([...result.touched]).toEqual([]);
});
// Revert: omit late activity deltas or update only period, not perpetual totals.
it('adds late cash/card sales and refund deltas to both total pairs', () => {
	const result = deriveSettled(recorded, [
		correction(1, 'late_sale', {
			expected_delta: { cash: '0.0001', card: '2.1000' },
			sales_delta: '2.2001',
			refunds_delta: '0.1000',
		}),
	]);
	expect(result.settled.expected).toEqual({ cash: '100.0001', card: '22.1000' });
	expect(result.settled.variance).toEqual({ cash: '-2.0001', card: '-2.1000' });
	expect(result.settled.period_sales_total).toBe('122.2001');
	expect(result.settled.perpetual_sales_total).toBe('1002.2001');
	expect(result.settled.period_refunds_total).toBe('5.1000');
	expect(result.settled.perpetual_refunds_total).toBe('50.1000');
	expect(result.touched.has('counted.cash')).toBe(false);
	expect(recorded.expected.cash).toBe('100.0000');
});
// Revert: infer movement signs from raw amounts instead of applying server-normalized cash_delta.
it.each([
	['paid in', '3.0000', '103.0000'],
	['paid out', '-3.0000', '97.0000'],
	['void paid out', '3.0000', '103.0000'],
])('%s uses the signed cash delta', (_, delta, expected) => {
	expect(
		deriveSettled(recorded, [correction(1, 'late_movement', { cash_delta: delta })]).settled
			.expected.cash
	).toBe(expected);
});
// Revert: add recounts, trust their stale variance, process duplicates, or retain arrival order.
it('orders by timestamp/id, deduplicates, replaces supplied counts and recomputes variance once', () => {
	const recount = correction(2, 'recount', {
		counted: { cash: '105.0000' },
		variance: { cash: '999.0000' },
	});
	const result = deriveSettled(recorded, [
		correction(3, 'late_movement', { cash_delta: '0.0002' }, '2026-09-17 13:00:00'),
		recount,
		correction(1, 'recount', { counted: { cash: '101.0000' } }),
		recount,
	]);
	expect(result.settled.counted).toEqual({ cash: '105.0000', card: '20.0000' });
	expect(result.settled.variance.cash).toBe('4.9998');
	expect([...result.touched].sort()).toEqual(['counted.cash', 'expected.cash', 'variance.cash']);
});
// Revert: flag every correction field rather than only final changes.
it('omits figures whose corrections cancel', () => {
	expect([
		...deriveSettled(recorded, [
			correction(1, 'late_movement', { cash_delta: '0.1000' }),
			correction(2, 'late_movement', { cash_delta: '-0.1000' }),
		]).touched,
	]).toEqual([]);
});
// Revert: enumerate the whole server/local row instead of only financial fields (nullable metadata crashes).
it('accepts a complete closure row without inspecting nonfinancial metadata', () => {
	const row = { ...recorded, server_number: null, approved_by: null, corrections: [] };
	expect([...deriveSettled(row, []).touched]).toEqual([]);
});
