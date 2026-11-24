import { RECORD_UUID_META_KEY } from '../recordIdentity';
import { SERVER_OWNED_ORDER_META_KEYS } from '../woo/orderWriteContract';

export type PosIdentity = {
	cashierId: string | null;
	storeId: string | null;
	registerId?: string;
	tillId?: string;
};
export type MetaDataEntry = { id?: number; key?: string; value?: unknown };

export interface PosCarrier {
	readSaleDay(meta: MetaDataEntry[] | undefined): {
		atGmt: string;
		reason: string;
		by: number | null;
		changedAtGmt: string | null;
	} | null;
	readSaleDayRequest(
		meta: MetaDataEntry[] | undefined
	): { atGmt: string; reason: string; from: string } | null;
	saleDayRequestRow(atGmt: string, reason: string, from: string): string;
	readIdentity(meta: MetaDataEntry[] | undefined): PosIdentity;
	stampIdentity(
		meta: MetaDataEntry[] | undefined,
		identity: {
			userId: string | number;
			storeId: string | number;
			/** A string replaces the register; `undefined` (or '') leaves it; `null` clears it. */
			registerId?: string | null;
			tillId?: string;
		}
	): MetaDataEntry[];
	taxBasedOnOverride(meta: MetaDataEntry[] | undefined): string | null;
	vatExempt(meta: MetaDataEntry[] | undefined): boolean;
	stampVatExempt(meta: MetaDataEntry[] | undefined, exempt: boolean): MetaDataEntry[];
	lineUuid(line: { meta_data?: MetaDataEntry[] }): string | null;
	ensureLineUuid<L extends { meta_data?: MetaDataEntry[] }>(line: L, mintUuid: () => string): L;
	identityFilter(identity: {
		cashierId?: string;
		storeId?: string;
		registerId?: string;
	}): Record<string, unknown>;
	decodeIdentityFilter(
		selector: Record<string, unknown>
	): { cashierId?: string; storeId?: string; registerId?: string } | null;
}

/**
 * Store-attribution sentinel: store id 0 = single-store install / no store attribution
 * (a POS convention, not a Woo wire fact). Callers omit the `_pos_store` meta entry for
 * it; `stampIdentity` itself stamps whatever it is given.
 */
export const NO_STORE = 0;

export const POS_META_KEYS = {
	// Keep aligned with PAYMENT_METHOD_INDEX_META_KEY in order-math/src/payments/ledger.ts.
	paymentMethod: '_wcpos_payment_method',
	saleDay: '_wcpos_sale_day',
	saleDayRequest: '_wcpos_sale_day_request',
	user: '_pos_user',
	store: '_pos_store',
	register: '_wcpos_register',
	session: '_wcpos_session',
	reducedStock: '_reduced_stock',
	till: '_wcpos_till',
	taxBasedOn: '_woocommerce_pos_tax_based_on',
	vatExempt: 'is_vat_exempt',
	lineUuid: RECORD_UUID_META_KEY,
	posData: '_woocommerce_pos_data',
} as const;

/** Hidden from meta editors; mutations retain omitted rows and cannot replace server-owned facts. */
export const PROTECTED_ORDER_META_KEYS: readonly string[] = [
	...SERVER_OWNED_ORDER_META_KEYS,
	POS_META_KEYS.user,
	POS_META_KEYS.store,
	POS_META_KEYS.register,
	POS_META_KEYS.till,
	POS_META_KEYS.vatExempt,
	POS_META_KEYS.saleDayRequest,
	RECORD_UUID_META_KEY,
	'_wcpos_money_owner_hint',
];

function scalarMetaValue(meta: MetaDataEntry[] | undefined, key: string): string | null {
	if (!Array.isArray(meta)) return null;
	for (const entry of meta) {
		if (entry?.key !== key) continue;
		if (typeof entry.value === 'string' && entry.value !== '') return entry.value;
		if (typeof entry.value === 'number' && Number.isFinite(entry.value)) {
			return String(entry.value);
		}
	}
	return null;
}

/**
 * The identity is STAMPED as a string, but `readIdentity` (via `scalarMetaValue`) also
 * accepts an integer a server-side writer left behind. A condition that reaches storage
 * cannot coerce, so a numeric-looking identity matches both spellings (#2249 review).
 */
function identityCondition(key: string, value: string): Record<string, unknown> {
	const spellings = /^\d+$/.test(value) ? { $in: [value, Number(value)] } : value;
	return { meta_data: { $elemMatch: { key, value: spellings } } };
}

function decodeSingleIdentityCondition(
	selector: Record<string, unknown>
): { cashierId?: string; storeId?: string; registerId?: string } | null {
	const metaData = selector.meta_data;
	if (metaData === null || typeof metaData !== 'object') return null;
	const elemMatch = (metaData as Record<string, unknown>).$elemMatch;
	if (elemMatch === null || typeof elemMatch !== 'object') return null;
	const { key, value: spellings } = elemMatch as Record<string, unknown>;
	const value =
		spellings !== null &&
		typeof spellings === 'object' &&
		Array.isArray((spellings as { $in?: unknown }).$in)
			? (spellings as { $in: unknown[] }).$in.find((entry) => typeof entry === 'string')
			: spellings;
	if (typeof value !== 'string') return null;
	if (key === POS_META_KEYS.user) return { cashierId: value };
	if (key === POS_META_KEYS.store) return { storeId: value };
	if (key === POS_META_KEYS.register) return { registerId: value };
	return null;
}

/** Indexed spelling of the carrier identity; no store attribution is the empty string. */
export function identityColumns(identity: Pick<PosIdentity, 'cashierId' | 'storeId'>) {
	return { posUserId: identity.cashierId ?? '', posStoreId: identity.storeId ?? '' };
}

export function identityColumnFilter(identity: { cashierId?: string; storeId?: string }) {
	return {
		...(identity.cashierId === undefined ? {} : { posUserId: identity.cashierId }),
		...(identity.storeId === undefined ? {} : { posStoreId: identity.storeId }),
	};
}

export const wooMetaCarrier: PosCarrier = {
	readSaleDay(meta) {
		if (!Array.isArray(meta)) return null;
		const value = meta.find((entry) => entry?.key === POS_META_KEYS.saleDay)?.value;
		try {
			// The server stores a JSON string and serves it decoded.
			const parsed = typeof value === 'string' ? JSON.parse(value) : value;
			if (
				!parsed ||
				typeof parsed !== 'object' ||
				typeof parsed.at_gmt !== 'string' ||
				!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/.test(parsed.at_gmt) ||
				Number.isNaN(Date.parse(parsed.at_gmt)) ||
				// A day the calendar does not have (30 February) rolls over in Date.parse.
				new Date(`${parsed.at_gmt.slice(0, 19)}Z`).toISOString().slice(0, 19) !==
					parsed.at_gmt.slice(0, 19) ||
				typeof parsed.reason !== 'string'
			)
				return null;
			return {
				atGmt: parsed.at_gmt,
				reason: parsed.reason,
				by: typeof parsed.by === 'number' ? parsed.by : null,
				changedAtGmt: typeof parsed.changed_at_gmt === 'string' ? parsed.changed_at_gmt : null,
			};
		} catch {
			return null;
		}
	},
	readSaleDayRequest(meta) {
		if (!Array.isArray(meta)) return null;
		const value = meta.find((entry) => entry?.key === POS_META_KEYS.saleDayRequest)?.value;
		if (typeof value !== 'string') return null;
		try {
			const parsed = JSON.parse(value);
			const fact = wooMetaCarrier.readSaleDay([{ key: POS_META_KEYS.saleDay, value: parsed }]);
			return fact && typeof parsed.from === 'string'
				? { atGmt: fact.atGmt, reason: fact.reason, from: parsed.from }
				: null;
		} catch {
			return null;
		}
	},
	saleDayRequestRow: (atGmt, reason, from) => JSON.stringify({ at_gmt: atGmt, reason, from }),
	vatExempt(meta) {
		return (
			Array.isArray(meta) &&
			meta.find((entry) => entry?.key === POS_META_KEYS.vatExempt)?.value === 'yes'
		);
	},
	stampVatExempt(meta, exempt) {
		const stamped: MetaDataEntry[] = [];
		let replaced = false;
		const value = exempt ? 'yes' : 'no';
		for (const entry of Array.isArray(meta) ? meta : []) {
			if (entry?.key !== POS_META_KEYS.vatExempt) {
				stamped.push(entry);
			} else if (!replaced) {
				stamped.push({ ...entry, value });
				replaced = true;
			}
		}
		if (!replaced) stamped.push({ key: POS_META_KEYS.vatExempt, value });
		return stamped;
	},
	readIdentity(meta) {
		return {
			cashierId: scalarMetaValue(meta, POS_META_KEYS.user),
			storeId: scalarMetaValue(meta, POS_META_KEYS.store),
			registerId: scalarMetaValue(meta, POS_META_KEYS.register) ?? undefined,
			tillId: scalarMetaValue(meta, POS_META_KEYS.till) ?? undefined,
		};
	},

	stampIdentity(meta, identity) {
		const values = new Map<string, string>([
			[POS_META_KEYS.user, String(identity.userId)],
			[POS_META_KEYS.store, String(identity.storeId)],
		]);
		if (typeof identity.registerId === 'string' && identity.registerId)
			values.set(POS_META_KEYS.register, identity.registerId);
		// Cleared as a value, never dropped: a missing row or a null tombstone cannot erase a
		// protected identity row on the local write (`mergeProtectedOrderMeta`), so the register row
		// holds '' (keeping its id, or added) and reads as no register. A write that may meet a
		// register this meta never had (a rollback) clears it that way too.
		if (identity.registerId === null) values.set(POS_META_KEYS.register, '');
		if (identity.tillId) values.set(POS_META_KEYS.till, identity.tillId);
		const stamped: MetaDataEntry[] = [];
		const replaced = new Set<string>();
		for (const entry of Array.isArray(meta) ? meta : []) {
			const value = entry?.key ? values.get(entry.key) : undefined;
			if (value === undefined) {
				stamped.push(entry);
			} else if (!replaced.has(entry.key!)) {
				stamped.push({ ...entry, value });
				replaced.add(entry.key!);
			}
		}
		for (const [key, value] of values) {
			if (!replaced.has(key) && (value !== '' || key === POS_META_KEYS.register))
				stamped.push({ key, value });
		}
		return stamped;
	},

	taxBasedOnOverride(meta) {
		if (!Array.isArray(meta)) return null;
		for (const entry of meta) {
			if (
				entry?.key === POS_META_KEYS.taxBasedOn &&
				typeof entry.value === 'string' &&
				entry.value !== ''
			) {
				return entry.value;
			}
		}
		return null;
	},

	lineUuid(line) {
		if (!Array.isArray(line.meta_data)) return null;
		for (const entry of line.meta_data) {
			if (
				entry?.key === POS_META_KEYS.lineUuid &&
				typeof entry.value === 'string' &&
				entry.value !== ''
			) {
				return entry.value;
			}
		}
		return null;
	},

	ensureLineUuid(line, mintUuid) {
		if (wooMetaCarrier.lineUuid(line) !== null) return line;
		return {
			...line,
			meta_data: [
				...(Array.isArray(line.meta_data) ? line.meta_data : []),
				{ key: POS_META_KEYS.lineUuid, value: mintUuid() },
			],
		} as typeof line;
	},

	identityFilter(identity) {
		const conditions = [
			identity.cashierId === undefined
				? undefined
				: identityCondition(POS_META_KEYS.user, identity.cashierId),
			identity.storeId === undefined
				? undefined
				: identityCondition(POS_META_KEYS.store, identity.storeId),
			identity.registerId === undefined
				? undefined
				: identityCondition(POS_META_KEYS.register, identity.registerId),
		].filter((condition): condition is Record<string, unknown> => condition !== undefined);
		if (conditions.length === 0) return {};
		if (conditions.length === 1) return conditions[0];
		return { $and: conditions };
	},

	decodeIdentityFilter(selector) {
		const single = decodeSingleIdentityCondition(selector);
		if (single) return single;
		if (Object.keys(selector).length === 0) return {};
		if (!Array.isArray(selector.$and)) return null;
		const identity: { cashierId?: string; storeId?: string; registerId?: string } = {};
		for (const condition of selector.$and) {
			if (condition === null || typeof condition !== 'object') return null;
			const decoded = decodeSingleIdentityCondition(condition as Record<string, unknown>);
			if (!decoded) return null;
			if (decoded.cashierId !== undefined) identity.cashierId = decoded.cashierId;
			if (decoded.storeId !== undefined) identity.storeId = decoded.storeId;
			if (decoded.registerId !== undefined) identity.registerId = decoded.registerId;
		}
		return identity;
	},
};
