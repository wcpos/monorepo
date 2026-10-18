import type { RegisterHealth } from './use-register-health';

export type RegisterReport = RegisterHealth['registers'][number];
export type RegisterGap = RegisterReport['gaps'][number];
export type RegisterDuplicate = RegisterReport['duplicates'][number];
export type RegisterSkew = RegisterReport['skew'][number];
export type ClosureGap = NonNullable<RegisterReport['closure_gaps']>[number];

/** The order checks are listed in within each band (failing, then passing). */
export const CHECK_ORDER = ['gaps', 'duplicates', 'clock', 'closures'] as const;
export type CheckKind = (typeof CHECK_ORDER)[number];

/**
 * Every check says whether it fails (sorts first, amber) and whether it is `notable`:
 * worth its own row even when it passes. A register with nothing notable is one row.
 */
type CheckBase = { failing: boolean; notable: boolean };

export type GapsCheck = CheckBase & {
	kind: 'gaps';
	/** Sum of `missing` across every gap: the receipt numbers that were never used. */
	missing: number;
	tills: number;
	/** Sorted by till, then `after`. */
	rows: RegisterGap[];
};
export type DuplicatesCheck = CheckBase & {
	kind: 'duplicates';
	/** Distinct tills whose counter restarted. */
	tills: number;
	/** Sorted by till, then counter, so a till's rows are adjacent. */
	rows: RegisterDuplicate[];
};
export type ClockCheck = CheckBase & {
	kind: 'clock';
	ahead: RegisterSkew[];
	behind: RegisterSkew[];
	/** True totals when the server sends them; `skew` itself is a capped sample. */
	aheadCount: number;
	behindCount: number;
};
export type ClosuresCheck = CheckBase & {
	kind: 'closures';
	missing: number;
	/** Ascending by `after`; the server pages newest-first and appends the leading gap last. */
	gaps: ClosureGap[];
	conflicts: NonNullable<RegisterReport['closure_conflicts']>;
	mismatches: NonNullable<RegisterReport['closure_total_mismatches']>;
};
export type RegisterCheck = GapsCheck | DuplicatesCheck | ClockCheck | ClosuresCheck;

/**
 * What one register's block shows: one "All checks passed" row when nothing is notable,
 * otherwise the ordered checks. A register without sales in the window lists only its
 * failing checks (closures are not windowed, so they can still fail), which may be none.
 */
export type RegisterState = { kind: 'clean' } | { kind: 'checks'; checks: RegisterCheck[] };

function byTill(a: { till: string }, b: { till: string }): number {
	return a.till < b.till ? -1 : a.till > b.till ? 1 : 0;
}

export function sumMissing(gaps: readonly { missing: number }[]): number {
	return gaps.reduce((total, gap) => total + gap.missing, 0);
}

function distinctTills(rows: readonly { till: string }[]): number {
	return new Set(rows.map((row) => row.till)).size;
}

export function gapsCheck(gaps: readonly RegisterGap[]): GapsCheck {
	const rows = [...gaps].sort((a, b) => byTill(a, b) || a.after - b.after);
	const failing = rows.length > 0;
	return {
		kind: 'gaps',
		failing,
		notable: failing,
		missing: sumMissing(rows),
		tills: distinctTills(rows),
		rows,
	};
}

export function duplicatesCheck(duplicates: readonly RegisterDuplicate[]): DuplicatesCheck {
	const rows = [...duplicates].sort((a, b) => byTill(a, b) || a.counter - b.counter);
	const failing = rows.length > 0;
	return { kind: 'duplicates', failing, notable: failing, tills: distinctTills(rows), rows };
}

/** Sales sharing one counter: the server's true count, else the (capped) sample of ids. */
export function duplicateSales(duplicate: RegisterDuplicate): number {
	return duplicate.orders ?? duplicate.order_ids.length;
}

export function splitSkew(skew: readonly RegisterSkew[]): {
	ahead: RegisterSkew[];
	behind: RegisterSkew[];
} {
	return {
		ahead: skew.filter((entry) => entry.direction === 'ahead'),
		behind: skew.filter((entry) => entry.direction === 'behind'),
	};
}

/** Only a clock running ahead fails; a sale received late is an offline sale, notable only. */
export function clockCheck(
	skew: readonly RegisterSkew[],
	counts?: RegisterReport['skew_counts']
): ClockCheck {
	const { ahead, behind } = splitSkew(skew);
	const failing = ahead.length > 0;
	return {
		kind: 'clock',
		failing,
		notable: failing || behind.length > 0,
		ahead,
		behind,
		aheadCount: counts?.ahead ?? ahead.length,
		behindCount: counts?.behind ?? behind.length,
	};
}

/** Null when the plugin predates closure numbering and sent none of the three lists. */
export function closuresCheck(register: RegisterReport): ClosuresCheck | null {
	const { closure_gaps, closure_conflicts, closure_total_mismatches } = register;
	if (!closure_gaps && !closure_conflicts && !closure_total_mismatches) return null;
	const gaps = [...(closure_gaps ?? [])].sort((a, b) => a.after - b.after);
	const conflicts = closure_conflicts ?? [];
	const mismatches = closure_total_mismatches ?? [];
	const failing = gaps.length + conflicts.length + mismatches.length > 0;
	return {
		kind: 'closures',
		failing,
		notable: failing,
		missing: sumMissing(gaps),
		gaps,
		conflicts,
		mismatches,
	};
}

/** The gap before the first closure on record: there is no closure #0 to count from. */
export function isLeadingClosureGap(gap: ClosureGap): boolean {
	return gap.after === 0;
}

/** Failing checks first; within each band the fixed CHECK_ORDER. */
export function orderChecks(checks: readonly RegisterCheck[]): RegisterCheck[] {
	const rank = (check: RegisterCheck) =>
		(check.failing ? 0 : CHECK_ORDER.length) + CHECK_ORDER.indexOf(check.kind);
	return [...checks].sort((a, b) => rank(a) - rank(b));
}

export function registerChecks(register: RegisterReport): RegisterCheck[] {
	const closures = closuresCheck(register);
	return orderChecks([
		gapsCheck(register.gaps),
		duplicatesCheck(register.duplicates),
		clockCheck(register.skew, register.skew_counts),
		...(closures ? [closures] : []),
	]);
}

export function registerState(register: RegisterReport): RegisterState {
	const checks = registerChecks(register);
	if (register.orders === 0) {
		return { kind: 'checks', checks: checks.filter((check) => check.failing) };
	}
	return checks.every((check) => !check.notable) ? { kind: 'clean' } : { kind: 'checks', checks };
}

/**
 * The server falls back to the register id as the till when a sale carried no till
 * stamp, so that "till" is not a device and the row must not name one.
 */
export function isUnstampedTill(till: string, registerId: string): boolean {
	return till === registerId;
}

/** A deleted order has `''` as its number; it is left out of every order list. */
export function orderNumberList(numbers: readonly string[]): string {
	return numbers.filter((number) => number !== '').join(', ');
}

/** Sales across every unknown session, for the one summary line. */
export function unknownSessionSales(sessions: RegisterHealth['unknown_sessions']): number {
	return sessions.reduce((total, session) => total + session.orders, 0);
}

/** The short form of a till, register or device id shown beside its rows. */
export function shortId(id: string): string {
	return id.slice(0, 8);
}
