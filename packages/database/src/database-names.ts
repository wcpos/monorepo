import { containsLegacyScopeDatabaseName, containsScopeDatabaseName } from '@wcpos/sync-core';

import { DATABASE_GENERATION } from './database-generation';

/**
 * WCPOS 1.9.x used the v4/v5 databases. Bump the current generation for
 * cold resync on schema resets; never purge the platform's current names.
 */
const USER_DATABASE_NAME = `wcposusers_${DATABASE_GENERATION}`;
const STORE_DATABASE_PREFIX = `store_${DATABASE_GENERATION}_`;
const FAST_STORE_DATABASE_PREFIX = `fast_store_${DATABASE_GENERATION}_`;

const legacyEngineGenerations = ['v6', 'v7'].filter(
	(generation) => generation !== String(DATABASE_GENERATION)
);

export const LEGACY_USER_DATABASE_NAMES = [
	'wcposusers_v2',
	'wcposusers_v3',
	'wcposusers_v4',
	...legacyEngineGenerations.map((generation) => `wcposusers_${generation}`),
] as const;
export const LEGACY_STORE_PREFIXES = [
	'store_v2_',
	'store_v3_',
	'store_v4_',
	...legacyEngineGenerations.map((generation) => `store_${generation}_`),
] as const;
export const LEGACY_FAST_STORE_PREFIXES = [
	'fast_store_v3_',
	'fast_store_v4_',
	'fast_store_v5_',
	...legacyEngineGenerations.map((generation) => `fast_store_${generation}_`),
] as const;

/**
 * All known prefixes (including the skipped filesystem-era v3/v4 versions)
 * so that clearAllDB and identification helpers cover every generation.
 */
const ALL_STORE_PREFIXES = [...LEGACY_STORE_PREFIXES, STORE_DATABASE_PREFIX] as const;
const ALL_FAST_STORE_PREFIXES = [
	...LEGACY_FAST_STORE_PREFIXES,
	FAST_STORE_DATABASE_PREFIX,
] as const;
const LEGACY_APP_DATABASE_PREFIXES = [
	...LEGACY_USER_DATABASE_NAMES,
	...LEGACY_STORE_PREFIXES,
	...LEGACY_FAST_STORE_PREFIXES,
] as const;

export const APP_DATABASE_PREFIXES = [
	'wcposusers_',
	...ALL_STORE_PREFIXES,
	...ALL_FAST_STORE_PREFIXES,
] as const;

const matchesAnyPrefix = (value: string, prefixes: readonly string[]) =>
	prefixes.some((prefix) => value.startsWith(prefix));

export const getUserDatabaseName = () => USER_DATABASE_NAME;
export const getStoreDatabaseName = (id: string) => `${STORE_DATABASE_PREFIX}${id}`;

export const isStoreDatabaseName = (value: string) => matchesAnyPrefix(value, ALL_STORE_PREFIXES);
export const isFastStoreDatabaseName = (value: string) =>
	matchesAnyPrefix(value, ALL_FAST_STORE_PREFIXES);
/**
 * What the post-readiness purge deletes: every retired app-database family
 * AND every scope database (`pos_v<n>_…`) of a generation below the one this
 * build opens — the store's engine data, by far the largest legacy footprint.
 */
export const isLegacyAppDatabaseName = (value: string) =>
	matchesAnyPrefix(value, LEGACY_APP_DATABASE_PREFIXES) || containsLegacyScopeDatabaseName(value);
export const isKnownAppDatabaseName = (value: string) =>
	matchesAnyPrefix(value, APP_DATABASE_PREFIXES);
/**
 * Re-exported from sync-core, which owns the scope-database name grammar
 * (`pos_v<generation>_<siteHash12>_s<store>_c<cashier>`, ADR 0013). Storage
 * cleanup matches by containment because rxdb internal stores and paired
 * FlexSearch index stores derive their names from the database name.
 */
export { containsScopeDatabaseName };
