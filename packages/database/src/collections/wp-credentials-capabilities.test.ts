/**
 * Pins the RxDB behavior behind the capabilities-clearing design in
 * useUserValidation (packages/core/src/hooks/use-user-validation.ts):
 *
 * 1. Patching `capabilities: undefined` is REJECTED by schema validation —
 *    this is what broke login against servers that omit the capability
 *    payload ("Re-authenticate" + "No stores found" straight after login).
 * 2. Clearing stale capabilities must go through incrementalModify, which
 *    can actually remove the optional key.
 *
 * Storage mirrors the dev adapters: z-schema validation wrapped around the
 * base storage (packages/database/src/adapters/default/index.electron.ts).
 */
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { userCollections } from './index';

beforeAll(() => {
	addRxPlugin(RxDBMigrationSchemaPlugin);
});

async function createTestDB(name: string) {
	const db = await createRxDatabase({
		name,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
	});
	await db.addCollections({
		wp_credentials: { schema: userCollections.wp_credentials.schema },
	});
	return db;
}

describe('wp_credentials capabilities writes', () => {
	it('rejects incrementalPatch({ capabilities: undefined }) with a schema validation error', async () => {
		const db = await createTestDB('caps-undefined-patch');
		const doc = await db.wp_credentials.insert({
			uuid: 'cred-1',
			id: 2,
			username: 'demo',
			capabilities: ['edit_products'],
		});

		await expect(doc.incrementalPatch({ capabilities: undefined } as never)).rejects.toMatchObject({
			code: 'COL20',
		});

		await db.close();
	});

	it('clears the optional capabilities field via incrementalModify', async () => {
		const db = await createTestDB('caps-modify-clear');
		const doc = await db.wp_credentials.insert({
			uuid: 'cred-1',
			id: 2,
			username: 'demo',
			capabilities: ['edit_products'],
		});

		await doc.incrementalModify((docData: { capabilities?: string[] }) => {
			delete docData.capabilities;
			return docData;
		});

		expect(doc.getLatest().toJSON().capabilities).toBeUndefined();

		await db.close();
	});
});
