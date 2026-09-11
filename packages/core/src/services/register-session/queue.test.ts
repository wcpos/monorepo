import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { StoreDatabase } from '@wcpos/database';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';

import { openSession, recordMovement, startCounting } from './session-store';
import { drainRegisterSessionQueue } from './queue';

jest.mock('uuid', () => ({ v4: () => globalThis.crypto.randomUUID() }));
let db: StoreDatabase;
const http = { post: jest.fn(), get: jest.fn() };
const logger = { warn: jest.fn() };
beforeEach(async () => {
	jest.clearAllMocks();
	db = await createRxDatabase({
		name: `queue${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	await db.addCollections({
		register_sessions: { schema: registerSessionsLiteral },
		cash_movements: { schema: cashMovementsLiteral },
	});
});
afterEach(async () => {
	await db.remove();
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
	expect(row.getLatest()).toMatchObject({ status: 'counting', pending_status: 'counting' });
	await drain();
	expect(http.post.mock.calls[2][0]).toBe(`sessions/${row.id}/status`);
	expect(row.getLatest()).toMatchObject({ sync_status: 'synced', pending_status: null });
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
