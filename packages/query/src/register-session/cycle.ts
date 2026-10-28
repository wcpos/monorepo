import type { UserDatabase } from '@wcpos/database';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { markSeededIn, readLiveSession, readRegister } from './register-document';
import { seedSessionFromCache } from './seed';
import { writeClosure } from './session-store';
import { drainRegisterSessionQueue, type SessionHttp } from './queue';
import { refreshSessions } from './refresh';
import { registerCollections, type RegisterStoreDatabase } from './store-database';

/**
 * Free's single store is id 0 on the client, while the server keeps NULL for a session on an
 * unassigned register (`store_id` is BIGINT NULL, and Store Reach reads 0 and NULL as the same
 * "no store"). A reservation acknowledged by the server therefore carries NULL where the local
 * draft carried 0; both name this store, so recovery must not stall on the spelling.
 */
export function sameStore(a: number | null | undefined, b: number | null | undefined): boolean {
	const unassigned = (id: number | null | undefined) => id == null || id === 0;
	return unassigned(a) ? unassigned(b) : a === b;
}

/** Recover a local closure reservation, then deliver and refresh this register. */
export async function runRegisterSessionCycle({
	storeDB,
	userDB,
	siteUuid,
	storeId,
	registerId,
	online,
	engine,
	http,
}: {
	storeDB: RegisterStoreDatabase;
	userDB: UserDatabase;
	siteUuid: string;
	storeId: number | null | undefined;
	registerId: string | null;
	online: boolean;
	engine: RxdbSyncEngine;
	http: SessionHttp;
}) {
	const { register_sessions: sessions } = registerCollections(storeDB);
	// Which half of the cycle broke is the first thing a diagnosis needs, and the rejection
	// never carries it — so each stage tags its own failures on the way out.
	const staged = <T>(stage: string, work: () => Promise<T>) =>
		work().catch((error: unknown) => {
			throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage });
		});

	const reservation = await staged(
		'reservation',
		async () =>
			(await readRegister(userDB))?.sites[siteUuid]?.registers?.[registerId ?? '']
				?.closure_reservation
	);
	if (reservation && !reservation.applied && sameStore(reservation.row.store_id, storeId)) {
		const session = await sessions.findOne(reservation.row.session_id).exec();
		if (session)
			await staged('closure', () =>
				writeClosure({
					storeDB,
					userDB,
					siteUuid: siteUuid,
					session,
					counted: reservation.row.counted.cash,
					otherTenders: reservation.row.counted,
					movements: [],
					orders: [],
				})
			);
	}
	const live = registerId ? readLiveSession(siteUuid, registerId) : null;
	if (
		live &&
		(await staged('seed', () => seedSessionFromCache(storeDB, live, registerId!, storeId))) ===
			'seeded'
	)
		await markSeededIn(userDB, siteUuid, registerId!, sessions.database.name);
	if (!online) return;
	await staged('drain', () =>
		drainRegisterSessionQueue({
			storeDB,
			userDB,
			siteUuid: siteUuid,
			engine,
			http,
		})
	);
	if (registerId) await staged('refresh', () => refreshSessions({ registerId, storeDB, http }));
}
