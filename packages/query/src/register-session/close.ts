import { filter, firstValueFrom } from 'rxjs';

import type { SiteDocument } from '@wcpos/database';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { recordRegisterFact } from './audit';
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
export type RegisterCount = Omit<Parameters<typeof closeSession>[2], 'closedBy' | 'timezone'>;

/**
 * Close the register, whole: the status transition, the wait for the session's accounting, the
 * closure (its expected figures derived once, by `writeClosure`), a refused close's requeue, the
 * device's live copy and the audit fact.
 */
export async function closeRegister(ctx: CloseContext, sessionId: string, count: RegisterCount) {
	const { storeDB, userDB, siteUuid, credentials } = ctx;
	const current = await registerCollections(storeDB).register_sessions.findOne(sessionId).exec();
	if (!current) throw new RegisterSessionRequiredError();
	// A retry of a refused close (#3304) closes again, so a corrected count reaches the status
	// POST; closeSession holds it out of the outbox until the closure below is rewritten.
	const closed =
		current.status === 'closed' && current.sync_status !== 'failed'
			? current
			: await closeSession(storeDB, sessionId, {
					...count,
					closedBy: credentials.id,
					timezone: ctx.timezone,
				});
	const accounting = await settleSessionAccounting(ctx.engine, closed);
	const cashiers: { id?: number; display_name?: string }[] = await firstValueFrom(
		observeSiteCredentials(ctx.site).pipe(filter((value) => value !== PENDING_USER_DB_READ))
	);
	const actorName = (id: number | null | undefined) =>
		(id === credentials.id ? credentials : cashiers.find((row) => row.id === id))?.display_name ??
		'';
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
		counted: count.counted.cash,
		note: count.note ?? closed.count_note ?? '',
		denominations: count.denominations ?? closed.count_denominations ?? [],
		otherTenders: Object.fromEntries(
			Object.entries(count.counted).filter(([method]) => method !== 'cash')
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
	return closure;
}
