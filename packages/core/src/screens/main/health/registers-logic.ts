import type { RegisterHealth } from './use-register-health';

export type RegisterReport = RegisterHealth['registers'][number];
export type RegisterGap = RegisterReport['gaps'][number];
export type RegisterDuplicate = RegisterReport['duplicates'][number];
export type RegisterSkew = RegisterReport['skew'][number];

/** The order checks are listed in within each band (failing, then passing). */
export const CHECK_ORDER = ['gaps', 'duplicates', 'clock', 'closures'] as const;
export type CheckKind = (typeof CHECK_ORDER)[number];

export type GapsCheck = {
	kind: 'gaps';
	failing: boolean;
	/** Sum of `missing` across every gap: the receipt numbers that were never used. */
	missing: number;
	tills: number;
	rows: RegisterGap[];
};
export type DuplicatesCheck = {
	kind: 'duplicates';
	failing: boolean;
	/** One group per till whose counter restarted, its rows sorted by counter. */
	groups: { till: string; duplicates: RegisterDuplicate[] }[];
};
export type ClockCheck = {
	kind: 'clock';
	/** Only a clock running ahead fails; a sale received late is an offline sale. */
	failing: boolean;
	ahead: RegisterSkew[];
	behind: RegisterSkew[];
};
export type ClosuresCheck = {
	kind: 'closures';
	failing: boolean;
	missing: number;
	gaps: NonNullable<RegisterReport['closure_gaps']>;
	conflicts: NonNullable<RegisterReport['closure_conflicts']>;
	mismatches: NonNullable<RegisterReport['closure_total_mismatches']>;
};
export type RegisterCheck = GapsCheck | DuplicatesCheck | ClockCheck | ClosuresCheck;

/**
 * What one register's block shows:
 * - `empty`: no sales in the window. The sale checks are empty by construction; only a
 *   failing check is listed (closures are not windowed, so they can still fail);
 * - `clean`: nothing to report, so one "All checks passed" row instead of a row per check;
 * - `checks`: every check, failing ones first.
 */
export type RegisterState =
	| { kind: 'empty'; checks: RegisterCheck[] }
	| { kind: 'clean' }
	| { kind: 'checks'; checks: RegisterCheck[] };

function byTill(a: { till: string }, b: { till: string }): number {
	return a.till < b.till ? -1 : a.till > b.till ? 1 : 0;
}

export function sumMissing(gaps: readonly { missing: number }[]): number {
	return gaps.reduce((total, gap) => total + gap.missing, 0);
}

export function gapsCheck(gaps: readonly RegisterGap[]): GapsCheck {
	const rows = [...gaps].sort((a, b) => byTill(a, b) || a.after - b.after);
	return {
		kind: 'gaps',
		failing: rows.length > 0,
		missing: sumMissing(rows),
		tills: new Set(rows.map((gap) => gap.till)).size,
		rows,
	};
}

/** Groups a register's repeated counters by till; tills and counters ascending. */
export function groupDuplicatesByTill(
	duplicates: readonly RegisterDuplicate[]
): DuplicatesCheck['groups'] {
	const groups = new Map<string, RegisterDuplicate[]>();
	for (const duplicate of duplicates) {
		const group = groups.get(duplicate.till);
		if (group) group.push(duplicate);
		else groups.set(duplicate.till, [duplicate]);
	}
	return [...groups.entries()]
		.map(([till, rows]) => ({ till, duplicates: rows.sort((a, b) => a.counter - b.counter) }))
		.sort(byTill);
}

export function duplicatesCheck(duplicates: readonly RegisterDuplicate[]): DuplicatesCheck {
	const groups = groupDuplicatesByTill(duplicates);
	return { kind: 'duplicates', failing: groups.length > 0, groups };
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

export function clockCheck(skew: readonly RegisterSkew[]): ClockCheck {
	const { ahead, behind } = splitSkew(skew);
	return { kind: 'clock', failing: ahead.length > 0, ahead, behind };
}

/** Null when the plugin predates closure numbering and sent none of the three lists. */
export function closuresCheck(register: RegisterReport): ClosuresCheck | null {
	const { closure_gaps, closure_conflicts, closure_total_mismatches } = register;
	if (!closure_gaps && !closure_conflicts && !closure_total_mismatches) return null;
	const gaps = closure_gaps ?? [];
	const conflicts = closure_conflicts ?? [];
	const mismatches = closure_total_mismatches ?? [];
	return {
		kind: 'closures',
		failing: gaps.length + conflicts.length + mismatches.length > 0,
		missing: sumMissing(gaps),
		gaps,
		conflicts,
		mismatches,
	};
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
		clockCheck(register.skew),
		...(closures ? [closures] : []),
	]);
}

export function registerState(register: RegisterReport): RegisterState {
	const checks = registerChecks(register);
	if (register.orders === 0) {
		return { kind: 'empty', checks: checks.filter((check) => check.failing) };
	}
	// Late offline sales pass, but they are still a line worth reading, so they keep the rows.
	const nothingToReport = checks.every(
		(check) => !check.failing && !(check.kind === 'clock' && check.behind.length > 0)
	);
	return nothingToReport ? { kind: 'clean' } : { kind: 'checks', checks };
}

/** Sales across every unknown session, for the one summary line. */
export function unknownSessionSales(sessions: RegisterHealth['unknown_sessions']): number {
	return sessions.reduce((total, session) => total + session.orders, 0);
}

/**
 * The server lists at most this many order ids per finding (`Provenance_Health::SAMPLE_LIMIT`
 * in the free plugin) and does not send the true count, so a finding holding exactly the
 * cap has an unknown size: the row says "20 or more" instead of claiming 20.
 */
export const SERVER_SAMPLE_LIMIT = 20;

/** The short device id shown on per-till rows. */
export function shortTill(till: string): string {
	return till.slice(0, 8);
}
