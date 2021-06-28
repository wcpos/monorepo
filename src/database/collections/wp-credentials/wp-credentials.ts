import unset from 'lodash/unset';
import schema from './schema.json';

export type WPCredentialsSchema = import('./interface').WPCredentialsSchema;
export type WPCredentialsDocument = import('rxdb').RxDocument<
	WPCredentialsSchema,
	WPCredentialsMethods
>;
export type WPCredentialsCollection = import('rxdb').RxCollection<
	WPCredentialsDocument,
	WPCredentialsMethods,
	WPCredentialsStatics
>;
type WPCredentialsMethods = Record<string, never>;

interface WPCredentialsStatics {
	// preInsertUserId: (plainData: Record<string, unknown>) => Promise<void>;
}

/**
 *
 */
export const statics: WPCredentialsStatics = {
	/**
	 *
	 */
	// async preInsertUserId(
	// 	this: WPCredentialsCollection,
	// 	plainData: Record<string, unknown>
	// 	// db: any
	// ) {
	// 	if (plainData.userId) {
	// 		plainData.id = plainData.userId;
	// 		unset(plainData, 'userId');
	// 	}
	// },
};

export const wpCredentials = {
	schema,
	// pouchSettings: {},
	statics,
	// methods: {},
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
