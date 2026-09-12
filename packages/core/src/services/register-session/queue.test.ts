import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';

import { ensureRegister, readRegister } from '../register/register-document';
import {
	closeSession,
	openSession,
	recordMovement,
	startCounting,
	voidMovement,
	writeClosure,
} from './session-store';
import { drainRegisterSessionQueue } from './queue';
import { refreshSessions } from './refresh';

addRxPlugin(RxDBLocalDocumentsPlugin);
let db: StoreDatabase;
let userDB: UserDatabase;
const http = { post: jest.fn(), get: jest.fn() };
const logger = { warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
beforeEach(async () => {
	jest.clearAllMocks();
	http.post.mockReset();
	http.get.mockReset();
	db = await createRxDatabase({
		name: `queue${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	userDB = await createRxDatabase({
		name: `queueuser${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
	await ensureRegister(userDB);
	await db.addCollections({
		closures: { schema: closuresLiteral },
		register_sessions: { schema: registerSessionsLiteral },
		cash_movements: { schema: cashMovementsLiteral },
	});
});
afterEach(async () => {
	await db.remove();
	await userDB.remove();
});
const open = () =>
	openSession(db.register_sessions, {
		registerId: 'register',
		expectedFloat: null,
		countedFloat: '100',
		openedBy: 7,
	});
const drain = () =>
	drainRegisterSessionQueue({
		sessions: db.register_sessions,
		movements: db.cash_movements,
		closures: db.closures,
		userDB,
		siteUuid: 'site',
		orders: null,
		http,
		logger,
	});
it('acknowledges a create, never resends it, and shares the in-flight drain', async () => {
	const row = await open();
	http.post.mockResolvedValue({ status: 201, data: { ...row.toJSON(), status: 'open' } });
	const first = drain();
	expect(drain()).toBe(first);
	await first;
	expect(row.getLatest().sync_status).toBe('synced');
	await drain();
	expect(http.post).toHaveBeenCalledTimes(1);
	expect(http.post).toHaveBeenCalledWith(
		'sessions',
		expect.objectContaining({ id: row.id, opened_at: row.opened_at_gmt })
	);
});
it('marks a losing create failed and adopts the server session', async () => {
	const row = await open();
	http.post.mockRejectedValue({
		response: {
			status: 409,
			data: { code: 'wcpos_session_already_open', data: { session_id: 'winner' } },
		},
	});
	http.get.mockResolvedValue({ data: { ...row.toJSON(), id: 'winner', status: 'open' } });
	await drain();
	expect(row.getLatest().sync_status).toBe('failed');
	expect((await db.register_sessions.findOne('winner').exec())?.sync_status).toBe('synced');
});
it('backs off a 5xx without posting dependent movements', async () => {
	const row = await open();
	const movement = await recordMovement(db.cash_movements, {
		sessionId: row.id,
		type: 'paid_out',
		amount: '5',
		reason: 'Milk',
		actor: 7,
	});
	http.post.mockRejectedValue({ response: { status: 503 } });
	await drain();
	expect(row.getLatest()).toMatchObject({ sync_status: 'pending', sync_attempts: 1 });
	expect(row.getLatest().sync_next_at).toBeGreaterThan(Date.now());
	expect(movement.getLatest().sync_attempts).toBe(0);
	expect(http.post).toHaveBeenCalledTimes(1);
});
it('sends movements after create but before a deferred counting transition', async () => {
	const row = await open();
	const movement = await recordMovement(db.cash_movements, {
		sessionId: row.id,
		type: 'paid_out',
		amount: '5',
		reason: 'Milk',
		actor: 7,
	});
	await startCounting(db.register_sessions, row.id);
	http.post.mockImplementation(async (url, body) => ({
		data:
			url === 'movements'
				? { ...movement.toJSON() }
				: { ...row.toJSON(), status: url === 'sessions' ? 'open' : body.status },
	}));
	await drain();
	expect(http.post.mock.calls.map(([url]) => url)).toEqual(['sessions', 'movements']);
	expect(row.getLatest().toJSON()).toMatchObject({
		status: 'counting',
		pending_status: 'counting',
	});
	await drain();
	expect(http.post.mock.calls[2][0]).toBe(`sessions/${row.id}/status`);
	expect(row.getLatest()).toMatchObject({ sync_status: 'synced', pending_status: null });
});
it('closes a predecessor before creating its successor on the same register', async () => {
	const predecessor = await open();
	await predecessor.incrementalPatch({
		server_status: 'open',
		status: 'closed',
		pending_status: 'closed',
		status_at: new Date().toISOString(),
		closed_at_gmt: new Date().toISOString(),
	});
	const successor = await open();
	http.post.mockImplementation(async (url) => ({
		data: {
			...(url === 'sessions' ? successor.toJSON() : predecessor.toJSON()),
			status: url === 'sessions' ? 'open' : 'closed',
		},
	}));

	await drain();
	expect(http.post.mock.calls.map(([url]) => url)).toEqual([
		`sessions/${predecessor.id}/status`,
		`sessions/${predecessor.id}/status`,
	]);

	await drain();
	expect(http.post.mock.calls.map(([url]) => url)).toEqual([
		`sessions/${predecessor.id}/status`,
		`sessions/${predecessor.id}/status`,
		'sessions',
	]);
});
it.each([400, 409])('permanently fails HTTP %s', async (status) => {
	const row = await open();
	http.post.mockRejectedValue({ response: { status } });
	await drain();
	expect(row.getLatest().sync_status).toBe('failed');
});
it('retries HTTP 429 with backoff instead of failing', async () => {
	const row = await open();
	http.post.mockRejectedValue({ response: { status: 429 } });
	await drain();
	expect(row.getLatest().sync_status).toBe('pending');
	expect(row.getLatest().sync_next_at).toBeGreaterThan(Date.now());
});

it('recovers a refused close to counting, preserving counts and machine-readable error', async () => {
	const row = await open();
	await row.incrementalPatch({
		server_status: 'counting',
		sync_status: 'synced',
		status: 'counting',
	});
	await closeSession(db.register_sessions, row.id, { counted: { cash: '80', card: '10' } });
	http.post.mockRejectedValue({
		response: {
			status: 403,
			data: { code: 'wcpos_override_refused', message: 'Manager required' },
		},
	});
	await drain();
	expect(row.getLatest().toJSON()).toMatchObject({
		status: 'counting',
		pending_status: null,
		sync_status: 'synced',
		approval_required: true,
		sync_error: 'wcpos_override_refused',
		counted: { cash: '80', card: '10' },
	});
	expect(http.post).toHaveBeenCalledWith(`sessions/${row.id}/status`, {
		status: 'closed',
		at: expect.any(String),
		counted: { cash: '80', card: '10' },
	});
});
it('does not apply refused-close recovery to a create', async () => {
	const row = await open();
	http.post.mockRejectedValue({
		response: { status: 403, data: { code: 'wcpos_override_refused', message: 'Refused' } },
	});
	await drain();
	expect(row.getLatest().toJSON()).toMatchObject({
		sync_status: 'failed',
		sync_error: 'wcpos_override_refused',
	});
});

it('prunes movements together with their expired closed session', async () => {
	const row = await open();
	await row.incrementalPatch({
		status: 'closed',
		server_status: 'closed',
		sync_status: 'synced',
		closed_at_gmt: new Date(Date.now() - 8 * 86400_000).toISOString(),
	});
	const movement = await recordMovement(db.cash_movements, {
		sessionId: row.id,
		type: 'paid_in',
		amount: '5',
		reason: 'Float',
		actor: 7,
	});
	await movement.incrementalPatch({ sync_status: 'synced' });
	http.get.mockResolvedValue({ data: [] });

	await refreshSessions({
		registerId: 'register',
		closures: db.closures,
		http,
		sessions: db.register_sessions,
		movements: db.cash_movements,
	});

	expect(await db.register_sessions.findOne(row.id).exec()).toBeNull();
	expect(await db.cash_movements.findOne(movement.id).exec()).toBeNull();
});

it.each(['pending', 'failed'] as const)(
	'keeps an expired session whose %s movement the server never accepted',
	async (status) => {
		const row = await open();
		await row.incrementalPatch({
			status: 'closed',
			server_status: 'closed',
			sync_status: 'synced',
			closed_at_gmt: new Date(Date.now() - 8 * 86400_000).toISOString(),
		});
		const movement = await recordMovement(db.cash_movements, {
			sessionId: row.id,
			type: 'paid_in',
			amount: '5',
			reason: 'Float',
			actor: 7,
		});
		await movement.incrementalPatch({ sync_status: status });
		http.get.mockResolvedValue({ data: [] });

		await refreshSessions({
			registerId: 'register',
			closures: db.closures,
			http,
			sessions: db.register_sessions,
			movements: db.cash_movements,
		});

		// The cash physically moved and the server never took the row: the device holds the
		// only record of it, so the prune must leave both it and its session alone.
		expect(await db.cash_movements.findOne(movement.id).exec()).not.toBeNull();
		expect(await db.register_sessions.findOne(row.id).exec()).not.toBeNull();
	}
);

it('logs a retryable outbox failure at debug and a permanent one at its registered level, with the transport facts', async () => {
	const session = await open();
	await session.incrementalPatch({ server_status: 'open', sync_status: 'synced' });
	const movement = await recordMovement(db.cash_movements, {
		sessionId: session.id,
		type: 'paid_in',
		amount: '20',
		reason: 'Bread money',
		actor: 7,
	});
	http.post.mockRejectedValueOnce({ response: { status: 503 } });
	await drain();
	expect(logger.warn).not.toHaveBeenCalled();
	expect(logger.debug).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({
				endpoint: 'movements',
				status: 503,
				documentId: movement.id,
				type: 'paid_in',
				amount: '20',
			}),
			terminal: expect.objectContaining({ operationType: 'register.outbox', attempt: 1 }),
		})
	);

	logger.debug.mockClear();
	await movement.incrementalPatch({ sync_status: 'pending', sync_next_at: null });
	http.post.mockRejectedValueOnce({
		response: {
			status: 400,
			data: { code: 'rest_invalid_param', data: { params: { reason: 'Reason is required.' } } },
		},
	});
	await drain();
	expect(logger.debug).not.toHaveBeenCalled();
	expect(logger.warn).not.toHaveBeenCalled();
	// Money that has physically moved and the server will never take is an `error`: it needs
	// the cashier now, and only a registered code gives the row a merchant-readable title,
	// a Help link and a toast.
	expect(logger.error).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: 'REGISTER101',
			showToast: true,
			context: expect.objectContaining({
				endpoint: 'movements',
				status: 400,
				errorCode: 'rest_invalid_param',
				field: 'reason',
				documentId: movement.id,
			}),
			terminal: expect.objectContaining({ outcome: 'failed', attempt: 2 }),
		})
	);
	// `logger.error` forwards message AND context to Sentry. The cashier's free text
	// must never ride along.
	expect(JSON.stringify(logger.error.mock.calls)).not.toContain('Bread money');
});

it('gives a refused reversal its own code, below error, because the original still stands', async () => {
	const session = await open();
	await session.incrementalPatch({ server_status: 'open', sync_status: 'synced' });
	const target = await recordMovement(db.cash_movements, {
		sessionId: session.id,
		type: 'paid_out',
		amount: '5',
		reason: 'Milk',
		actor: 7,
	});
	await target.incrementalPatch({ sync_status: 'synced' });
	await voidMovement(db.cash_movements, target.id, 7);
	http.post.mockRejectedValueOnce({
		response: { status: 409, data: { code: 'wcpos_movement_void_refused' } },
	});
	await drain();
	expect(logger.error).not.toHaveBeenCalled();
	expect(logger.warn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ code: 'REGISTER111' })
	);
});

it('names a refused open and a refused close apart', async () => {
	await open();
	http.post.mockRejectedValueOnce({
		response: { status: 400, data: { code: 'rest_invalid_param' } },
	});
	await drain();
	expect(logger.error).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ code: 'REGISTER201' })
	);

	logger.error.mockClear();
	const other = await open();
	await other.incrementalPatch({
		server_status: 'counting',
		status: 'counting',
		sync_status: 'synced',
	});
	await closeSession(db.register_sessions, other.id, { counted: { cash: '100' } });
	http.post.mockRejectedValueOnce({
		response: { status: 400, data: { code: 'rest_invalid_param' } },
	});
	await drain();
	expect(logger.error).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: 'REGISTER211',
			// The endpoint is searchable, so it must not carry the session id — one unique
			// string per session makes a search for the route match nothing.
			context: expect.objectContaining({ endpoint: 'sessions/status' }),
		})
	);
});

it('does not call a refused counting transition a refused close', async () => {
	const row = await open();
	await row.incrementalPatch({ server_status: 'open', sync_status: 'synced' });
	await startCounting(db.register_sessions, row.id);
	http.post.mockRejectedValueOnce({
		response: { status: 400, data: { code: 'rest_invalid_param' } },
	});
	await drain();
	// All three transitions share one route, so classifying on the route alone would report a
	// refused "start counting" as a refused close — and the register is still OPEN.
	expect(logger.error).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ code: 'REGISTER201' })
	);
});

it('records a takeover as a takeover, not as a refused open', async () => {
	const row = await open();
	http.post.mockRejectedValue({
		response: {
			status: 409,
			data: { code: 'wcpos_session_already_open', data: { session_id: 'winner' } },
		},
	});
	http.get.mockResolvedValue({ data: { ...row.toJSON(), id: 'winner', status: 'open' } });
	await drain();
	// Two tills on one drawer. Today this is completely mute.
	expect(logger.warn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: 'REGISTER221',
			// The till adopts the winning session and carries on, so the arc RECOVERED. Calling
			// it 'failed' would show a broken-looking row for a till that is working.
			terminal: expect.objectContaining({ outcome: 'recovered' }),
		})
	);
	expect(logger.error).not.toHaveBeenCalled();
	expect(await db.register_sessions.findOne('winner').exec()).not.toBeNull();
});

it('puts the store’s own explanation on the row, not the axios transport text', async () => {
	await open();
	http.post.mockRejectedValueOnce(
		Object.assign(new Error('Request failed with status code 400'), {
			response: {
				status: 400,
				data: {
					code: 'rest_invalid_param',
					message: 'The session request could not be completed.',
				},
			},
		})
	);
	await drain();
	expect(logger.error).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({
				message: 'The session request could not be completed.',
			}),
		})
	);
});

it('records a refused manager approval, which today leaves no trace at all', async () => {
	const row = await open();
	await row.incrementalPatch({
		server_status: 'counting',
		sync_status: 'synced',
		status: 'counting',
	});
	await closeSession(db.register_sessions, row.id, { counted: { cash: '80' } });
	http.post.mockRejectedValue({
		response: {
			status: 403,
			data: { code: 'wcpos_override_refused', message: 'Manager required' },
		},
	});
	await drain();
	expect(logger.warn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: 'REGISTER301',
			context: expect.objectContaining({ status: 403, errorCode: 'wcpos_override_refused' }),
		})
	);
	// The recovery branch returns the session to counting; it must not also be logged as a
	// refused close.
	expect(logger.error).not.toHaveBeenCalled();
	// Neither the approver's username nor their password is ever in scope here, but the
	// session row is — assert the row we log carries no credential-shaped key.
	expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/password|username|approver_token/);
});

it('chains outbox attempts on one operation id the ledger can follow', async () => {
	const row = await open();
	http.post.mockRejectedValue({ response: { status: 503 } });
	await drain();
	await row.incrementalPatch({ sync_next_at: null });
	await drain();
	const ids = logger.debug.mock.calls.map(([, options]) => options.terminal.operationId);
	expect(ids).toEqual([ids[0], ids[0]]);
	// `operationId` is clamped to 32 characters, so a 36-character UUID would truncate.
	expect(ids[0]).toHaveLength(32);
});

it('does not let a permanently failed close block a successor', async () => {
	const predecessor = await open();
	await predecessor.incrementalPatch({ server_status: 'counting', status: 'counting' });
	await closeSession(db.register_sessions, predecessor.id, { counted: { cash: '100' } });
	http.post.mockRejectedValueOnce({ response: { status: 403, data: { code: 'close_refused' } } });
	await drain();
	expect(predecessor.getLatest().sync_status).toBe('failed');
	const successor = await open();
	http.post.mockResolvedValueOnce({ data: successor.toJSON() });
	await drain();
	expect(successor.getLatest().sync_status).toBe('synced');
	expect(http.post).toHaveBeenCalledTimes(2);
});
it('permanently fails a reversal with its refused target error', async () => {
	const session = await open();
	await session.incrementalPatch({ server_status: 'open', sync_status: 'synced' });
	const target = await recordMovement(db.cash_movements, {
		sessionId: session.id,
		type: 'paid_out',
		amount: '5',
		reason: 'Milk',
		actor: 7,
	});
	const reversal = await voidMovement(db.cash_movements, target.id, 7);
	http.post.mockRejectedValueOnce({
		response: { status: 403, data: { code: 'movement_refused' } },
	});
	await drain();
	await drain();
	expect(reversal.getLatest().toJSON()).toMatchObject({
		sync_status: 'failed',
		sync_error: 'movement_refused',
		sync_next_at: null,
	});
	expect(http.post).toHaveBeenCalledTimes(1);
});

async function closure() {
	const session = await open();
	await session.incrementalPatch({ server_status: 'open' });
	const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: '100' } });
	const row = await writeClosure({
		closures: db.closures,
		userDB,
		siteUuid: 'site',
		session: closed.toJSON(true),
		counted: '100',
		otherTenders: {},
		movements: [],
		orders: [],
	});
	return { session: closed, row };
}
it('waits for session rows, then adopts server number, totals and findings', async () => {
	const { session, row } = await closure();
	await session.incrementalPatch({ sync_next_at: Date.now() + 60000 });
	http.post.mockImplementation(async (url, body) => ({
		data:
			url === 'closures'
				? {
						...row.toJSON(),
						number: 4,
						printed_number: 1,
						perpetual_sales_total: '100.1234',
						perpetual_refunds_total: '10.1000',
						period_sales_total: '90.0000',
						period_refunds_total: '5.0000',
						findings: { gap: true },
					}
				: { ...session.toJSON(), status: body.status },
	}));
	await drain();
	expect(http.post).not.toHaveBeenCalled();
	await session.incrementalPatch({ sync_next_at: null });
	await drain();
	expect(http.post.mock.calls.map(([url]) => url)).toEqual([
		`sessions/${session.id}/status`,
		`sessions/${session.id}/status`,
		'closures',
	]);
	expect(row.getLatest()).toMatchObject({
		sync_status: 'synced',
		number: 1,
		server_number: 4,
		printed_number: 1,
		period_sales_total: '90.0000',
		perpetual_sales_total: '100.1234',
		server_findings: { gap: true },
		synced_rows_at: expect.any(String),
	});
	expect((await readRegister(userDB))?.sites.site.registers?.register).toMatchObject({
		last_closure_number: 4,
		perpetual_sales_total: '100.1234',
		perpetual_refunds_total: '10.1000',
	});
});
it('supersedes a closure that landed as a recount', async () => {
	const { session, row } = await closure();
	await session.incrementalPatch({
		sync_status: 'synced',
		server_status: 'closed',
		pending_status: null,
	});
	http.post.mockRejectedValue({
		response: {
			status: 409,
			data: { code: 'wcpos_closure_exists', data: { closure_id: 'winner' } },
		},
	});
	await drain();
	expect(row.getLatest()).toMatchObject({
		sync_status: 'superseded',
		server_closure_id: 'winner',
		synced_rows_at: expect.any(String),
	});
});
it('waits for pending movements and dirty named orders before acknowledging a closure', async () => {
	const { session, row } = await closure();
	await session.incrementalPatch({
		sync_status: 'synced',
		server_status: 'closed',
		pending_status: null,
	});
	const movement = await recordMovement(db.cash_movements, {
		sessionId: session.id,
		type: 'paid_in',
		amount: '20',
		reason: '',
		actor: 7,
	});
	await movement.incrementalPatch({ sync_next_at: Date.now() + 60000 });
	await row.incrementalPatch({ movement_ids: [movement.id], order_ids: ['order'] });
	const order = { local: { dirty: true } };
	const drainWithOrder = () =>
		drainRegisterSessionQueue({
			sessions: db.register_sessions,
			movements: db.cash_movements,
			closures: db.closures,
			userDB,
			siteUuid: 'site',
			http,
			logger,
			orders: { findOne: () => ({ exec: async () => order }) } as never,
		});
	await drainWithOrder();
	expect(http.post).not.toHaveBeenCalled();
	await movement.incrementalPatch({ sync_status: 'synced' });
	await drainWithOrder();
	expect(http.post).not.toHaveBeenCalled();
	expect(row.getLatest().synced_rows_at).toBeNull();
	order.local.dirty = false;
	http.post.mockResolvedValue({ data: { ...row.toJSON(), findings: {} } });
	await drainWithOrder();
	expect(http.post.mock.calls.map(([url]) => url)).toEqual(['closures']);
	expect(row.getLatest().synced_rows_at).toEqual(expect.any(String));
});
it('adopts the floor and re-mints only once, including across drains, before dead-lettering', async () => {
	const { session, row } = await closure();
	await session.incrementalPatch({
		sync_status: 'synced',
		server_status: 'closed',
		pending_status: null,
	});
	http.post.mockRejectedValue({
		response: { status: 409, data: { code: 'wcpos_closure_number_invalid' } },
	});
	http.get.mockResolvedValue({
		data: {
			counters: {
				last_closure_number: 8,
				perpetual_sales_total: '5',
				perpetual_refunds_total: '0',
			},
		},
	});
	await drain();
	await drain();
	expect(http.post.mock.calls.map(([, body]) => body.number)).toEqual([1, 9]);
	expect(row.getLatest()).toMatchObject({
		number: 9,
		number_retried: true,
		sync_status: 'failed',
		sync_error: 'wcpos_closure_number_invalid',
	});
	expect((await readRegister(userDB))?.sites.site.registers?.register.last_closure_number).toBe(9);
});

it('blocks a failed named movement and dead-letters the closure after six due attempts', async () => {
	const { session, row } = await closure();
	await session.incrementalPatch({
		sync_status: 'synced',
		server_status: 'closed',
		pending_status: null,
	});
	const movement = await recordMovement(db.cash_movements, {
		sessionId: session.id,
		type: 'paid_out',
		amount: '5',
		reason: 'Milk',
		actor: 7,
	});
	await movement.incrementalPatch({ sync_status: 'failed', sync_error: 'movement_refused' });
	await row.incrementalPatch({ movement_ids: [movement.id] });
	for (let attempt = 1; attempt <= 6; attempt++) {
		await row.incrementalPatch({ sync_next_at: null });
		await drain();
		expect(http.post).not.toHaveBeenCalled();
		expect(row.getLatest()).toMatchObject({
			sync_status: attempt < 6 ? 'pending' : 'failed',
			sync_attempts: attempt,
			sync_error: 'movement_refused',
			synced_rows_at: null,
		});
		if (attempt < 6) {
			expect(row.getLatest().sync_next_at).toBeGreaterThan(Date.now());
			await drain();
			expect(row.getLatest().sync_attempts).toBe(attempt);
		}
	}
	expect(row.getLatest().sync_next_at).toBeNull();
});
it('resubmits the current closure with re-adopted perpetual totals', async () => {
	const { session, row } = await closure();
	await session.incrementalPatch({
		sync_status: 'synced',
		server_status: 'closed',
		pending_status: null,
	});
	await row.incrementalPatch({ period_sales_total: '20', period_refunds_total: '3' });
	http.post.mockRejectedValueOnce({
		response: { status: 409, data: { code: 'wcpos_closure_number_invalid' } },
	});
	http.post.mockImplementation(async (_url, body) => ({
		data: { ...row.getLatest().toJSON(), ...body },
	}));
	http.get.mockResolvedValue({
		data: {
			counters: {
				last_closure_number: 8,
				perpetual_sales_total: '100',
				perpetual_refunds_total: '10',
			},
		},
	});
	await drain();
	expect(http.get).toHaveBeenCalledWith('registers/register');
	expect(http.post.mock.calls[1][1]).toMatchObject({
		number: 9,
		perpetual_sales_total: '120.0000',
		perpetual_refunds_total: '13.0000',
	});
	expect(row.getLatest().sync_status).toBe('synced');
});
