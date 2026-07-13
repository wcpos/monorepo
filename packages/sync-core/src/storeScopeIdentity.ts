/**
 * Store-scope identity → canonical scope key → database name.
 *
 * CONTEXT.md "Store scope": the identity that names one independent local
 * database is site + store + cashier (per-cashier isolation is deliberate —
 * ADR 0002). This module is the ONE place that turns those three identities
 * into the `ScopeId` string the store-scope manager keys on, and into the
 * database name a host opens. Hosts must not invent their own composition —
 * a store-blind or cashier-blind name silently shares data across scopes
 * (the exact failure the per-store pricing model in the parity backlog would
 * turn into wrong prices at the till).
 *
 * Naming scheme (ADR 0013): `pos_v<generation>_<siteHash12>_s<store>_c<cashier>`.
 * - The site is hashed: site URLs are not filename-safe and should not leak
 *   into on-disk database names. Spelling variants (scheme, case, trailing
 *   slashes) canonicalize to one site first.
 * - Store and cashier ids stay readable — they are short, filename-safe, and
 *   make a devtools/storage listing self-describing.
 * - `pos_v<generation>` mirrors the old app's `store_v4_` convention: a
 *   storage-format migration bumps the generation so old and new databases
 *   coexist during the transition, and cleanup can enumerate every
 *   generation by prefix.
 */

export type StoreScopeIdentity = {
	/** Site identity — the site URL (any spelling) or a stable site uuid. */
	site: string;
	/** Woo store id (0 on a single-store install) or a store uuid. */
	storeId: number | string;
	/** Cashier identity — the WP user id or uuid. */
	cashierId: number | string;
};

export type ScopeDatabaseNameOptions = {
	/** Storage-format generation; bump on breaking storage migrations. */
	generation?: number;
	/** Extra suffix so tests can open isolated copies of the same scope. */
	namespace?: string;
};

const SITE_HASH_LENGTH = 12;
const COMPONENT_PATTERN = /^[a-z0-9-]+$/;
const SCOPE_DATABASE_NAME_SOURCE = 'pos_v\\d+_[a-f0-9]{12}_s[a-z0-9-]+_c[a-z0-9-]+';
const SCOPE_DATABASE_NAME_PATTERN = new RegExp(`^${SCOPE_DATABASE_NAME_SOURCE}`);
const SCOPE_DATABASE_NAME_ANYWHERE = new RegExp(SCOPE_DATABASE_NAME_SOURCE);

/**
 * Canonicalize a site identity so URL spelling variants (scheme, case,
 * trailing slashes, padding) name the same site. Paths are kept — a
 * subdirectory install is a different site.
 */
export function canonicalSiteKey(site: string): string {
	let canonical = site.trim().toLowerCase();
	if (canonical.startsWith('https://')) canonical = canonical.slice('https://'.length);
	else if (canonical.startsWith('http://')) canonical = canonical.slice('http://'.length);
	while (canonical.endsWith('/')) canonical = canonical.slice(0, -1);
	if (canonical === '') {
		throw new Error('Store scope site must be a non-empty site URL or uuid');
	}
	return canonical;
}

/** FNV-1a 64-bit over the canonical site, truncated to 12 hex chars. */
function siteHash(site: string): string {
	const canonical = canonicalSiteKey(site);
	const FNV_OFFSET = 0xcbf29ce484222325n;
	const FNV_PRIME = 0x100000001b3n;
	const MASK_64 = 0xffffffffffffffffn;
	let hash = FNV_OFFSET;
	for (let i = 0; i < canonical.length; i += 1) {
		hash ^= BigInt(canonical.charCodeAt(i));
		hash = (hash * FNV_PRIME) & MASK_64;
	}
	return hash.toString(16).padStart(16, '0').slice(0, SITE_HASH_LENGTH);
}

function canonicalComponent(value: number | string, label: 'storeId' | 'cashierId'): string {
	if (typeof value === 'number') {
		if (!Number.isInteger(value) || value < 0) {
			throw new Error(`Store scope ${label} must be a non-negative integer, got ${value}`);
		}
		return String(value);
	}
	const canonical = value.trim().toLowerCase();
	if (/^-\d+$/.test(canonical)) {
		throw new Error(`Store scope ${label} must be a non-negative integer, got ${value}`);
	}
	if (!COMPONENT_PATTERN.test(canonical)) {
		throw new Error(
			`Store scope ${label} must be filename-safe ([a-z0-9-]), got ${JSON.stringify(value)}`
		);
	}
	return canonical;
}

/**
 * The canonical scope key — use this as the `ScopeId` for the store-scope
 * manager. `<siteHash12>_s<store>_c<cashier>`; no storage generation, because
 * the scope's identity does not change when the storage format does.
 */
export function scopeKeyFor(identity: StoreScopeIdentity): string {
	const site = siteHash(identity.site);
	const store = canonicalComponent(identity.storeId, 'storeId');
	const cashier = canonicalComponent(identity.cashierId, 'cashierId');
	return `${site}_s${store}_c${cashier}`;
}

/** The database name a host opens for one store scope. */
export function scopeDatabaseName(
	identity: StoreScopeIdentity,
	options?: ScopeDatabaseNameOptions
): string {
	const generation = options?.generation ?? 1;
	const suffix = options?.namespace === undefined ? '' : `_${options.namespace}`;
	return `pos_v${generation}_${scopeKeyFor(identity)}${suffix}`;
}

/** True for any generation of scope-derived database name (cleanup, recovery). */
export function isScopeDatabaseName(name: string): boolean {
	return SCOPE_DATABASE_NAME_PATTERN.test(name);
}

/**
 * True when a storage entry EMBEDS a scope database name — rxdb internal
 * stores and paired FlexSearch index stores derive their names from the
 * database name, so full-reset cleanup must match by containment.
 */
export function containsScopeDatabaseName(name: string): boolean {
	return SCOPE_DATABASE_NAME_ANYWHERE.test(name);
}
