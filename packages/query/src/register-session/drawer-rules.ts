import { readLedger } from '@wcpos/order-math';
import { POS_META_KEYS } from '@wcpos/sync-core';
import { hasPendingLocalWork } from '@wcpos/sync-engine';

type SessionRef = { id: string; sync_status: string; closure_id?: string | null };
type ClosureRef = { id: string; sync_status: string };

/** A closure the store has not taken: neither accepted (`synced`) nor already on file there. */
export const unaccepted = (closure: { sync_status: string } | null | undefined) =>
	!!closure && !['synced', 'superseded'].includes(closure.sync_status);

/** A closed session whose count is written (an interrupted close): closing again uses it (POS-30F). */
export const countRecorded = (
	session:
		| { status?: string; sync_status?: string; counted?: Readonly<{ cash?: unknown }> | null }
		| null
		| undefined
) =>
	session?.status === 'closed' &&
	session.sync_status !== 'failed' &&
	typeof session.counted?.cash === 'string';

/**
 * The register's current session. Recover only a close this till made and never got
 * acknowledged whose closure write was interrupted (closure_id stamped, no local closure row);
 * imported closed history is synced and is never current, and a written closure needs no current
 * session. #2016, the one exception: a refused close is not history until the store has accepted
 * it or the cashier has abandoned it, so a refused (`failed`) close stays current. So does a
 * session whose status POST was refused while its closure is unaccepted (a refused abandon), at
 * whatever status it holds, until the next refresh.
 */
export function currentSession<T extends SessionRef>(
	rows: { active: readonly T[]; closed: readonly T[] },
	closures: readonly ClosureRef[]
): T | null {
	const unacceptedClosure = (id: string) => unaccepted(closures.find((row) => row.id === id));
	return (
		rows.active.find((row) => row.sync_status !== 'failed') ??
		rows.active.find((row) => row.sync_status === 'failed' && unacceptedClosure(row.id)) ??
		rows.closed.find(
			(row) =>
				row.closure_id === row.id &&
				row.sync_status !== 'synced' &&
				(!closures.some((closure) => closure.id === row.id) ||
					(row.sync_status === 'failed' && unacceptedClosure(row.id)))
		) ??
		null
	);
}

/** An order the session sold or took money on: stamped with it, or holding a ledger row of it. */
export function isSessionOrder(
	order: { payload: { meta_data?: Parameters<typeof readLedger>[0] } },
	sessionId: string
) {
	return (
		!!order.payload.meta_data?.some(
			({ key, value }: { key?: string; value?: unknown }) =>
				key === POS_META_KEYS.session && value === sessionId
		) || readLedger(order.payload.meta_data).some((row) => row.session_id === sessionId)
	);
}

/** A movement still in the drawer: not a reversal row, and no reversal names it. */
export function isLiveMovement(
	row: { id: string; type: string; voided_by?: string | null },
	movements: readonly { voids?: string | null }[]
) {
	return (
		row.type !== 'void' && !row.voided_by && !movements.some((entry) => entry.voids === row.id)
	);
}

/** Of one session's movements, the cash the store refused (#3271). A no-sale moves no cash. */
export const refusedCashOf = <T extends { sync_status: string; amount?: string | null }>(
	movements: readonly T[]
) => movements.filter((row) => row.sync_status === 'failed' && Number(row.amount) > 0);

/** A movement the server has not accepted: on its way, or refused (#3271). */
export const isUnsyncedMovement = (row: { sync_status: string }) =>
	row.sync_status === 'pending' || row.sync_status === 'failed';

/** The closure row's unsynced count; a held retry (#3304) is `failed` until rewritten: unsynced. */
export function unsyncedCount(
	session: { sync_status: string },
	orders: readonly unknown[],
	movements: readonly { sync_status: string }[]
) {
	return (
		orders.filter(hasPendingLocalWork).length +
		movements.filter(isUnsyncedMovement).length +
		(['pending', 'failed'].includes(session.sync_status) ? 1 : 0)
	);
}
