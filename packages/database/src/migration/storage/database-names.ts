export const USER_DATABASE_NAMES = {
	oldName: 'wcposusers_v2',
	newName: 'wcposusers_v3',
} as const;

export const STORE_DATABASE_PREFIXES = ['store_v2_', 'store_v3_'] as const;
export const FAST_STORE_DATABASE_PREFIXES = ['fast_store_v3_', 'fast_store_v4_'] as const;

export const APP_DATABASE_PREFIXES = [
	'wcposusers_',
	...STORE_DATABASE_PREFIXES,
	...FAST_STORE_DATABASE_PREFIXES,
] as const;

const matchesAnyPrefix = (value: string, prefixes: readonly string[]) =>
	prefixes.some((prefix) => value.startsWith(prefix));

export const getUserDatabaseNames = () => USER_DATABASE_NAMES;

export const getStoreDatabaseNames = (id: string) => ({
	oldName: `${STORE_DATABASE_PREFIXES[0]}${id}`,
	newName: `${STORE_DATABASE_PREFIXES[1]}${id}`,
});

export const getFastStoreDatabaseNames = (id: string) => ({
	oldName: `${FAST_STORE_DATABASE_PREFIXES[0]}${id}`,
	newName: `${FAST_STORE_DATABASE_PREFIXES[1]}${id}`,
});

export const isStoreDatabaseName = (value: string) =>
	matchesAnyPrefix(value, STORE_DATABASE_PREFIXES);
export const isFastStoreDatabaseName = (value: string) =>
	matchesAnyPrefix(value, FAST_STORE_DATABASE_PREFIXES);
export const isKnownAppDatabaseName = (value: string) =>
	matchesAnyPrefix(value, APP_DATABASE_PREFIXES);
