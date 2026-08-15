/**
 * Uniform record identity (ADR 0008, guardrail G1) — the DECIDED UUID scheme,
 * ported from production's `generate-id` plugin
 * (`monorepo-v2/packages/database/src/plugins/generate-id.ts`). One scheme for
 * EVERY collection (orders, products, variations, customers, tax rates,
 * categories, brands), for records born on the server OR locally.
 *
 * Invariant: a record is keyed by a UUID that is **stable from birth and never
 * re-keyed** — including on a server create-ack (the held-reference constraint;
 * a re-key invalidates open RxDocument handles and silently drops edits).
 *
 *  - **Server-born:** the record arrives carrying its uuid in
 *    `meta_data._woocommerce_pos_uuid` — reuse it as the key.
 *  - **Local-born:** no server uuid yet — mint one and mirror it into
 *    `meta_data._woocommerce_pos_uuid` so the server persists the SAME id; the
 *    create-ack then reconciles by uuid (`awaitingRemoteCreateUUID`) rather than
 *    assigning a new key.
 *
 * Pure + framework-agnostic: the uuid generator is **injected**, so this module
 * keeps this module dependency-free and stays deterministic
 * under test. Hosts inject `crypto.randomUUID` (web / node) or the `uuid`
 * package's v4 (React Native, where `crypto.randomUUID` is absent).
 */

/** The WooCommerce-POS meta key that mirrors a record's stable uuid (both engines agree on this). */
export const RECORD_UUID_META_KEY = '_woocommerce_pos_uuid';

/**
 * Permissive UUID shape: 8-4-4-4-12 hex, case-insensitive, any version/variant.
 * Deliberately not v4-strict — both engines mint v4, but we accept any standard
 * uuid shape so a legitimate server value is never false-rejected (which would
 * fork identity), while still rejecting non-uuid corruption (`"foo"`, a label, …).
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a uuid-shaped non-empty string usable as a record key. */
export function isRecordUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_SHAPE.test(value);
}

/** A WooCommerce `meta_data` entry. */
export type MetaDataEntry = { key: string; value: unknown };

/** Where a resolved id came from — useful for instrumentation + the push handshake. */
export type RecordIdOrigin = 'existing' | 'server-meta' | 'minted';

export type RecordIdentity = {
	/** The stable primary key — never re-keyed once set. */
	id: string;
	/** `meta_data` guaranteed to mirror `id` under `_woocommerce_pos_uuid`. */
	metaData: MetaDataEntry[];
	/** Provenance of `id`. `minted` means born-local and awaiting a server ack. */
	origin: RecordIdOrigin;
};

export type ResolveRecordIdentityInput = {
	/** An id already on the record (a prior key), if any. Takes precedence — never re-keyed. */
	currentId?: string | null;
	/** The record's `meta_data` (server records carry the uuid here). */
	metaData?: readonly MetaDataEntry[] | null;
	/** UUID generator — inject `crypto.randomUUID` or `uuid` v4. Called only for a born-local record. */
	mintUuid: () => string;
	/**
	 * Whether to mint a new uuid when neither a key nor a valid meta uuid is
	 * present. Default `true` (a local create may mint). Pull/apply paths should
	 * pass `false`: a SERVER record must already carry its identity (key or
	 * `_woocommerce_pos_uuid`), and a sparse fieldset missing it is a contract
	 * error, not a born-local record — minting there would fork a divergent id.
	 */
	mintOnMissing?: boolean;
};

/**
 * Read the canonical record uuid mirrored in `meta_data`, or `null` if absent.
 * Returns the first **uuid-shaped** `_woocommerce_pos_uuid` value — skipping a
 * blank / non-string / malformed (non-uuid) entry and, when Woo returns duplicate
 * keys, an earlier invalid duplicate in favour of a later valid one. A malformed
 * value is treated as absent (corruption is not adopted as a key).
 */
export function readRecordUuid(
	metaData: readonly MetaDataEntry[] | null | undefined
): string | null {
	if (!Array.isArray(metaData)) return null;
	for (const meta of metaData) {
		if (meta?.key === RECORD_UUID_META_KEY && isRecordUuid(meta.value)) {
			return meta.value;
		}
	}
	return null;
}

/**
 * Return a copy of `metaData` whose `_woocommerce_pos_uuid` mirrors `id` exactly
 * once. Invariant after this call: there is precisely one `_woocommerce_pos_uuid`
 * entry and its value is `id`. A record already in that canonical shape is
 * returned as a stable copy (so an unchanged record stays referentially quiet);
 * otherwise blank / non-string / duplicate / mismatched entries are dropped and a
 * single canonical entry is appended. The input array is never mutated.
 *
 * (This is stricter than production's plain push-if-missing: production never
 * reconciles a blank or duplicate entry, which would leave `meta` out of sync
 * with the key. We keep the invariant total.)
 */
export function mirrorRecordUuid(
	metaData: readonly MetaDataEntry[] | null | undefined,
	id: string
): MetaDataEntry[] {
	const base = Array.isArray(metaData) ? metaData : [];
	const uuidEntries = base.filter((meta) => meta?.key === RECORD_UUID_META_KEY);
	if (uuidEntries.length === 1 && uuidEntries[0].value === id) {
		return base.slice(); // already canonical — keep it stable
	}
	const others = base.filter((meta) => meta?.key !== RECORD_UUID_META_KEY);
	return [...others, { key: RECORD_UUID_META_KEY, value: id }];
}

/**
 * Resolve the stable uuid identity for a record, mirroring production's
 * `generateID`: prefer an existing key, else the server's meta uuid, else mint —
 * then ensure `meta_data` mirrors the resolved id. Idempotent: re-resolving an
 * already-resolved record returns the same id with `meta_data` unchanged. Never
 * mutates its input.
 */
export function resolveRecordIdentity(input: ResolveRecordIdentityInput): RecordIdentity {
	const metaUuid = readRecordUuid(input.metaData);
	const currentId =
		typeof input.currentId === 'string' && input.currentId.length > 0 ? input.currentId : null;
	// A record's key and its mirrored `_woocommerce_pos_uuid` must be the same
	// identity. If a caller supplies a key that disagrees with a valid server uuid,
	// that is corruption — surface it rather than re-key (forbidden) or clobber the
	// server's value. (Cannot happen in normal flows; the key IS the meta uuid.)
	if (currentId && metaUuid && currentId !== metaUuid) {
		throw new Error(
			`resolveRecordIdentity: identity conflict — key "${currentId}" disagrees with _woocommerce_pos_uuid "${metaUuid}". A record has exactly one stable identity; it is never re-keyed.`
		);
	}
	let id: string;
	let origin: RecordIdOrigin;
	if (currentId) {
		id = currentId;
		origin = 'existing';
	} else if (metaUuid) {
		id = metaUuid;
		origin = 'server-meta';
	} else if (input.mintOnMissing === false) {
		throw new Error(
			'resolveRecordIdentity: record carries no key or _woocommerce_pos_uuid and minting is disabled — a server record must arrive with its identity (do not request a sparse fieldset that omits it).'
		);
	} else {
		id = input.mintUuid();
		origin = 'minted';
	}
	return { id, origin, metaData: mirrorRecordUuid(input.metaData, id) };
}

/** A WooCommerce record payload — any shape that may carry `meta_data`. */
export type WooRecordPayload = { meta_data?: MetaDataEntry[] } & Record<string, unknown>;

export type IdentifiedRecord<T extends WooRecordPayload> = {
	/** The stable uuid key. */
	id: string;
	/** Provenance — `minted` ⇒ born-local, awaiting the server create-ack. */
	origin: RecordIdOrigin;
	/**
	 * A copy of `payload` whose `meta_data` mirrors `id` (never mutates the input).
	 * `meta_data` is narrowed to a canonical `MetaDataEntry[]` — it is always
	 * present and well-formed on the result, even when the input `T` omitted it or
	 * typed it loosely.
	 */
	payload: Omit<T, 'meta_data'> & { meta_data: MetaDataEntry[] };
};

/**
 * THE canonical seam every collection's pull/create uses to apply uniform UUID
 * identity to a WooCommerce record payload — one place, not a per-collection copy
 * (G1). Resolves the record's stable id from `payload.meta_data._woocommerce_pos_uuid`
 * (server-born) / an existing key / a fresh mint (local-born), and returns a copy
 * of the payload whose `meta_data` mirrors that id so the server persists the same
 * value (`awaitingRemoteCreateUUID`). Pull/apply callers pass `mintOnMissing:false`
 * so a server record arriving without its identity throws rather than forking a
 * divergent uuid; born-local creates use the default (mint).
 */
export function identifyRecord<T extends WooRecordPayload>(
	payload: T,
	options: { currentId?: string | null; mintUuid: () => string; mintOnMissing?: boolean }
): IdentifiedRecord<T> {
	const { id, origin, metaData } = resolveRecordIdentity({
		currentId: options.currentId,
		metaData: payload.meta_data,
		mintUuid: options.mintUuid,
		mintOnMissing: options.mintOnMissing,
	});
	return { id, origin, payload: { ...payload, meta_data: metaData } };
}

/**
 * Convenience generator using the Web Crypto API (`crypto.randomUUID`) — a
 * standard v4 UUID, available on web + node ≥ 16 + modern engines. Throws a clear
 * error where it is absent (e.g. React Native) so the host injects the `uuid`
 * package instead. This module stays dependency-free — this only reads
 * `globalThis.crypto`.
 */
export function webCryptoUuid(): string {
	const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	if (typeof cryptoObj?.randomUUID !== 'function') {
		throw new Error(
			'webCryptoUuid: crypto.randomUUID is unavailable here — inject a uuid v4 generator (e.g. the `uuid` package) instead.'
		);
	}
	return cryptoObj.randomUUID();
}
