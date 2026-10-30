import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import '@wcpos/database/plugins';
import { storeCollections } from '@wcpos/database/collections';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
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
	oldSession.properties.counted_float.type = 'string';
	oldSession.required.push('counted_float');
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

// Revert either version bump or identity strategy: existing cash figures must reopen intact.
it.each([
	[
		'register_sessions',
		registerSessionsLiteral,
		1,
		['counted_float'],
		{
			id: 's',
			register_id: 'r',
			status: 'open',
			opened_at_gmt: '2026-09-16T08:00:00Z',
			counted_float: '100',
			expected_float: '90',
			opening_variance: '10',
		},
	],
	[
		'cash_movements',
		cashMovementsLiteral,
		0,
		['amount', 'reason'],
		{
			id: 'm',
			session_id: 's',
			type: 'paid_in',
			amount: '5',
			reason: 'Float',
			created_at_gmt: '2026-09-16T09:00:00Z',
		},
	],
] as const)(
	'migrates %s before accepting withheld fields',
	async (collection, schema, version, fields, row) => {
		const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
		const name = `blindmigration${Math.random().toString(36).slice(2)}`;
		let db = await createRxDatabase({ name, storage, multiInstance: false });
		const oldSchema = JSON.parse(JSON.stringify(schema));
		oldSchema.version = version;
		for (const field of fields) {
			oldSchema.properties[field].type = 'string';
			oldSchema.required.push(field);
		}
		const original = { ...row, sync_status: 'synced', sync_attempts: 0 };
		const migrationStrategies = Object.fromEntries(
			Array.from({ length: version }, (_, i) => [i + 1, (d: unknown) => d])
		);
		try {
			await db.addCollections({
				[collection]: { schema: oldSchema, autoMigrate: false, migrationStrategies },
			});
			await db.collections[collection].insert(original);
			await db.close();
			db = await createRxDatabase({ name, storage, multiInstance: false });
			await db.addCollections({ [collection]: storeCollections[collection] });
			expect((await db.collections[collection].findOne(row.id).exec()).toJSON()).toMatchObject(
				original
			);
			const withheld: Record<string, unknown> = { ...original, id: 'withheld' };
			for (const field of fields) delete withheld[field];
			await db.collections[collection].insert(withheld);
			const nullable = {
				...withheld,
				id: 'nullable',
				...Object.fromEntries(fields.map((field) => [field, null])),
			};
			await db.collections[collection].insert(nullable);
			expect(await db.collections[collection].count().exec()).toBe(3);
		} finally {
			await db.remove();
		}
	}
);

// Omitting schema 3 or its strategy loses the upgrade path for existing drawers.
it('migrates a v2 session without inventing a counter and accepts the server stamp', async () => {
	const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
	const name = `countermigration${Math.random().toString(36).slice(2)}`;
	let db = await createRxDatabase({ name, storage, multiInstance: false });
	const oldSchema = JSON.parse(JSON.stringify(registerSessionsLiteral));
	oldSchema.version = 2;
	delete oldSchema.properties.counting_by;
	const original = {
		id: 's',
		register_id: 'r',
		status: 'counting',
		opened_at_gmt: '2026-10-28T08:00:00Z',
		counted_float: '100',
		sync_status: 'synced',
		sync_attempts: 0,
	};
	try {
		await db.addCollections({
			register_sessions: {
				schema: oldSchema,
				migrationStrategies: { 1: (doc) => doc, 2: (doc) => doc },
			},
		});
		await db.register_sessions.insert(original);
		await db.close();
		db = await createRxDatabase({ name, storage, multiInstance: false });
		await db.addCollections({ register_sessions: storeCollections.register_sessions });
		const row = await db.register_sessions.findOne('s').exec();
		expect(row.toJSON()).toMatchObject(original);
		expect(row.counting_by).toBeUndefined();
		await row.incrementalPatch({ counting_by: 7 });
		expect(row.getLatest().counting_by).toBe(7);
	} finally {
		await db.remove();
	}
});

// Reverting either carry schema bump/strategy must fail: old drawers remain unchanged.
it.each([
	['register_sessions', registerSessionsLiteral, 3, ['float_source', 'carried_from_closure_id']],
	['closures', closuresLiteral, 1, ['reason', 'carried_to_register_id']],
] as const)(
	'migrates pre-carry %s without inventing carry fields',
	async (collection, schema, version, fields) => {
		const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
		const name = `carrymigration${Math.random().toString(36).slice(2)}`;
		let db = await createRxDatabase({ name, storage, multiInstance: false });
		const oldSchema = JSON.parse(JSON.stringify(schema));
		oldSchema.version = version;
		for (const field of fields) delete oldSchema.properties[field];
		const original =
			collection === 'register_sessions'
				? {
						id: 's',
						register_id: 'r',
						status: 'open',
						opened_at_gmt: '2026-10-28T08:00:00Z',
						sync_status: 'synced',
						sync_attempts: 0,
					}
				: {
						id: 'c',
						session_id: 's',
						register_id: 'r',
						number: 1,
						opened_at: '2026-10-28T08:00:00Z',
						closed_at: '2026-10-28T17:00:00Z',
						expected: { cash: '100' },
						till_expected: { cash: '100' },
						counted: { cash: '100' },
						variance: { cash: '0' },
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
					};
		try {
			await db.addCollections({
				[collection]: {
					schema: oldSchema,
					migrationStrategies: Object.fromEntries(
						Array.from({ length: version }, (_, i) => [i + 1, (doc: unknown) => doc])
					),
				},
			});
			const before = (await db.collections[collection].insert(original)).toJSON();
			await db.close();
			db = await createRxDatabase({ name, storage, multiInstance: false });
			await db.addCollections({ [collection]: storeCollections[collection] });
			expect(schema.version).toBeGreaterThan(version);
			const row = await db.collections[collection].findOne(original.id).exec();
			expect(row.toJSON()).toMatchObject(before);
			for (const field of fields) expect(row.get(field)).toBeUndefined();
		} finally {
			await db.remove();
		}
	}
);

it('migrates a v4 session with null count details and accepts a persisted count', async () => {
	const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
	const name = `countmigration${Math.random().toString(36).slice(2)}`;
	let db = await createRxDatabase({ name, storage, multiInstance: false });
	const oldSchema = JSON.parse(JSON.stringify(registerSessionsLiteral));
	oldSchema.version = 4;
	delete oldSchema.properties.count_note;
	delete oldSchema.properties.count_denominations;
	const original = {
		id: 's',
		register_id: 'r',
		status: 'closed',
		opened_at_gmt: '2026-10-28T08:00:00Z',
		counted: { cash: '100' },
		sync_status: 'pending',
		sync_attempts: 0,
	};
	try {
		await db.addCollections({
			register_sessions: {
				schema: oldSchema,
				migrationStrategies: Object.fromEntries(
					[1, 2, 3, 4].map((version) => [version, (doc: unknown) => doc])
				),
			},
		});
		await db.register_sessions.insert(original);
		await db.close();
		db = await createRxDatabase({ name, storage, multiInstance: false });
		await db.addCollections({ register_sessions: storeCollections.register_sessions });
		const row = await db.register_sessions.findOne('s').exec();
		expect(row.toJSON()).toMatchObject({
			...original,
			count_note: null,
			count_denominations: null,
		});
		await row.incrementalPatch({
			count_note: 'Found notes',
			count_denominations: [{ value: '50', pieces: 2 }],
		});
		expect(row.getLatest().count_denominations).toEqual([{ value: '50', pieces: 2 }]);
	} finally {
		await db.remove();
	}
});
