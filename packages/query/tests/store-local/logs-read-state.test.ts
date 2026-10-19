import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBStatePlugin } from 'rxdb/plugins/state';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom, of } from 'rxjs';

import { logsLiteral } from '../../../database/src/collections/schemas/logs';
import * as reads from '../../src/store-local';

it('does not create or seed read-state until subscribed', async () => {
	let watermark: number | undefined;
	const state = {
		get: () => watermark,
		get$: () => of(watermark),
		set: jest.fn(async (_path: string, modifier: () => number) => {
			watermark = modifier();
		}),
	};
	const storeDB = {
		collections: { logs: { count: () => ({ $: of(3) }) } },
		addState: jest.fn(async () => state),
	};
	const unread$ = reads.observeUnreadErrorCount(storeDB);
	expect(storeDB.addState).not.toHaveBeenCalled();
	expect(state.set).not.toHaveBeenCalled();
	expect(await firstValueFrom(unread$)).toBe(3);
	expect(state.set).toHaveBeenCalledTimes(1);
	await reads.markLogsRead(storeDB, 123);
	expect(watermark).toBe(123);
});

it('returns zero without a database and marking absent state is harmless', async () => {
	expect(await firstValueFrom(reads.observeUnreadErrorCount(null))).toBe(0);
	await expect(reads.markLogsRead(null, 123)).resolves.toBeUndefined();
});

addRxPlugin(RxDBMigrationSchemaPlugin);
addRxPlugin(RxDBStatePlugin);

it.each([
	{ level: 'error', expected: 1 },
	{ level: 'warn', expected: 0 },
])(
	'counts a collapsed $level repeat after marking Logs read as $expected unread',
	async ({ level, expected }) => {
		const db = await createRxDatabase({
			name: `readstate${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			multiInstance: false,
			allowSlowCount: true,
		});
		try {
			await db.addCollections({ logs: { schema: logsLiteral } });
			const now = Date.now();
			const row = await db.logs.insert({
				logId: 'repeat',
				level,
				timestamp: now - 2_000,
				lastSeen: now - 2_000,
			});
			await reads.markLogsRead(db, now - 1_000);
			expect(await firstValueFrom(reads.observeUnreadErrorCount(db))).toBe(0);
			await row.incrementalPatch({ count: 2, lastSeen: now });
			expect(await firstValueFrom(reads.observeUnreadErrorCount(db))).toBe(expected);
		} finally {
			await db.remove();
		}
	}
);
