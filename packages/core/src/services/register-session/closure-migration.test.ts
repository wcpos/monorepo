import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import '@wcpos/database/plugins';
import { storeCollections } from '@wcpos/database/collections';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
jest.mock('uuid', () => ({ v4: () => `uuid-${Math.random().toString(36).slice(2)}` }));
// Revert: change either schema in place or omit its migration strategy; existing drawers must reopen intact.
it('migrates pre-business-day closures and sessions and persists a separate read projection', async () => {
	const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
	const name = `migration${Math.random().toString(36).slice(2)}`;
	let db = await createRxDatabase({ name, storage, multiInstance: false });
	const oldClosure = JSON.parse(JSON.stringify(closuresLiteral));
	const oldSession = JSON.parse(JSON.stringify(registerSessionsLiteral));
	oldClosure.version = 0;
	oldSession.version = 0;
	delete oldClosure.properties.business_day;
	delete oldClosure.properties.receipt_snapshot;
	delete oldSession.properties.business_day;
	await db.addCollections({
		closures: { schema: oldClosure },
		register_sessions: { schema: oldSession },
	});
	await db.register_sessions.insert({
		id: 's',
		register_id: 'r',
		status: 'open',
		opened_at_gmt: '2026-09-11T08:00:00Z',
		counted_float: '100',
		sync_status: 'pending',
		sync_attempts: 0,
	});
	await db.close();
	try {
		db = await createRxDatabase({ name, storage, multiInstance: false });
		await db.addCollections({
			closures: storeCollections.closures,
			register_sessions: storeCollections.register_sessions,
		});
		expect((await db.register_sessions.findOne('s').exec()).counted_float).toBe('100');
		await db.closures.insert({
			id: 'c',
			session_id: 's',
			register_id: 'r',
			number: 1,
			opened_at: '2026-09-11T08:00:00Z',
			closed_at: '2026-09-11T17:00:00Z',
			expected: { cash: '100' },
			till_expected: { cash: '100' },
			counted: { cash: '99' },
			variance: { cash: '-1' },
			period_sales_total: '0',
			period_refunds_total: '0',
			perpetual_sales_total: '0',
			perpetual_refunds_total: '0',
			unsynced_count: 0,
			unsynced_total: '0',
			software_version: '',
			breakdowns: {},
			order_ids: [],
			movement_ids: [],
			sync_status: 'synced',
			sync_attempts: 0,
			print_count: 0,
			receipt_snapshot: '{"closure":{"corrections":[]}}',
		});
		expect((await db.closures.findOne('c').exec()).receipt_snapshot).toContain('corrections');
	} finally {
		await db.remove();
	}
});
