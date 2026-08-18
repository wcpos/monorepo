import { RECORD_UUID_META_KEY } from '../recordIdentity';

export type PosIdentity = { cashierId: string | null; storeId: string | null };
export type MetaDataEntry = { id?: number; key?: string; value?: unknown };

export interface PosCarrier {
	readIdentity(meta: MetaDataEntry[] | undefined): PosIdentity;
	stampIdentity(
		meta: MetaDataEntry[] | undefined,
		identity: { userId: string | number; storeId: string | number }
	): MetaDataEntry[];
	taxBasedOnOverride(meta: MetaDataEntry[] | undefined): string | null;
	lineUuid(line: { meta_data?: MetaDataEntry[] }): string | null;
	ensureLineUuid<L extends { meta_data?: MetaDataEntry[] }>(line: L, mintUuid: () => string): L;
	identityFilter(identity: { cashierId?: string; storeId?: string }): Record<string, unknown>;
	decodeIdentityFilter(
		selector: Record<string, unknown>
	): { cashierId?: string; storeId?: string } | null;
}

export const POS_META_KEYS = {
	user: '_pos_user',
	store: '_pos_store',
	taxBasedOn: '_woocommerce_pos_tax_based_on',
	lineUuid: RECORD_UUID_META_KEY,
	posData: '_woocommerce_pos_data',
} as const;

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

function identityCondition(key: string, value: string): Record<string, unknown> {
	return { meta_data: { $elemMatch: { key, value } } };
}

function decodeSingleIdentityCondition(
	selector: Record<string, unknown>
): { cashierId?: string; storeId?: string } | null {
	const metaData = selector.meta_data;
	if (metaData === null || typeof metaData !== 'object') return null;
	const elemMatch = (metaData as Record<string, unknown>).$elemMatch;
	if (elemMatch === null || typeof elemMatch !== 'object') return null;
	const { key, value } = elemMatch as Record<string, unknown>;
	if (typeof value !== 'string') return null;
	if (key === POS_META_KEYS.user) return { cashierId: value };
	if (key === POS_META_KEYS.store) return { storeId: value };
	return null;
}

export const wooMetaCarrier: PosCarrier = {
	readIdentity(meta) {
		return {
			cashierId: scalarMetaValue(meta, POS_META_KEYS.user),
			storeId: scalarMetaValue(meta, POS_META_KEYS.store),
		};
	},

	stampIdentity(meta, identity) {
		const values = new Map<string, string>([
			[POS_META_KEYS.user, String(identity.userId)],
			[POS_META_KEYS.store, String(identity.storeId)],
		]);
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
			if (!replaced.has(key)) stamped.push({ key, value });
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
		const identity: { cashierId?: string; storeId?: string } = {};
		for (const condition of selector.$and) {
			if (condition === null || typeof condition !== 'object') return null;
			const decoded = decodeSingleIdentityCondition(condition as Record<string, unknown>);
			if (!decoded) return null;
			if (decoded.cashierId !== undefined) identity.cashierId = decoded.cashierId;
			if (decoded.storeId !== undefined) identity.storeId = decoded.storeId;
		}
		return identity;
	},
};
