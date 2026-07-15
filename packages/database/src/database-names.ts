const USER_DATABASE_NAME = 'wcposusers_v4';
const STORE_DATABASE_PREFIX = 'store_v4_';
const FAST_STORE_DATABASE_PREFIX = 'fast_store_v5_';

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

export const getUserDatabaseName = () => USER_DATABASE_NAME;
export const getStoreDatabaseName = (id: string) => `${STORE_DATABASE_PREFIX}${id}`;
export const getFastStoreDatabaseName = (id: string) => `${FAST_STORE_DATABASE_PREFIX}${id}`;

export const isStoreDatabaseName = (value: string) => matchesAnyPrefix(value, ALL_STORE_PREFIXES);
export const isFastStoreDatabaseName = (value: string) =>
	matchesAnyPrefix(value, ALL_FAST_STORE_PREFIXES);
export const isKnownAppDatabaseName = (value: string) =>
	matchesAnyPrefix(value, APP_DATABASE_PREFIXES);
