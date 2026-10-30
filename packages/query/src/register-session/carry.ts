import type {
	RegisterSessionRow,
	StoreDatabase,
	UserDatabase,
	WPCredentialsDocument,
} from '@wcpos/database';

import { type SessionHttp, synced } from './queue';
import {
	bindStoreRegister,
	markCountingHere,
	mintUuid,
	recordCarriedFrom,
	recordLiveSession,
} from './register-document';

export type CarryTarget = {
	store: { id: number; name: string };
	register: { id: string; name: string };
};

export async function carryDrawer({
	http,
	storeDB,
	userDB,
	siteUuid,
	sessionId,
	fromRegisterId,
	from,
	to,
	at = new Date().toISOString(),
}: {
	http: SessionHttp;
	storeDB: StoreDatabase;
	userDB: UserDatabase;
	siteUuid: string;
	sessionId: string;
	fromRegisterId: string;
	from: { id: number; name: string };
	to: CarryTarget;
	at?: string;
}): Promise<{ closureId: string; sessionId: string }> {
	const response = await http.post(`sessions/${sessionId}/carry`, {
		to_register_id: to.register.id,
		closure_id: mintUuid(),
		session_id: mintUuid(),
		at,
	});
	const { closure, session } = response.data as {
		closure: Pick<RegisterSessionRow, 'id' | 'closed_at_gmt' | 'closed_by'>;
		session: RegisterSessionRow;
	};
	const source = await storeDB.register_sessions.findOne(sessionId).exec();
	await source!.incrementalPatch({
		status: 'closed',
		closed_at_gmt: closure.closed_at_gmt,
		closed_by: closure.closed_by,
		closure_id: closure.id,
		server_status: 'closed',
		...synced,
	});
	await markCountingHere(userDB, siteUuid, fromRegisterId, true);
	await recordLiveSession(userDB, siteUuid, fromRegisterId, null);
	const site = await userDB.sites.findOne(siteUuid).exec();
	const cashiers = (await site?.populate('wp_credentials')) as WPCredentialsDocument[] | undefined;
	await recordLiveSession(userDB, siteUuid, to.register.id, {
		session_id: session.id,
		status: 'open',
		opened_at_gmt: session.opened_at_gmt,
		opened_by:
			session.opened_by == null
				? null
				: {
						id: session.opened_by,
						name: cashiers?.find((cashier) => cashier.id === session.opened_by)?.display_name ?? '',
					},
		acknowledged: true,
		expected_float: session.expected_float ?? null,
		counted_float: session.counted_float ?? null,
		business_day: session.business_day ?? null,
	});
	await recordCarriedFrom(userDB, siteUuid, to.register.id, {
		session_id: session.id,
		closure_id: closure.id,
		store_id: from.id,
		store_name: from.name,
		register_id: fromRegisterId,
	});
	await bindStoreRegister(userDB, siteUuid, to.store.id, to.register);
	return { closureId: closure.id, sessionId: session.id };
}
