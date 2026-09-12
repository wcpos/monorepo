import type {
	CashMovementCollection,
	CashMovementDocument,
	CashMovementRow,
	RegisterSessionCollection,
	RegisterSessionDocument,
	RegisterSessionRow,
} from '@wcpos/database';

import { backoffMs } from '../../screens/main/receipt/email-queue/queue';
import { failureFacts } from './failure-facts';

export type SessionHttp = {
	get: (
		url: string,
		options?: { params: Record<string, string | number> }
	) => Promise<{ data: unknown }>;
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
};
/**
 * Only the two levels the outbox is entitled to write. It sees a whole attempt, so it can name
 * the terminal outcome of a permanent refusal, but a retryable failure is mid-arc and stays
 * forensic — see packages/utils/src/logger/LEVELS.md.
 */
export type SessionLogger = {
	debug: (message: string, options?: SessionLogOptions) => void;
	warn: (message: string, options?: SessionLogOptions) => void;
};
type SessionLogOptions = {
	context?: Record<string, unknown>;
	terminal?: {
		operationId?: string;
		operationType?: string;
		attempt?: number;
		outcome?: 'ok' | 'recovered' | 'failed' | 'rejected' | 'cancelled' | 'unknown';
	};
};
type Deps = {
	sessions: RegisterSessionCollection;
	movements: CashMovementCollection;
	http: SessionHttp;
	logger: SessionLogger;
};
/** `operationId` is clamped to 32 characters, so a 36-character UUID would truncate. */
const operationId = (id: string) => id.replace(/-/g, '').slice(0, 32);
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
		endpoint: string,
		task: () => Promise<void>,
		statusTransition = false
	) {
		try {
			await task();
		} catch (error) {
			const { status, body, errorCode, field, message } = failureFacts(error);
			if (statusTransition && body?.code === 'wcpos_override_refused') {
				await (doc as RegisterSessionDocument).incrementalPatch({
					status: 'counting',
					pending_status: null,
					...synced,
					approval_required: true,
					sync_error: 'wcpos_override_refused',
					closed_at_gmt: null,
				});
				return;
			}
			// 4xx is permanent except the two throttle codes, which the server asks us to retry.
			const retry = !status || status >= 500 || status === 408 || status === 429;
			const before = doc.getLatest();
			const attempts = before.sync_attempts + 1;
			await doc.incrementalPatch({
				sync_status: retry ? 'pending' : 'failed',
				sync_attempts: attempts,
				sync_next_at: retry ? Date.now() + backoffMs(attempts) : null,
				sync_error: errorCode ?? body?.message ?? message ?? String(status),
			});
			// The cashier's typed reason is deliberately absent: step 3 promotes the permanent row
			// to a registered `error`, and `error` forwards its whole context to Sentry.
			const options = {
				context: {
					endpoint,
					status,
					errorCode,
					field,
					message,
					documentId: before.id,
					...('type' in before ? { type: before.type, amount: before.amount } : {}),
				},
				terminal: {
					operationId: operationId(before.id),
					operationType: 'register.outbox',
					attempt: attempts,
					...(retry ? {} : { outcome: 'failed' as const }),
				},
			};
			// Retryable means the arc has not settled, so it stays forensic; a 4xx is the server's
			// final answer on money that has already physically moved.
			if (retry) logger.debug('Register session outbox request failed', options);
			else logger.warn('Register session outbox request permanently refused', options);
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
	const locallyClosed = await sessions.find({ selector: { status: 'closed' } }).exec();
	for (const snapshot of rows) {
		const row = snapshot.getLatest();
		const closingPredecessor = locallyClosed.some((candidate) => {
			const predecessor = candidate.getLatest();
			return (
				predecessor.id !== row.id &&
				predecessor.register_id === row.register_id &&
				predecessor.sync_status !== 'failed' &&
				predecessor.server_status !== 'closed'
			);
		});
		if (!due(row) || row.server_status || closingPredecessor) continue;
		await send(row, 'sessions', async () => {
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
		await send(
			row,
			`sessions/${row.id}/status`,
			async () => {
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
							}
						: {}),
				});
				await acknowledge(row, response.data as RegisterSessionRow, row.status_at);
			},
			true
		);
	}
	const ledger = (await movements.find({ selector: { sync_status: 'pending' } }).exec()).sort(
		(a, b) => a.created_at_gmt.localeCompare(b.created_at_gmt)
	);
	for (const snapshot of ledger) {
		const row = snapshot.getLatest();
		const session = await sessions.findOne(row.session_id).exec();
		if (!due(row) || !session?.server_status || session.sync_status === 'failed') continue;
		if (row.voids) {
			const target = await movements.findOne(row.voids).exec();
			if (target?.sync_status === 'failed') {
				await row.incrementalPatch({
					sync_status: 'failed',
					sync_attempts: row.sync_attempts + 1,
					sync_next_at: null,
					sync_error: target.sync_error,
				});
			}
			if (target?.sync_status !== 'synced') continue;
		}
		await send(row, 'movements', async () => {
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
