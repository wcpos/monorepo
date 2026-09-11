import type {
	CashMovementCollection,
	CashMovementRow,
	RegisterSessionCollection,
	RegisterSessionRow,
} from '@wcpos/database';

import { adoptSession, type SessionHttp, synced } from './queue';

export async function refreshSessions({
	registerId,
	http,
	sessions,
	movements,
}: {
	registerId: string;
	http: SessionHttp;
	sessions: RegisterSessionCollection;
	movements: CashMovementCollection;
}) {
	const response = await http.get('sessions', {
		params: { register_id: registerId, status: 'all', per_page: 30 },
	});
	const rows = (response.data as RegisterSessionRow[]).slice(0, 30);
	for (const row of rows) {
		await adoptSession(sessions, row);
		if (row.status === 'closed') continue;
		const detail = (await http.get(`sessions/${row.id}`)).data as RegisterSessionRow & {
			movements: CashMovementRow[];
			expected: Record<string, string>;
			sales_count: number;
		};
		await adoptSession(sessions, {
			...detail,
			server_expected: detail.expected,
			server_sales_count: detail.sales_count,
		});
		for (const movement of detail.movements ?? []) {
			const local = await movements.findOne(movement.id).exec();
			if (local?.sync_status === 'pending') continue;
			await movements.incrementalUpsert({ ...movement, ...synced });
		}
	}
	const expired = await sessions
		.find({
			selector: {
				register_id: registerId,
				status: 'closed',
				sync_status: 'synced',
				closed_at_gmt: { $lt: new Date(Date.now() - 7 * 86400_000).toISOString() },
			},
		})
		.exec();
	for (const row of expired) await row.remove();
}
