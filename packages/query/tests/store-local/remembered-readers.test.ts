import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBStatePlugin } from 'rxdb/plugins/state';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';

import { observeRememberedReaders, rememberedReaders } from '../../src/store-local';

addRxPlugin(RxDBMigrationSchemaPlugin);
addRxPlugin(RxDBStatePlugin);
let db: RxDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `readers${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
});
afterEach(async () => {
	await db.remove();
});
const reader = {
	id: 'reader-1',
	label: 'Counter',
	model: 'Solo',
	serial: '123',
	transport: 'bluetooth',
} as const;

it('round-trips readers, emits changes and prunes the removed key', async () => {
	const preferences = rememberedReaders(db);
	expect(await preferences.get('card')).toBeNull();
	const values = firstValueFrom(observeRememberedReaders(db).pipe(take(3), toArray()));
	await firstValueFrom(observeRememberedReaders(db));
	await preferences.set('card', reader);
	expect(await preferences.get('card')).toEqual(reader);
	await preferences.remove('card');
	expect(await preferences.get('card')).toBeNull();
	expect(await values).toEqual([{}, { card: reader }, {}]);
});

it('emits the explicit absent value', async () => {
	expect(await firstValueFrom(observeRememberedReaders(null))).toEqual({});
});
