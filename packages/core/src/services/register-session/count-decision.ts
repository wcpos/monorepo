import { fromMinor, toMinor } from '@wcpos/order-math';

import { countVariance, overThreshold, validAmount } from './count-money';
import { isSameCount } from './same-count';

type Count = Record<string, string>;
type Denomination = { value: string; pieces: number };

/** What the count pane decides from the session, the drawer, the cashier's entry and the store's policy. */
export type CountDecision = {
	/** Cash plus every other tender with an amount: what Close sends and the manager approves. */
	counted: { cash: string } & Count;
	valid: boolean;
	/** Counted cash less expected cash, in the count's minor units. */
	variance: number;
	/** A variance past the store's threshold that the cashier sees (never a blind one): an audit fact. */
	overThreshold: boolean;
	approvalNeeded: boolean;
	/** This session's cash the store refused (#3271), keyed by its rows; null when there is none. */
	refusedCash: { total: string; key: string } | null;
	acknowledged: boolean;
	closeAllowed: boolean;
	/** What Close does: ask the manager, retry a refused close, or close. */
	intent: 'approve' | 'retry' | 'close';
};

export function countDecision(
	session:
		{ approval_required?: boolean | null; approved_counted?: Count | null } | null | undefined,
	drawer: {
		expected: Readonly<Partial<Count>>;
		/** The drawer read's refused cash: this session's, by the closure row's rule. */
		refusedCash: readonly { id: string; amount?: string | null }[];
		figuresPending?: boolean;
		refusedClose?: boolean;
	},
	entry: { cash: string; others: Readonly<Count>; decimals: number; acknowledgedKey: string },
	policy: { blind: boolean; varianceThreshold?: string | null }
): CountDecision {
	const { decimals } = entry;
	const valid = validAmount(entry.cash, decimals);
	const counted = {
		cash: entry.cash,
		...Object.fromEntries(Object.entries(entry.others).filter(([, value]) => value !== '')),
	};
	const variance = countVariance(entry.cash, drawer.expected.cash ?? '0', decimals);
	const over =
		!policy.blind && valid && overThreshold(variance, decimals, policy.varianceThreshold);
	// A manager who already approved exactly this count is not asked again (a failed close or
	// a restart keeps the approval); a changed count or an unapproved over-threshold variance is.
	const approvedThisCount =
		!!session?.approved_counted && isSameCount(session.approved_counted, counted);
	const approvalNeeded =
		!approvedThisCount && (!!session?.approval_required || !!session?.approved_counted || over);
	// The closure records refused cash as not on the server (#3271), and Close waits for the
	// cashier to say so once.
	const refused = drawer.refusedCash;
	const refusedCash = refused.length
		? {
				total: fromMinor(
					refused.reduce((total, row) => total + toMinor(row.amount ?? '0', 4), 0),
					4
				),
				// Keyed by the refused rows, so a further refusal after the tick asks again.
				key: refused
					.map((row) => row.id)
					.sort()
					.join(),
			}
		: null;
	const acknowledged = !refusedCash || entry.acknowledgedKey === refusedCash.key;
	return {
		counted,
		valid,
		variance,
		overThreshold: over,
		approvalNeeded,
		refusedCash,
		acknowledged,
		closeAllowed:
			valid &&
			!drawer.figuresPending &&
			acknowledged &&
			Object.values(entry.others).every((value) => value === '' || validAmount(value, decimals)),
		intent: approvalNeeded ? 'approve' : drawer.refusedClose ? 'retry' : 'close',
	};
}

/**
 * Whether leaving the count abandons it to selling (#2016): a count in progress does, and so
 * does a close the store refused, the count kept. A closed session awaiting its closure write is
 * not one to reopen; one already back at open needs no second abandon. The count's back and the
 * panel's close share this rule.
 */
export const mayAbandonCount = (
	session: { status?: string } | null | undefined,
	refusedClose: boolean | undefined
) => session?.status === 'counting' || (!!refusedClose && session?.status !== 'open');

/**
 * The count a refused close kept (#2016), which the count pane starts from. The store's row
 * empties the session's note and denominations, and back to selling clears them, so those come
 * from the closure row; the count is the session's, or the closure row's when the session has
 * none, as are a note and denominations an interrupted retry (#3302) left on it (a note it
 * blanked shows the closure's again, in the form). All are copied: a document's nested field is
 * an RxDB Proxy, and the storage worker cannot clone one.
 */
export function keptCount(
	session: {
		id: string;
		counted?: Count | null;
		count_note?: string | null;
		count_denominations?: Denomination[] | null;
	},
	closure: { id: string; counted: Count; breakdowns?: Record<string, unknown> } | null
): { counted: Count; note?: string; denominations?: Denomination[] } {
	const row = closure?.id === session.id ? closure : null;
	const counted = {
		...(Object.keys(session.counted ?? {}).length ? session.counted : row?.counted),
	};
	if (!row) return { counted };
	const denominations = session.count_denominations?.length
		? session.count_denominations
		: ((row.breakdowns?.denominations ?? []) as Denomination[]);
	return {
		counted,
		note: session.count_note || String(row.breakdowns?.variance_note ?? ''),
		denominations: denominations.map(({ value, pieces }) => ({ value, pieces })),
	};
}
