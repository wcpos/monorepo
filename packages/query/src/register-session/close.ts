import { filter, firstValueFrom } from 'rxjs';

import type { SiteDocument } from '@wcpos/database';
import { toMinor } from '@wcpos/order-math';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { recordRegisterFact } from './audit';
import { countRecorded } from './drawer-rules';
import { recordLiveSession } from './register-document';
import { settleSessionAccounting } from './reads';
import {
	closeSession,
	RegisterSessionRequiredError,
	requeueClose,
	writeClosure,
} from './session-store';
import { registerCollections } from './store-database';
import { observeSiteCredentials, PENDING_USER_DB_READ } from '../user-db/reads';

import type { CountContext } from './count';
import type { ReadonlySiteRecord } from '../user-db/records';

export type CloseContext = CountContext & {
	engine: RxdbSyncEngine;
	/** Its credentials name the closure's cashiers; the signed-in user's own record names the closer. */
	site: ReadonlySiteRecord | SiteDocument;
	credentials: { id?: number; display_name?: string };
	timezone: string;
	registerName: string;
};
export type RegisterCount = Omit<
	Parameters<typeof closeSession>[2],
	'closedBy' | 'timezone' | 'counted'
> & { counted: { cash: string } & Record<string, string> };
/** The closure, and the count a reused session kept when the one entered now differs (POS-30F). */
export type CloseResult = {
	closure: Awaited<ReturnType<typeof writeClosure>>;
	kept: Record<string, string> | null;
};

/**
 * The kept figure of each tender the entered count differs on, in minor units ('100' is '100.00',
 * and a tender one side lacks is zero); `null` when none differs.
 */
function keptTenders(
	kept: Readonly<Record<string, string>>,
	entered: Readonly<Record<string, string>>
) {
	const differing = [...new Set([...Object.keys(kept), ...Object.keys(entered)])]
		.filter((method) => toMinor(kept[method], 4) !== toMinor(entered[method], 4))
		.map((method): [string, string] => [method, kept[method] ?? '0']);
	return differing.length ? Object.fromEntries(differing) : null;
}

// Two closes of one session never run side by side (#3531 review), a recovery during a manual close
// or a manual close during a recovery: a second close would rewrite the closure, drop its receipt
// snapshot and record the close twice, so it joins the running one (and the bridge skips it).
const closing = new Map<string, Promise<CloseResult>>();
/** Whether `closeRegister` is still running for this session, on this device. */
export const isCloseInFlight = (sessionId: string) => closing.has(sessionId);

/**
 * Close the register, whole: the status transition, the wait for the session's accounting, the
 * closure (its expected figures derived once, by `writeClosure`), a refused close's requeue, the
 * device's live copy and the audit fact.
 */
export function closeRegister(
	ctx: CloseContext,
	sessionId: string,
	count: RegisterCount
): Promise<CloseResult> {
	// A close already running is joined, its count kept (both take the recorded count here).
	const running = closing.get(sessionId);
	if (running) return running;
	const run = closeOnce(ctx, sessionId, count).finally(() => {
		if (closing.get(sessionId) === run) closing.delete(sessionId);
	});
	closing.set(sessionId, run);
	return run;
}

async function closeOnce(
	ctx: CloseContext,
	sessionId: string,
	count: RegisterCount
): Promise<CloseResult> {
	const { storeDB, userDB, siteUuid, credentials } = ctx;
	const current = await registerCollections(storeDB).register_sessions.findOne(sessionId).exec();
	if (!current) throw new RegisterSessionRequiredError();
	// A retry of a refused close (#3304) closes again, so a corrected count reaches the status
	// POST; closeSession holds it out of the outbox until the closure below is rewritten.
	// A kept count without cash closes again like a fresh close: the row and the closure both take
	// the entered count, never a cash figure nobody counted.
	const reused = countRecorded(current);
	const closed = reused
		? current
		: await closeSession(storeDB, sessionId, {
				...count,
				closedBy: credentials.id,
				timezone: ctx.timezone,
			});
	// The store refuses a closure whose count differs from the closed session's (POS-30F).
	const own = reused ? closed.counted : null;
	const tenders = own ?? count.counted;
	const kept = own ? keptTenders(own, count.counted) : null;
	const cashiers: { id?: number; display_name?: string }[] = await firstValueFrom(
		observeSiteCredentials(ctx.site).pipe(filter((value) => value !== PENDING_USER_DB_READ))
	);
	const actorName = (id: number | null | undefined) =>
		(id === credentials.id ? credentials : cashiers.find((row) => row.id === id))?.display_name ??
		'';
	const accounting = await settleSessionAccounting(ctx.engine, closed);
	// Read after the accounting's wait, so a movement a refresh stored during it is in the closure.
	const movements = await registerCollections(storeDB)
		.cash_movements.find({ selector: { session_id: sessionId } })
		.exec();
	const closure = await writeClosure({
		storeDB,
		userDB,
		siteUuid,
		resolveCashierName: actorName,
		timezone: ctx.timezone,
		labels: {
			register_name: ctx.registerName,
			closed_by_name: actorName(closed.closed_by),
			opened_by_name: actorName(closed.opened_by),
			approved_by_name: actorName(closed.approved_by),
		},
		session: closed,
		// The session as it stands after the wait: a refresh may have moved the server's snapshot.
		baseline: { session: closed.getLatest(), refundSources: accounting.refundSources },
		counted: own ? own.cash : count.counted.cash,
		note: own ? (closed.count_note ?? '') : (count.note ?? closed.count_note ?? ''),
		denominations: own
			? (closed.count_denominations ?? [])
			: (count.denominations ?? closed.count_denominations ?? []),
		otherTenders: Object.fromEntries(
			Object.entries(tenders).filter(([method]) => method !== 'cash')
		),
		movements,
		orders: accounting.orders,
		refundRecords: accounting.refundRecords,
		revise: true,
	});
	// The closure now matches this close: let the outbox send both.
	if (closed.sync_status === 'failed')
		await requeueClose(storeDB, sessionId, closed.toMutableJSON());
	await recordLiveSession(userDB, siteUuid, closed.register_id, null);
	recordRegisterFact({
		kind: 'session-closed',
		actor: ctx.actor,
		sessionId: closed.id,
		registerId: closed.register_id,
		closureId: closure.id,
		counted: closure.counted,
		variance: closure.variance,
	});
	return { closure, kept };
}
