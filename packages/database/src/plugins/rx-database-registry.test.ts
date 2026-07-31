import { addRxPlugin, createRxDatabase } from 'rxdb';
import {
	getRxStorageMemory,
	type RxStorageMemory,
	type RxStorageMemoryInstanceCreationOptions,
} from 'rxdb/plugins/storage-memory';

import { forceFreeDatabaseRegistration, rxDatabaseRegistryPlugin } from './rx-database-registry';

import type { RxDatabase, RxStorageInstanceCreationParams } from 'rxdb';

type CloseControl = {
	started: Promise<void>;
	release: () => void;
};

function createControlledCloseStorage(): {
	storage: RxStorageMemory;
	closeControls: CloseControl[];
} {
	const storage = getRxStorageMemory();
	const closeControls: CloseControl[] = [];

	return {
		storage: {
			...storage,
			async createStorageInstance<RxDocType>(
				params: RxStorageInstanceCreationParams<RxDocType, RxStorageMemoryInstanceCreationOptions>
			) {
				const instance = await storage.createStorageInstance(params);
				let signalStarted = () => undefined;
				let release = () => undefined;
				const started = new Promise<void>((resolve) => {
					signalStarted = () => resolve();
				});
				const closeGate = new Promise<void>((resolve) => {
					release = () => resolve();
				});
				const originalClose = instance.close.bind(instance);
				instance.close = async () => {
					signalStarted();
					await closeGate;
					await originalClose();
				};
				closeControls.push({ started, release });
				return instance;
			},
		},
		closeControls,
	};
}

async function closeControlledDatabase(database: RxDatabase, control: CloseControl): Promise<void> {
	const closing = database.close();
	await control.started;
	control.release();
	await closing;
}

beforeAll(() => {
	addRxPlugin(rxDatabaseRegistryPlugin);
});

describe('rx database registry plugin', () => {
	it('frees a wedged database registration so the same name can reopen', async () => {
		const { storage, closeControls } = createControlledCloseStorage();
		const db1 = await createRxDatabase({ name: 'same-name', storage });
		const db1Closing = db1.close();
		await closeControls[0].started;

		await expect(createRxDatabase({ name: 'same-name', storage })).rejects.toMatchObject({
			code: 'DB8',
		});
		expect(forceFreeDatabaseRegistration('same-name')).toBe(true);

		const db2 = await createRxDatabase({ name: 'same-name', storage });
		await closeControlledDatabase(db2, closeControls[1]);
		closeControls[0].release();
		await db1Closing;
	});

	it('preserves the successor registration when the wedged close settles late', async () => {
		const { storage, closeControls } = createControlledCloseStorage();
		const db1 = await createRxDatabase({ name: 'same-name', storage });
		const db1Closing = db1.close();
		await closeControls[0].started;

		await expect(createRxDatabase({ name: 'same-name', storage })).rejects.toMatchObject({
			code: 'DB8',
		});
		expect(forceFreeDatabaseRegistration('same-name')).toBe(true);
		const db2 = await createRxDatabase({ name: 'same-name', storage });

		closeControls[0].release();
		await db1Closing;

		await expect(createRxDatabase({ name: 'same-name', storage })).rejects.toMatchObject({
			code: 'DB8',
		});
		await closeControlledDatabase(db2, closeControls[1]);
	});

	it('removes normally closed databases from the registry', async () => {
		const name = 'normal-close';
		const database = await createRxDatabase({
			name,
			storage: getRxStorageMemory(),
		});

		await database.close();

		expect(forceFreeDatabaseRegistration(name)).toBe(false);
	});
});
