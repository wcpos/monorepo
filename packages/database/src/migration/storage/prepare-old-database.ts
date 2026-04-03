import { addRxPlugin, createRxDatabase } from 'rxdb-old';
import { RxDBAttachmentsPlugin } from 'rxdb-old/plugins/attachments';
import { RxDBMigrationPlugin } from 'rxdb-old/plugins/migration-schema';

type PrepareOldDatabaseInput = {
	oldDatabaseName: string;
	oldStorage: any;
	collections: Record<string, any>;
};

let oldPluginsRegistered = false;

const safeAddOldPlugin = (plugin: any) => {
	try {
		addRxPlugin(plugin);
	} catch (error) {
		if ((error as { code?: string }).code !== 'PL3') {
			throw error;
		}
	}
};

const registerOldMigrationPlugins = () => {
	if (oldPluginsRegistered) {
		return;
	}

	safeAddOldPlugin(RxDBMigrationPlugin);
	safeAddOldPlugin(RxDBAttachmentsPlugin);
	oldPluginsRegistered = true;
};

export async function prepareOldDatabaseForStorageMigration({
	oldDatabaseName,
	oldStorage,
	collections,
}: PrepareOldDatabaseInput): Promise<void> {
	registerOldMigrationPlugins();

	const database = await createRxDatabase({
		name: oldDatabaseName,
		storage: oldStorage,
		multiInstance: false,
	});

	try {
		await database.addCollections(collections);
	} finally {
		await database.close();
	}
}
