import { describe, expect, it } from 'vitest';

import {
	canonicalSiteKey,
	containsScopeDatabaseName,
	isScopeDatabaseName,
	scopeDatabaseName,
	scopeKeyFor,
	type StoreScopeIdentity,
} from './storeScopeIdentity';

const identity: StoreScopeIdentity = {
	site: 'https://example.com/',
	storeId: 4,
	cashierId: 12,
};

describe('canonicalSiteKey', () => {
	it('strips scheme, lowercases, and drops trailing slashes so URL spelling variants share one site', () => {
		const canonical = canonicalSiteKey('https://Example.com/');
		expect(canonical).toBe('example.com');
		expect(canonicalSiteKey('http://example.com')).toBe(canonical);
		expect(canonicalSiteKey('HTTPS://EXAMPLE.COM///')).toBe(canonical);
		expect(canonicalSiteKey('  example.com  ')).toBe(canonical);
	});

	it('keeps paths — a subdirectory install is a different site', () => {
		expect(canonicalSiteKey('https://example.com/shop-two')).toBe('example.com/shop-two');
		expect(canonicalSiteKey('https://example.com/shop-two')).not.toBe(
			canonicalSiteKey('https://example.com')
		);
	});

	it('rejects an empty site', () => {
		expect(() => canonicalSiteKey('   ')).toThrow(/site/i);
	});
});

describe('scopeKeyFor', () => {
	it('renders site hash + readable store and cashier ids', () => {
		const key = scopeKeyFor(identity);
		expect(key).toMatch(/^[a-f0-9]{12}_s4_c12$/);
	});

	it('is deterministic and insensitive to site URL spelling', () => {
		expect(scopeKeyFor(identity)).toBe(
			scopeKeyFor({ site: 'HTTP://EXAMPLE.COM', storeId: 4, cashierId: 12 })
		);
	});

	it('separates sites, stores, and cashiers into distinct scopes', () => {
		const base = scopeKeyFor(identity);
		expect(scopeKeyFor({ ...identity, site: 'https://other.example.com' })).not.toBe(base);
		expect(scopeKeyFor({ ...identity, storeId: 5 })).not.toBe(base);
		expect(scopeKeyFor({ ...identity, cashierId: 13 })).not.toBe(base);
	});

	it('accepts uuid string components and lowercases them', () => {
		const key = scopeKeyFor({
			site: 'example.com',
			storeId: 0,
			cashierId: '0FA80E52-11B5-4B4F-8B5E-0F9E4C7D2A31',
		});
		expect(key.endsWith('_c0fa80e52-11b5-4b4f-8b5e-0f9e4c7d2a31')).toBe(true);
	});

	it('rejects components that would not be filename-safe', () => {
		expect(() => scopeKeyFor({ ...identity, storeId: -1 })).toThrow(/storeId/);
		expect(() => scopeKeyFor({ ...identity, storeId: '-1' })).toThrow(/storeId/);
		expect(() => scopeKeyFor({ ...identity, storeId: 1.5 })).toThrow(/storeId/);
		expect(() => scopeKeyFor({ ...identity, cashierId: 'a b' })).toThrow(/cashierId/);
		expect(() => scopeKeyFor({ ...identity, cashierId: '-1' })).toThrow(/cashierId/);
		expect(() => scopeKeyFor({ ...identity, cashierId: '' })).toThrow(/cashierId/);
	});
});

describe('scopeDatabaseName', () => {
	it('defaults to the v2 scope generation for the sync cutover', () => {
		const name = scopeDatabaseName(identity);
		expect(name).toBe(`pos_v2_${scopeKeyFor(identity)}`);
	});

	it('bumps the generation prefix for storage-format migrations', () => {
		expect(scopeDatabaseName(identity, { generation: 2 })).toBe(`pos_v2_${scopeKeyFor(identity)}`);
	});

	it('appends a namespace suffix for test isolation', () => {
		expect(scopeDatabaseName(identity, { namespace: 'run7' })).toBe(
			`pos_v2_${scopeKeyFor(identity)}_run7`
		);
	});

	it('produces names RxDB and file-backed storages accept (lowercase, starts with a letter)', () => {
		const name = scopeDatabaseName({
			site: 'https://Example.com/wp',
			storeId: 0,
			cashierId: '0FA80E52-11B5-4B4F-8B5E-0F9E4C7D2A31',
		});
		expect(name).toMatch(/^[a-z][a-z0-9_-]*$/);
	});
});

describe('isScopeDatabaseName', () => {
	it('recognises generated names at any generation', () => {
		expect(isScopeDatabaseName(scopeDatabaseName(identity))).toBe(true);
		expect(isScopeDatabaseName(scopeDatabaseName(identity, { generation: 9 }))).toBe(true);
	});

	it('rejects the legacy fixed lab name and playground host names', () => {
		expect(isScopeDatabaseName('woo-rxdb-replication-lab')).toBe(false);
		expect(isScopeDatabaseName('web-host-scope-a')).toBe(false);
		expect(isScopeDatabaseName('pos_vX_nope')).toBe(false);
	});
});

describe('containsScopeDatabaseName', () => {
	it('matches storage entries that embed a scope database name (rxdb internals, flexsearch stores)', () => {
		const db = scopeDatabaseName(identity);
		expect(containsScopeDatabaseName(db)).toBe(true);
		expect(containsScopeDatabaseName(`rxdb|${db}|orders`)).toBe(true);
		expect(containsScopeDatabaseName(`rxdb-dexie-${db}--0--_rxdb_internal`)).toBe(true);
		expect(containsScopeDatabaseName(`${db}--orders_flexsearch`)).toBe(true);
	});

	it('does not match unrelated names', () => {
		expect(containsScopeDatabaseName('unrelated-shop-data')).toBe(false);
		expect(containsScopeDatabaseName('positive_vibes')).toBe(false);
	});
});
