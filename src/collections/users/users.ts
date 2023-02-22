import schema from './schema.json';

export type UserSchema = import('./interface').UserSchema;
export type UserDocument = import('rxdb').RxDocument<UserSchema, UserMethods>;
export type UserCollection = import('rxdb').RxCollection<UserDocument, UserMethods, UserStatics>;

type UserMethods = Record<string, never>;
type UserStatics = Record<string, never>;

export const users = {
	schema,
};
