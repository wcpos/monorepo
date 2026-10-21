import { fromMinor, readLedger, toMinor, upsertPaymentRow, withLedger } from '@wcpos/order-math';
import type {
	MetaDataEntry,
	OrderPaymentSummary,
	PaymentRefundEntry,
	PaymentRow,
} from '@wcpos/order-math';

import {
	applyEngineResidentChanges,
	patchEngineResident,
	resolveEngineResident,
	scopeBarcodeSelectors,
} from './resident';

import type { QueryRuntime } from '../provider';

export interface ServerOrderMirror {
	status?: string;
	total?: string;
	payment_method?: string;
	payment_method_title?: string;
	meta_data: unknown[];
}

/** The server already applied this payment; enqueueing would save back over its answer. */
export function mirrorServerOrder(manager: QueryRuntime, uuid: string, changes: ServerOrderMirror) {
	return patchEngineResident({
		manager,
		collection: 'orders',
		recordId: uuid,
		changes: { ...changes },
	});
}

export interface MoneyAnswer {
	payment?: PaymentRow | null;
	order?: OrderPaymentSummary | null;
	/** Meta the answer asserts, applied to the LATEST meta (the awaiting-customer stamp). */
	meta?: (meta: MetaDataEntry[]) => MetaDataEntry[];
	/** The summary's total, for a device leg whose tip moved it. */
	total?: string;
	/** The revision the command was sent with: the summary is written only while it stands. */
	sentRevision?: string | null;
}

/** pending → authorized → captured → voided; any live state → failed/voided; never backwards. */
const STATE_RANK: Record<string, number> = { pending: 0, authorized: 1, captured: 2 };
const rank = (status: string) =>
	status === 'failed' || status === 'voided' ? 3 : (STATE_RANK[status] ?? -1);

const REFUND_RANK = { pending: 0, succeeded: 1, failed: 1 } as const;

function unionBy<T>(
	a: readonly T[] = [],
	b: readonly T[] = [],
	key: (item: T) => string,
	keep: (x: T, y: T) => T
) {
	const merged = new Map(a.map((item) => [key(item), item]));
	for (const item of b) {
		const existing = merged.get(key(item));
		merged.set(key(item), existing ? keep(existing, item) : item);
	}
	return [...merged.values()];
}

/**
 * A row stamp as the whole second it denotes. The app stamps to the millisecond with `Z`, the
 * store to the second with `+00:00` (`gmdate('c')`), so strings never compare: the instant is
 * compared at the store's granularity, and within one second the state rank decides. An
 * unparseable stamp counts as the earliest.
 */
function stampSecond(stamp: string | null | undefined): number {
	// A `_gmt` stamp written without a zone (legacy rows) is GMT, never local time.
	const zoned = stamp && !/(?:Z|[+-]\d\d:?\d\d)$/i.test(stamp) ? `${stamp}Z` : stamp;
	const instant = Date.parse(zoned ?? '');
	return Number.isNaN(instant) ? -Infinity : Math.floor(instant / 1000);
}

/** The answered row replaces the resident's whole, or the resident's stays whole; arrays union. */
function mergeAnsweredRow(resident: PaymentRow | undefined, answer: PaymentRow): PaymentRow {
	if (!resident) return answer;
	const answered = stampSecond(answer.updated_at_gmt);
	const held = stampSecond(resident.updated_at_gmt);
	const replace =
		answered > held || (answered === held && rank(answer.status) > rank(resident.status));
	const [kept, other] = replace ? [answer, resident] : [resident, answer];
	const refunds = unionBy<PaymentRefundEntry>(
		kept.refunds,
		other.refunds,
		(r) => String(r.id),
		(x, y) => (REFUND_RANK[y.status] > REFUND_RANK[x.status] ? y : x)
	);
	const dp = (kept.amount.split('.')[1] ?? '').length;
	const providerRefs = { ...other.provider_refs };
	for (const [key, value] of Object.entries(kept.provider_refs ?? {}))
		if (value !== null || !(key in providerRefs)) providerRefs[key] = value;
	return {
		...kept,
		refunds,
		refunded_amount: fromMinor(
			refunds.reduce((sum, r) => sum + (r.status === 'succeeded' ? toMinor(r.amount, dp) : 0), 0),
			dp
		),
		provider_refs: providerRefs,
		...(kept.events || other.events
			? {
					events: unionBy(
						kept.events,
						other.events,
						(e) => `${e.t}\u0000${e.message}`,
						(x) => x
					),
				}
			: {}),
	};
}

/**
 * Mirror a money command's answer onto the LATEST resident, never from a pre-command snapshot
 * (ADR 0040 §1.3): the row is upserted by id and nothing is deleted; the summary is written only
 * while the resident still carries the revision the command was sent with, so an older status
 * never lands under a newer stamp, and neither does a caller's metadata change (the gateway
 * stamp). The revision stamp itself is untouched; the refresh after it adopts.
 */
export async function mirrorMoneyAnswer(manager: QueryRuntime, uuid: string, answer: MoneyAnswer) {
	const scoped = await resolveEngineResident(manager, 'orders', uuid);
	if (!scoped) throw new Error(`Engine resident "${uuid}" is missing from "orders"`);
	const selectors = scopeBarcodeSelectors(scoped.scope, 'orders');
	return applyEngineResidentChanges(
		scoped.resident,
		'orders',
		(payload, current) => {
			const meta = (payload.meta_data ?? []) as MetaDataEntry[];
			const rows = readLedger(meta);
			const { payment, order } = answer;
			const ledgerMeta = payment
				? withLedger(
						meta,
						upsertPaymentRow(
							rows,
							mergeAnsweredRow(
								rows.find((r) => r.id === payment.id),
								payment
							)
						)
					)
				: meta;
			const sync = current?.sync as { revision?: unknown } | undefined;
			const underSentRevision = !!answer.sentRevision && sync?.revision === answer.sentRevision;
			const summary = {
				status: order?.status,
				payment_method: order?.payment_method,
				payment_method_title: order?.payment_method_title,
				total: answer.total,
			};
			return {
				// A stamp change (an invoice sent or cancelled) is the answer's view at its own
				// revision, like the summary: under a newer adopted document it never lands, or an old
				// cancel would erase another till's newer invoice stamp.
				meta_data: answer.meta && underSentRevision ? answer.meta(ledgerMeta) : ledgerMeta,
				...(order && underSentRevision
					? Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined))
					: {}),
			};
		},
		selectors
	);
}
