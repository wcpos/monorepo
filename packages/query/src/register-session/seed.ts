import { registerCollections, type RegisterStoreDatabase } from './store-database';

import type { LiveSession } from './register-document';

export async function seedSessionFromCache(
	storeDB: RegisterStoreDatabase,
	live: LiveSession,
	registerId: string,
	storeId: number | null | undefined
): Promise<'seeded' | 'present' | 'closed'> {
	const { register_sessions: sessions } = registerCollections(storeDB);
	const existing = await sessions.findOne(live.session_id).exec();
	if (existing) return existing.status === 'closed' ? 'closed' : 'present';
	const previous = await sessions
		.find({
			selector: {
				register_id: registerId,
				status: { $in: ['open', 'counting'] },
				id: { $ne: live.session_id },
				sync_status: 'synced',
			},
		})
		.exec();
	for (const row of previous) {
		await row.incrementalPatch({
			status: 'closed',
			server_status: 'closed',
			pending_status: null,
			closed_at_gmt: live.opened_at_gmt,
		});
	}
	await sessions.insert({
		id: live.session_id,
		register_id: registerId,
		store_id: storeId ?? null,
		status: live.status,
		business_day: live.business_day ?? live.opened_at_gmt.slice(0, 10),
		opened_at_gmt: live.opened_at_gmt,
		opened_by: live.opened_by?.id ?? null,
		expected_float: live.acknowledged ? null : live.expected_float,
		counted_float: live.acknowledged ? null : live.counted_float,
		opening_variance: null,
		status_at: live.at,
		sync_attempts: 0,
		sync_status: live.acknowledged ? 'synced' : 'pending',
		server_status: live.acknowledged ? live.status : null,
		pending_status: live.acknowledged ? null : live.status,
	});
	return 'seeded';
}
