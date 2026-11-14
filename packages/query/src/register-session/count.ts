import type { UserDatabase } from '@wcpos/database';

import { recordRegisterFact } from './audit';
import { markCountingHere, recordLiveSessionFrom } from './register-document';
import { backToSelling, RegisterSessionRequiredError, startCounting } from './session-store';
import { registerCollections, type RegisterStoreDatabase } from './store-database';

export type CountContext = {
	storeDB: RegisterStoreDatabase;
	userDB: UserDatabase;
	siteUuid: string;
	/** The signed-in user: the audit fact's actor, and the opener's name when the copy has none. */
	actor: { id: string; name: string };
};

/**
 * One count move, whole: the status transition, the device's live copy, the audit fact. The copy
 * takes the row as it stood before the move, whose acknowledgement is the store's; the move
 * itself only makes the row pending.
 */
async function moveCount(ctx: CountContext, sessionId: string, to: 'counting' | 'open') {
	const before = await registerCollections(ctx.storeDB).register_sessions.findOne(sessionId).exec();
	if (!before) throw new RegisterSessionRequiredError();
	const row = await (to === 'counting' ? startCounting : backToSelling)(ctx.storeDB, sessionId);
	await recordLiveSessionFrom(
		ctx.userDB,
		ctx.siteUuid,
		{ ...before.toJSON(), status: to },
		ctx.actor
	);
	return row;
}

/** Start counting the drawer: the session is counting, and this device holds the count mark. */
export async function beginCount(ctx: CountContext, sessionId: string) {
	const row = await moveCount(ctx, sessionId, 'counting');
	await markCountingHere(ctx.userDB, ctx.siteUuid, row.register_id, true);
	recordRegisterFact({
		kind: 'counting-started',
		actor: ctx.actor,
		sessionId: row.id,
		registerId: row.register_id,
	});
	return row;
}

/** Abandon the count, or a close the store refused (#2016): the session sells again. */
export async function abandonCount(ctx: CountContext, sessionId: string) {
	const row = await moveCount(ctx, sessionId, 'open');
	recordRegisterFact({
		kind: 'counting-abandoned',
		actor: ctx.actor,
		sessionId: row.id,
		registerId: row.register_id,
	});
	return row;
}
