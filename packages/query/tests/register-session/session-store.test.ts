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
	recordApproval,
	recordMovement,
	requireOpenSession,
	retryMovement,
	startCounting,
	voidMovement,
} from '../../src/register-session/session-store';
import { adoptMovementRow, adoptSessionRow } from '../../src/register-session/queue';
import { deriveDrawerTerms, deriveExpected } from '../../src/register-session/expected';

let db: StoreDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `session${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	await db.addCollections({
		register_sessions: { schema: registerSessionsLiteral, autoMigrate: false },
		cash_movements: { schema: cashMovementsLiteral, autoMigrate: false },
	});
});
afterEach(async () => {
	await db.remove();
});
const input = {
	registerId: 'register',
	expectedFloat: '100',
	countedFloat: '100',
	openedBy: 7,
	businessDay: { year: 2026, month: 9, day: 16 },
};
it('opens pending and retains the pending transition through each local state', async () => {
	const doc = await openSession(db, input);
	expect(doc).toMatchObject({ status: 'open', sync_status: 'pending', counted_float: '100' });
	await startCounting(db, doc.id);
	expect(doc.getLatest()).toMatchObject({ status: 'counting', pending_status: 'counting' });
	await backToSelling(db, doc.id);
	expect(doc.getLatest()).toMatchObject({ status: 'open', pending_status: 'open' });
	await startCounting(db, doc.id);
	await closeSession(db, doc.id, { counted: { cash: '105' } });
	expect(doc.getLatest()).toMatchObject({
		status: 'closed',
		pending_status: 'closed',
		counted: { cash: '105' },
	});
});
it('void inserts a write-once reversal and marks its target', async () => {
	const session = await openSession(db, input);
	const row = await recordMovement(db, {
		sessionId: session.id,
		type: 'paid_out',
		amount: '7',
		reason: 'Milk',
		actor: 7,
	});
	const [reversal, concurrent] = await Promise.all([
		voidMovement(db, row.id, 7),
		voidMovement(db, row.id, 7),
	]);
	expect(concurrent.id).toBe(reversal.id);
	const repeated = await voidMovement(db, row.id, 7);
	expect(reversal).toMatchObject({
		type: 'void',
		amount: '0',
		reason: '',
		voids: row.id,
		sync_status: 'pending',
	});
	expect(repeated.id).toBe(reversal.id);
	expect(await db.cash_movements.count().exec()).toBe(2);
	expect(row.getLatest().voided_by).toBe(reversal.id);
});

it('voids a paid-in with a zero-amount reversal and no reason', async () => {
	const session = await openSession(db, input);
	const target = await recordMovement(db, {
		sessionId: session.id,
		type: 'paid_in',
		amount: '7',
		reason: 'Float',
		actor: 7,
	});
	const reversal = await voidMovement(db, target.id, 7);
	expect(reversal).toMatchObject({ type: 'void', amount: '0', reason: '', voids: target.id });
	expect(target.getLatest().voided_by).toBe(reversal.id);
});

it('gates counting and missing sessions, and retains the server baseline before money actions', async () => {
	expect(await requireOpenSession(undefined, null, false)).toBeNull();
	await expect(requireOpenSession(db, 'register', true)).rejects.toMatchObject({
		name: 'RegisterSessionRequiredError',
	});
	const row = await openSession(db, input);
	await row.incrementalPatch({ server_expected: { cash: '100' }, server_sales_count: 2 });
	expect(await requireOpenSession(db, 'register', true)).toBe(row.id);
	expect(row.getLatest().toJSON()).toMatchObject({
		server_expected: { cash: '100' },
		server_sales_count: 2,
	});
	await startCounting(db, row.id);
	await expect(requireOpenSession(db, 'register', true)).rejects.toMatchObject({
		name: 'RegisterSessionRequiredError',
	});
	await row.incrementalPatch({ status: 'open', sync_status: 'failed' });
	await expect(requireOpenSession(db, 'register', true)).rejects.toMatchObject({
		name: 'RegisterSessionRequiredError',
	});
});

it('re-queues a refused movement so the outbox will send it again', async () => {
	const session = await openSession(db, input);
	const row = await recordMovement(db, {
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

	await retryMovement(db, row.id);

	expect(row.getLatest().toJSON()).toMatchObject({
		sync_status: 'pending',
		sync_attempts: 0,
		sync_next_at: null,
		sync_error: null,
		amount: '20',
	});
});

// Revert: remove business_day from openSession's inserted row.
it('stamps the supplied store day rather than the device UTC day', async () => {
	const row = await openSession(db, input);
	expect(row.toJSON()).toMatchObject({ business_day: '2026-09-16' });
});

// Revert: close a legacy overnight session without stamping its opening store day.
it('derives the opening business day when closing a legacy session', async () => {
	const doc = await openSession(db, input);
	await doc.incrementalModify((value) => {
		delete value.business_day;
		return { ...value, opened_at_gmt: '2026-09-17T02:00:00Z' };
	});
	await closeSession(db, doc.id, {
		counted: { cash: '100' },
		...{ timezone: 'America/Los_Angeles' },
	});
	expect(doc.getLatest().business_day).toBe('2026-09-16');
});

// Revert: accept a missing database or resolve the old collection instead of the handle.
it('rejects an unavailable store database for enabled session reads and writes', async () => {
	expect(() => openSession(undefined, input)).toThrow('Store database is unavailable');
	await expect(requireOpenSession(undefined, 'register', true)).rejects.toMatchObject({
		name: 'StoreDatabaseUnavailableError',
	});
});

it('records the approved count without changing the transition or losing the session', async () => {
	const row = await openSession(db, input);
	await recordApproval(db, row.id, { approvedBy: 42, approvedCounted: { cash: '101' } });
	expect(row.getLatest()).toMatchObject({
		approved_by: 42,
		approved_counted: { cash: '101' },
		approval_required: false,
		sync_error: null,
		status: 'open',
	});
	await expect(
		recordApproval(db, 'missing', { approvedBy: 42, approvedCounted: {} })
	).rejects.toBeInstanceOf(Error);
});

it('inserts an unseen session with null counted_float', async () => {
	await adoptSessionRow(db.register_sessions, {
		id: 'blind-session',
		register_id: 'other-till',
		status: 'open',
		opened_at_gmt: '2026-09-16T08:00:00Z',
		counted_float: null,
		sync_status: 'synced',
		sync_attempts: 0,
	});
	const session = (await db.register_sessions.findOne('blind-session').exec())!.toJSON();
	expect(session.counted_float).toBeNull();
});

it('inserts unseen blind rows and derives zero without inventing withheld values', async () => {
	await adoptSessionRow(db.register_sessions, {
		id: 'blind-session',
		register_id: 'other-till',
		status: 'open',
		opened_at_gmt: '2026-09-16T08:00:00Z',
		sync_status: 'synced',
		sync_attempts: 0,
	});
	await adoptMovementRow(db.cash_movements, {
		id: 'blind-movement',
		session_id: 'blind-session',
		type: 'paid_in',
		created_at_gmt: '2026-09-16T09:00:00Z',
		actor: 7,
	});
	const session = (await db.register_sessions.findOne('blind-session').exec())!.toJSON();
	const movement = (await db.cash_movements.findOne('blind-movement').exec())!.toJSON();
	expect(session).not.toHaveProperty('counted_float');
	expect(movement).not.toHaveProperty('amount');
	expect(movement).not.toHaveProperty('reason');
	const data = { session, movements: [movement], ledgerRowsBySession: [] };
	expect(deriveExpected(data)).toEqual({ cash: '0.0000' });
	expect(deriveDrawerTerms(data)).toMatchObject({
		float: '0.0000',
		paidIn: [{ amount: '0.0000' }],
		expected: '0.0000',
	});
});
