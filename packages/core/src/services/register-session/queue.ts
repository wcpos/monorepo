import type {
	CashMovementCollection,
	CashMovementDocument,
	CashMovementRow,
	RegisterSessionCollection,
	RegisterSessionDocument,
	RegisterSessionRow,
} from '@wcpos/database';

import { backoffMs } from '../../screens/main/receipt/email-queue/queue';

export type SessionHttp = {
	get: (
		url: string,
		options?: { params: Record<string, string | number> }
	) => Promise<{ data: unknown }>;
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
};
type Deps = {
	sessions: RegisterSessionCollection;
	movements: CashMovementCollection;
	http: SessionHttp;
	logger: { warn: (message: string) => void };
};
const inFlight = new Map<RegisterSessionCollection, Promise<void>>();
export const synced = {
	sync_status: 'synced',
	sync_attempts: 0,
	sync_next_at: null,
	sync_error: null,
} as const;
const due = (row: { sync_status: string; sync_next_at?: number | null }) =>
	row.sync_status === 'pending' && (!row.sync_next_at || row.sync_next_at <= Date.now());

/** Keep a newer cashier transition when a response to an older request arrives. */
async function acknowledge(
	doc: RegisterSessionDocument,
	server: RegisterSessionRow,
	sentAt?: string | null
) {
	await doc.incrementalModify((local) => {
		const outstanding =
			local.pending_status && (sentAt === undefined || local.status_at !== sentAt);
		return {
			...local,
			...server,
			...synced,
			server_status: server.status,
			status: outstanding ? local.status : server.status,
			pending_status: outstanding ? local.pending_status : null,
			status_at: local.status_at,
			approver_token: outstanding ? local.approver_token : null,
			counted: outstanding ? local.counted : server.counted,
			counting_started_at_gmt: outstanding
				? local.counting_started_at_gmt
				: server.counting_started_at_gmt,
			closed_at_gmt: outstanding ? local.closed_at_gmt : server.closed_at_gmt,
			sync_status: outstanding ? 'pending' : 'synced',
		};
	});
}
export function drainRegisterSessionQueue(deps: Deps): Promise<void> {
	const running = inFlight.get(deps.sessions);
	if (running) return running;
	const promise = drain(deps).finally(() => inFlight.delete(deps.sessions));
	inFlight.set(deps.sessions, promise);
	return promise;
}
async function drain({ sessions, movements, http, logger }: Deps) {
	async function send(
		doc: RegisterSessionDocument | CashMovementDocument,
		task: () => Promise<void>
	) {
		try {
			await task();
		} catch (error) {
			const failure = error as {
				message?: string;
				response?: {
					status?: number;
					data?: { code?: string; message?: string; data?: { session_id?: string } };
				};
			};
			const status = failure.response?.status;
			const body = failure.response?.data;
			// 4xx is permanent except the two throttle codes, which the server asks us to retry.
			const retry = !status || status >= 500 || status === 408 || status === 429;
			const attempts = doc.getLatest().sync_attempts + 1;
			await doc.incrementalPatch({
				sync_status: retry ? 'pending' : 'failed',
				sync_attempts: attempts,
				sync_next_at: retry ? Date.now() + backoffMs(attempts) : null,
				sync_error: body?.message ?? body?.code ?? failure.message ?? String(status),
			});
			logger.warn('Register session outbox request failed');
			if (status === 409 && body?.code === 'wcpos_session_already_open' && body.data?.session_id) {
				const server = (await http.get(`sessions/${body.data.session_id}`))
					.data as RegisterSessionRow;
				await adoptSession(sessions, server);
			}
		}
	}
	const rows = (await sessions.find({ selector: { sync_status: 'pending' } }).exec()).sort((a, b) =>
		a.opened_at_gmt.localeCompare(b.opened_at_gmt)
	);
	for (const snapshot of rows) {
		const row = snapshot.getLatest();
		if (!due(row) || row.server_status) continue;
		await send(row, async () => {
			const response = await http.post('sessions', {
				id: row.id,
				register_id: row.register_id,
				opened_at: row.opened_at_gmt,
				expected_float: row.expected_float ?? null,
				counted_float: row.counted_float,
			});
			await acknowledge(row, response.data as RegisterSessionRow);
		});
	}
	for (const snapshot of rows) {
		const row = snapshot.getLatest();
		if (!due(row) || !row.server_status || !row.pending_status) continue;
		// Counting closes the movement route. Flush this session's movements on this pass first.
		if (
			await movements.findOne({ selector: { session_id: row.id, sync_status: 'pending' } }).exec()
		)
			continue;
		await send(row, async () => {
			if (row.pending_status === 'closed' && row.server_status === 'open') {
				await http.post(`sessions/${row.id}/status`, {
					status: 'counting',
					at: row.counting_started_at_gmt,
				});
				await row.incrementalPatch({ server_status: 'counting' });
			}
			const response = await http.post(`sessions/${row.id}/status`, {
				status: row.pending_status,
				at: row.status_at,
				...(row.pending_status === 'closed'
					? {
							counted: row.counted,
							...(row.approver_token ? { approver_token: row.approver_token } : {}),
						}
					: {}),
			});
			await acknowledge(row, response.data as RegisterSessionRow, row.status_at);
		});
	}
	const ledger = (await movements.find({ selector: { sync_status: 'pending' } }).exec()).sort(
		(a, b) => a.created_at_gmt.localeCompare(b.created_at_gmt)
	);
	for (const snapshot of ledger) {
		const row = snapshot.getLatest();
		const session = await sessions.findOne(row.session_id).exec();
		if (!due(row) || !session?.server_status || session.sync_status === 'failed') continue;
		if (row.voids && (await movements.findOne(row.voids).exec())?.sync_status !== 'synced')
			continue;
		await send(row, async () => {
			const response = await http.post('movements', {
				id: row.id,
				session_id: row.session_id,
				type: row.type,
				amount: row.amount,
				reason: row.reason,
				created_at: row.created_at_gmt,
				...(row.voids ? { voids: row.voids } : {}),
			});
			await session.incrementalPatch({ server_expected: null, server_sales_count: null });
			await row.incrementalModify((local) => ({
				...local,
				...(response.data as CashMovementRow),
				...synced,
				voided_by: local.voided_by || (response.data as CashMovementRow).voided_by,
			}));
		});
	}
}
export async function adoptSession(
	sessions: RegisterSessionCollection,
	server: RegisterSessionRow & { movements?: unknown; expected?: unknown; sales_count?: unknown }
) {
	const { movements: _movements, expected: _expected, sales_count: _count, ...row } = server;
	const local = await sessions.findOne(row.id).exec();
	if (local?.sync_status === 'pending') return;
	await sessions.incrementalUpsert({
		...row,
		...synced,
		server_status: row.status,
		pending_status: null,
	});
}
