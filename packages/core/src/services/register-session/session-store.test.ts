import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { StoreDatabase } from '@wcpos/database';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';

import {
	backToSelling,
	closeSession,
	openSession,
	recordMovement,
	requireOpenSession,
	retryMovement,
	startCounting,
	voidMovement,
} from './session-store';

let db: StoreDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `session${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
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
const input = { registerId: 'register', expectedFloat: '100', countedFloat: '100', openedBy: 7 };
it('opens pending and retains the pending transition through each local state', async () => {
	const doc = await openSession(db.register_sessions, input);
	expect(doc).toMatchObject({ status: 'open', sync_status: 'pending', counted_float: '100' });
	await startCounting(db.register_sessions, doc.id);
	expect(doc.getLatest()).toMatchObject({ status: 'counting', pending_status: 'counting' });
	await backToSelling(db.register_sessions, doc.id);
	expect(doc.getLatest()).toMatchObject({ status: 'open', pending_status: 'open' });
	await startCounting(db.register_sessions, doc.id);
	await closeSession(db.register_sessions, doc.id, { counted: { cash: '105' } });
	expect(doc.getLatest()).toMatchObject({
		status: 'closed',
		pending_status: 'closed',
		counted: { cash: '105' },
	});
});
it('void inserts a write-once reversal and marks its target', async () => {
	const session = await openSession(db.register_sessions, input);
	const row = await recordMovement(db.cash_movements, {
		sessionId: session.id,
		type: 'paid_out',
		amount: '7',
		reason: 'Milk',
		actor: 7,
	});
	const [reversal, concurrent] = await Promise.all([
		voidMovement(db.cash_movements, row.id, 7),
		voidMovement(db.cash_movements, row.id, 7),
	]);
	expect(concurrent.id).toBe(reversal.id);
	const repeated = await voidMovement(db.cash_movements, row.id, 7);
	expect(reversal).toMatchObject({ type: 'void', voids: row.id, sync_status: 'pending' });
	expect(repeated.id).toBe(reversal.id);
	expect(await db.cash_movements.count().exec()).toBe(2);
	expect(row.getLatest().voided_by).toBe(reversal.id);
});

it('gates counting and missing sessions, and expires the expected snapshot before money actions', async () => {
	expect(await requireOpenSession(undefined, null, false)).toBeNull();
	await expect(requireOpenSession(db.register_sessions, 'register', true)).rejects.toMatchObject({
		name: 'RegisterSessionRequiredError',
	});
	const row = await openSession(db.register_sessions, input);
	await row.incrementalPatch({ server_expected: { cash: '100' }, server_sales_count: 2 });
	expect(await requireOpenSession(db.register_sessions, 'register', true)).toBe(row.id);
	expect(row.getLatest().server_expected).toBeNull();
	await startCounting(db.register_sessions, row.id);
	await expect(requireOpenSession(db.register_sessions, 'register', true)).rejects.toMatchObject({
		name: 'RegisterSessionRequiredError',
	});
	await row.incrementalPatch({ status: 'open', sync_status: 'failed' });
	await expect(requireOpenSession(db.register_sessions, 'register', true)).rejects.toMatchObject({
		name: 'RegisterSessionRequiredError',
	});
});

it('re-queues a refused movement so the outbox will send it again', async () => {
	const session = await openSession(db.register_sessions, input);
	const row = await recordMovement(db.cash_movements, {
		sessionId: session.id,
		type: 'paid_in',
		amount: '20',
		reason: 'Change',
		actor: 7,
	});
	await row.incrementalPatch({
		sync_status: 'failed',
		sync_attempts: 3,
		sync_error: 'rest_invalid_param',
		sync_next_at: null,
	});

	await retryMovement(db.cash_movements, row.id);

	expect(row.getLatest().toJSON()).toMatchObject({
		sync_status: 'pending',
		sync_attempts: 0,
		sync_next_at: null,
		sync_error: null,
		amount: '20',
	});
});
