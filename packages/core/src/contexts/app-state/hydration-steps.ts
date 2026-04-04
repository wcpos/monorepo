type PersistentDatabase = StorageMigrationDatabase & {
	close: () => Promise<boolean>;
	addCollections: (...args: any[]) => Promise<any>;
};

async function resetFailedMigrationTargetIfNeeded({
	database,
	name,
	config,
	recreate,
}: {
	database: PersistentDatabase;
	name: string;
	config: PersistentDatabaseConfig;
	recreate: () => Promise<PersistentDatabase>;
}) {
	if (database.name !== name) return database;
	if (database.getLocal('migration-target') !== null) return database;
	const resetDatabase = await recreate();
	await resetDatabase.addCollections(collectionSchemas);
	await resetDatabase.close();
	return resetDatabase;
}

const createDefaultConfig = (): PersistentDatabaseConfig => ({
	driver: indexeddb as any,
	name: '',
	columns: {},
	cache: true,
	localDocuments: true,
});

const defaultConfig = createDefaultConfig();

const getUserCollections = async () => {
	const userSchema = await import('./schemas/users');
	const { UserCollection } = userSchema;
	return [UserCollection];
};

const collectionSchemas = await getUserCollections();

const initializeUserDBStep: HydrationStep = {
	unique: true,
	execute: async (context) => {
		const initialDatabase = await createUserDB('user-db', defaultConfig);
		const reset = await resetFailedMigrationTargetIfNeeded({
			database: initialDatabase as any,
			name: 'user-db',
			config: defaultConfig,
			recreate: () =>
				createRxDatabase<UserCollections>({
					name: 'user-db',
					...defaultConfig,
					localDocuments: true,
				}),
		});

		await reset?.addCollections(collectionSchemas);

		const { users } = reset;

		const user = await users.findOne().exec();
		if (!user) {
			throw new Error('No user found in the database');
		}

		const appState = await user.addState('v2');
		const translationsState = await user.addState('translations_v2');

		const hydratedContext: Partial<HydrationContext> = {
			...context,
			userDB: reset,
			translations: translationsState.data.translations,
		};

		return hydratedContext;
	},
};

export const UserDBHydrationSteps = {
	Step1: initializeUserDBStep,
};

const hydrateUserSession = async (context: HydrationContext): Promise<HydrationContext> => {
	const db = await createUserDB('store-db', defaultConfig);
	const extraData = await db.addState('data_v2');

	const hydratedContext = {
		...context,
		storeDB: db,
		extraData: extraData.data,
	};

	return hydratedContext;
};

export const HydrationSteps = {
	Step1: hydrateUserSession,
};