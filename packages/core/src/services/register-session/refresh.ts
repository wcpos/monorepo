import { Subject } from 'rxjs';

import type {
	CashMovementCollection,
	CashMovementRow,
	ClosureCollection,
	RegisterSessionCollection,
	RegisterSessionRow,
} from '@wcpos/database';

import { recordRegisterFact } from './audit';
import { adoptSession, type SessionHttp, synced } from './queue';

export const sessionRefreshRequests = new Subject<{
	sessions: RegisterSessionCollection;
	registerId: string;
}>();

export async function refreshSessions({
	registerId,
	http,
	sessions,
	movements,
	closures,
}: {
	registerId: string;
	http: SessionHttp;
	sessions: RegisterSessionCollection;
	movements: CashMovementCollection;
	closures: ClosureCollection;
}) {
	const response = await http.get('sessions', {
		params: { register_id: registerId, status: 'all', per_page: 30 },
	});
	const rows = (response.data as RegisterSessionRow[]).slice(0, 30);
	for (const row of rows) {
		await adoptSession(sessions, row);
		if (row.status === 'closed') continue;
		const detailResponse = await http.get(`sessions/${row.id}`);
		const detail = detailResponse.data as RegisterSessionRow & {
			as_of_gmt?: string;
			movements: CashMovementRow[];
			// Omitted for a cashier without the reports capability: the count is blind.
			expected?: Record<string, string>;
			sales_count?: number;
		};
		// Capture the server snapshot boundary before any local persistence awaits.
		const boundary = detail.as_of_gmt
			? detail.as_of_gmt.replace(/Z?$/, 'Z')
			: detailResponse.headers?.date;
		const serverExpectedAt = typeof boundary === 'string' ? new Date(boundary).toISOString() : null;
		await adoptSession(sessions, {
			...detail,
			// A cashier counting blind is not served the expected figure at all.
			server_expected: detail.expected ?? null,
			server_expected_at: serverExpectedAt,
			server_movement_ids: (detail.movements ?? []).map(({ id }) => id),
			server_sales_count: detail.sales_count ?? null,
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
	for (const row of expired) {
		const closure = await closures.findOne({ selector: { session_id: row.id } }).exec();
		if (closure && !closure.synced_rows_at) continue;
		const associated = await movements.find({ selector: { session_id: row.id } }).exec();
		// A movement the server never accepted exists only here. Pruning it — with the session
		// that gives it meaning — is a silent deletion of the record of cash that has moved.
		if (associated.some((movement) => movement.getLatest().sync_status !== 'synced')) continue;
		for (const movement of associated) await movement.remove();
		await row.remove();
		recordRegisterFact({ kind: 'session-pruned', sessionId: row.id, registerId });
	}
}
