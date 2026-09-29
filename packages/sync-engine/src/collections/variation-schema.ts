/**
 * Product variations — first-class local records (CONTEXT.md: their own
 * collection, indexed barcode + parent reference). Pulled ON DEMAND via the
 * versioned `{syncBase}/variations?include=<ids>` endpoint, which
 * resolves the parent server-side. The stable string `uuid` is the primary key;
 * `remoteId` and `parentRemoteId` mirror the driver identities.
 */
import {
	finiteOrNull,
	foldSearchText,
	type RemoteId,
	remoteIdOrNull,
	remoteKeyFor,
} from '@wcpos/sync-core';

export type WooVariationPayload = Record<string, unknown> & { id?: number };

export type LocalVariationDocument = {
	uuid: string;
	remoteId: RemoteId | null;
	remoteKey: string;
	parentRemoteId: RemoteId | null;
	payload: WooVariationPayload;
	sync: {
		revision: string;
		partial: boolean;
		source: 'woo-rest';
	};
	local: {
		dirty: boolean;
		pendingMutationIds: string[];
	};
};

/** A normalized variation attribute. Malformed non-string entries are dropped for 1.9 parity
 * (#811). The WooCommerce "Any <attribute>" case is modeled as ABSENCE (the entry is dropped),
 * so the variation filter's `$not $elemMatch` "any" semantics work uniformly. */
export type VariationAttribute = { id: number; name: string; option: string };

/** Promoted variation filter/sort columns. `attributes` is promoted out of payload so the variation
 * attribute filter (`$or[$not $elemMatch {id,name}, $elemMatch {id,name,option}]`) is Mango-queryable. */
export type PromotedVariationColumns = {
	sortName: string;
	parentRemoteKey: string;
	price: number;
	stockStatus: string;
	attributes: VariationAttribute[];
	/** Decimal-capable managed stock (P2-2). null when stock management is off. */
	stockQuantity: number | null;
};

export type StoredVariationDocument = LocalVariationDocument & PromotedVariationColumns;

/** Normalize a variation's `attributes`: DROP malformed non-string entries for 1.9 parity (#811)
 * and DROP "any" entries (empty option), so "any" becomes absence. */
export function normalizeVariationAttributes(value: unknown): VariationAttribute[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (entry === null || typeof entry !== 'object') return [];
		const { id, name, option } = entry as Record<string, unknown>;
		if (typeof name !== 'string' || typeof option !== 'string') return [];
		if (name === '' || option === '') return [];
		return [{ id: Number(id) || 0, name, option }];
	});
}

/** Project the promoted variation columns from a Woo variation payload. Pure. */
export function promotedVariationColumns(payload: WooVariationPayload): PromotedVariationColumns {
	return {
		sortName: foldSearchText(payload.name ?? '').slice(0, 256),
		parentRemoteKey: remoteKeyFor(remoteIdOrNull(payload.parent_id)),
		// Match the product index precision; payload.price remains unrounded for JS sorting.
		price: Math.round((Number(payload.price) || 0) * 100) / 100,
		stockStatus: String(payload.stock_status ?? ''),
		attributes: normalizeVariationAttributes(payload.attributes),
		// Decimal-preserving (no (int) coercion); null when stock management is off.
		stockQuantity: finiteOrNull(payload.stock_quantity),
	};
}

export const variationSchema = {
	title: 'Woo product-variation document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		remoteId: { type: ['string', 'null'], maxLength: 64 },
		remoteKey: { type: 'string', maxLength: 64 },
		sortName: { type: 'string', maxLength: 256 },
		parentRemoteId: { type: ['string', 'null'], maxLength: 64 },
		parentRemoteKey: { type: 'string', maxLength: 64 },
		// Promoted filter columns (duplicated out of payload, payload bytes unchanged).
		price: { type: 'number', minimum: -100_000_000, maximum: 100_000_000, multipleOf: 0.01 },
		stockStatus: { type: 'string', maxLength: 24 },
		attributes: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'number' },
					name: { type: 'string' },
					option: { type: 'string' },
				},
			},
		},
		// Decimal-capable managed stock (P2-2) — no integer bound (WooCommerce POS allows
		// fractional stock). Not indexed (number-or-null can't back an RxDB index).
		stockQuantity: { type: ['number', 'null'] },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: [
		'uuid',
		'remoteId',
		'remoteKey',
		'sortName',
		'parentRemoteId',
		'parentRemoteKey',
		'price',
		'stockStatus',
		'attributes',
		'stockQuantity',
		'payload',
		'sync',
		'local',
	],
	indexes: ['sortName', 'remoteKey', 'parentRemoteKey', 'stockStatus', 'price'],
} as const;
