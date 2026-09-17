import type { ClosureRow } from '@wcpos/database';
import { fromMinor, toMinor } from '@wcpos/order-math';

export type Correction = {
	id: number;
	type: 'late_sale' | 'late_movement' | 'recount';
	created_at: string;
	actor: { id: number; name: string };
	approver: { id: number; name: string } | null;
	reason: string;
	figures: {
		expected_delta?: Record<string, string>;
		cash_delta?: string;
		sales_delta?: string;
		refunds_delta?: string;
		counted?: Record<string, string>;
		variance?: Record<string, string>;
	};
};
export type RecordedFigures = Pick<
	ClosureRow,
	| 'expected'
	| 'counted'
	| 'variance'
	| 'period_sales_total'
	| 'period_refunds_total'
	| 'perpetual_sales_total'
	| 'perpetual_refunds_total'
>;
export function deriveSettled(recorded: RecordedFigures, corrections: readonly Correction[]) {
	const settled = {
		...recorded,
		expected: { ...recorded.expected },
		counted: { ...recorded.counted },
		variance: { ...recorded.variance },
	};
	const add = (a = '0', b = '0') => fromMinor(toMinor(a, 4) + toMinor(b, 4), 4);
	const seen = new Set<number>();
	for (const correction of [...corrections].sort(
		(a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id
	)) {
		if (seen.has(correction.id)) continue;
		seen.add(correction.id);
		const f = correction.figures;
		if (correction.type === 'recount') Object.assign(settled.counted, f.counted);
		const deltas =
			correction.type === 'late_movement'
				? { cash: f.cash_delta ?? '0' }
				: correction.type === 'late_sale'
					? (f.expected_delta ?? {})
					: {};
		for (const [tender, delta] of Object.entries(deltas))
			settled.expected[tender] = add(settled.expected[tender], delta);
		if (correction.type === 'late_sale') {
			for (const period of ['period', 'perpetual'] as const) {
				settled[`${period}_sales_total`] = add(settled[`${period}_sales_total`], f.sales_delta);
				settled[`${period}_refunds_total`] = add(
					settled[`${period}_refunds_total`],
					f.refunds_delta
				);
			}
		}
	}
	if (corrections.length)
		for (const tender of Object.keys(settled.counted)) {
			settled.variance[tender] = fromMinor(
				toMinor(settled.counted[tender], 4) - toMinor(settled.expected[tender] ?? '0', 4),
				4
			);
		}
	const touched = new Set<string>();
	for (const field of [
		'expected',
		'counted',
		'variance',
		'period_sales_total',
		'period_refunds_total',
		'perpetual_sales_total',
		'perpetual_refunds_total',
	] as const) {
		const value = settled[field];
		if (typeof value === 'string') {
			if (toMinor(value, 4) !== toMinor(recorded[field] as string, 4)) touched.add(field);
		} else
			for (const [tender, amount] of Object.entries(value)) {
				if (
					toMinor(amount, 4) !==
					toMinor((recorded[field] as Record<string, string>)[tender] ?? '0', 4)
				)
					touched.add(`${field}.${tender}`);
			}
	}
	return { settled, touched };
}
