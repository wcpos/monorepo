import { fromMinor, toMinor } from '@wcpos/order-math';

import type { RecordedFigures } from './settled-figures';

type Figures = Pick<RecordedFigures, 'expected' | 'counted' | 'variance'>;
type T = (key: string) => string;

/**
 * Which figures a surface shows, named at its call so the choice is visible. `recorded` is the
 * closure as the store wrote it (write-once; corrections sit beside it) and reads the variance it
 * wrote; several recorded closures sum. `settled` is a closure after its corrections
 * (`deriveSettled`), counted less expected.
 */
export type ClosureFigures =
	{ recorded: Figures | readonly Figures[] } | { settled: Partial<Figures> };

export type ClosureResult = {
	/** Counted less expected, in `decimals` minor units: below zero is short. */
	minor: number;
	kind: 'short' | 'over' | 'exact';
	tone: 'bad' | 'ok' | 'muted';
};

export const resultOf = (minor: number): ClosureResult =>
	minor < 0
		? { minor, kind: 'short', tone: 'bad' }
		: minor > 0
			? { minor, kind: 'over', tone: 'ok' }
			: { minor, kind: 'exact', tone: 'muted' };

/** The result's size in major units, unsigned: the amount "$1.00 short" leads with. */
export const resultAmount = (result: ClosureResult, decimals: number) =>
	Number(fromMinor(Math.abs(result.minor), decimals));

// The variance the store wrote for a counted tender; an expected tender nobody counted has none
// written and is short by all of it (ledger line 26). Neither: the closure has no result for it.
function recordedMinor(row: Figures, tender: string, decimals: number) {
	if (row.variance[tender] !== undefined) return toMinor(row.variance[tender], decimals);
	if (row.expected[tender] === undefined) return null;
	return toMinor(row.counted[tender] ?? '0', decimals) - toMinor(row.expected[tender], decimals);
}

/** A tender's drawer result. One recorded closure with no figure for the tender has none (null). */
export function closureResult(
	figures: { recorded: readonly Figures[] } | { settled: Partial<Figures> },
	decimals: number,
	tender?: string
): ClosureResult;
export function closureResult(
	figures: ClosureFigures,
	decimals: number,
	tender?: string
): ClosureResult | null;
export function closureResult(figures: ClosureFigures, decimals: number, tender = 'cash') {
	if ('settled' in figures) {
		const { counted, expected } = figures.settled;
		return resultOf(
			toMinor(counted?.[tender] ?? '0', decimals) - toMinor(expected?.[tender] ?? '0', decimals)
		);
	}
	const rows = figures.recorded;
	if (!Array.isArray(rows)) {
		const minor = recordedMinor(rows as Figures, tender, decimals);
		return minor === null ? null : resultOf(minor);
	}
	return resultOf(rows.reduce((sum, row) => sum + (recordedMinor(row, tender, decimals) ?? 0), 0));
}

/**
 * The Short / Over / Exact words, in one place (literal keys: the i18n ratchet refuses a computed
 * one). `label` stands alone, as a badge does; `after` follows an amount or a count ("$1.00
 * short"); `register` is the count's and the closure detail's, whose Exact is the register's key.
 */
export function resultWord(
	kind: ClosureResult['kind'],
	t: T,
	style: 'label' | 'after' | 'register' = 'after'
) {
	if (kind === 'exact') return style === 'register' ? t('register.exact') : t('reports.exact');
	if (style === 'label')
		return kind === 'short' ? t('reports.document.short') : t('reports.document.over');
	return kind === 'short' ? t('register.short') : t('register.over');
}

/** A result as one line: its amount then its word ("$1.00 short"), or the exact word alone. */
export const resultText = (
	result: ClosureResult,
	amount: string,
	t: T,
	style: 'after' | 'register' = 'after'
) =>
	result.kind === 'exact'
		? resultWord('exact', t, style)
		: `${amount} ${resultWord(result.kind, t, style)}`;
