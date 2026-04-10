export const USER_DATABASE_NAMES = {
	oldName: 'wcposusers_v2',
	newName: 'wcposusers_v4',
} as const;

export const STORE_DATABASE_PREFIXES = ['store_v2_', 'store_v4_'] as const;
export const FAST_STORE_DATABASE_PREFIXES = ['fast_store_v3_', 'fast_store_v5_'] as const;

/**
 * All known prefixes (including the skipped filesystem-era v3/v4 versions)
 * so that clearAllDB and identification helpers cover every generation.
 */
const ALL_STORE_PREFIXES = ['store_v2_', 'store_v3_', 'store_v4_'] as const;
const ALL_FAST_STORE_PREFIXES = ['fast_store_v3_', 'fast_store_v4_', 'fast_store_v5_'] as const;

export const APP_DATABASE_PREFIXES = [
	'wcposusers_',
	...ALL_STORE_PREFIXES,
	...ALL_FAST_STORE_PREFIXES,
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

export const isStoreDatabaseName = (value: string) => matchesAnyPrefix(value, ALL_STORE_PREFIXES);
export const isFastStoreDatabaseName = (value: string) =>
	matchesAnyPrefix(value, ALL_FAST_STORE_PREFIXES);
export const isKnownAppDatabaseName = (value: string) =>
	matchesAnyPrefix(value, APP_DATABASE_PREFIXES);
