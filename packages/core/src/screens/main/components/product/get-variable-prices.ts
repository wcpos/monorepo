import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const uiLogger = getLogger(['wcpos', 'ui', 'product']);

type VariableRange = { min: string; max: string };

// The server omits a sub-range when no visible variation carries that field —
// e.g. `sale_price` is absent when nothing is on sale (Sync/Variable_Prices.php:
// "Each sub-range is omitted when that field has no values"). Only present keys
// are validated.
export type VariablePrices = {
	price?: VariableRange;
	regular_price?: VariableRange;
	sale_price?: VariableRange;
};

/**
 * Which product a range belongs to, stamped onto every log this module writes.
 * The error code names the CLASS of fault; without the record it happened to, a
 * cashier reading the health log has no product to go and check.
 *
 * `recordId` is load-bearing beyond display: the logger folds consecutive
 * identical events into one counted row, and the record is part of that identity
 * (`persistLog`). Without it a grid holding three unreadable products collapses
 * to a single ×3 row naming only the first — the same wrong-attribution the
 * collapse identity already guards against for `collection`.
 */
export type VariablePriceOwner = {
	/** The record's own primary key — its identity in the collapse identity. */
	recordId?: unknown;
	/** Backend identity: the id the admin types into the store, `null` until acknowledged. */
	remoteId?: unknown;
	name?: unknown;
	sku?: unknown;
	/**
	 * The parent's OWN price fields exactly as served — the evidence for
	 * {@link augmentationRan}. Pass them straight from the payload; `undefined`
	 * means the caller did not read that field, which is NOT the same as the
	 * server sending it blank.
	 */
	price?: unknown;
	regularPrice?: unknown;
	salePrice?: unknown;
};

/**
 * Did the server's variable-price augmentation run on this record?
 *
 * `Sync/Variable_Prices.php` blanks the parent's own `price`, `regular_price`
 * and `sale_price` on the wire for EVERY variable product it touches — "a
 * simple-to-variable conversion can leave old simple price fields on the
 * parent. Clear them even when no visible child has a price." So three served,
 * blank price fields are proof the augmentation ran and simply had no priced
 * visible variation to report; the missing meta key is then the documented
 * signal for that state, not a fault.
 *
 * Absence is deliberately NOT read as blank. A caller that never read the price
 * fields (or a lane serving a sparse fieldset) has given no evidence either
 * way, and the honest response to no evidence is the error — going quiet on a
 * record we know nothing about is how a real augmentation outage would hide.
 */
function augmentationRan(owner: VariablePriceOwner | undefined): boolean {
	if (!owner) return false;
	return (['price', 'regularPrice', 'salePrice'] as const).every((field) => {
		const value = owner[field];
		if (value === undefined) return false;
		return String(value ?? '').trim() === '';
	});
}

function ownerContext(owner: VariablePriceOwner | undefined): Record<string, unknown> {
	if (!owner) return {};
	const context: Record<string, unknown> = {};
	if (owner.recordId != null) context.recordId = owner.recordId;
	if (owner.remoteId != null) context.productId = owner.remoteId;
	if (owner.name != null) context.productName = owner.name;
	if (owner.sku != null) context.sku = owner.sku;
	return context;
}

const RANGE_KEYS = ['price', 'regular_price', 'sale_price'] as const;

function isVariableRange(value: unknown): value is VariableRange {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as VariableRange).min === 'string' &&
		typeof (value as VariableRange).max === 'string'
	);
}

function isVariablePrices(value: unknown): value is VariablePrices {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	const present = RANGE_KEYS.filter((k) => v[k] !== undefined);
	return present.length > 0 && present.every((k) => isVariableRange(v[k]));
}

/**
 * Read the typed variable-price object delivered by the server. String parsing
 * remains only as legacy tolerance for metadata written before the typed contract.
 */
export function getVariablePrices(
	metaData: { key?: string; value?: unknown }[] | undefined,
	owner?: VariablePriceOwner
): VariablePrices | null {
	if (!metaData) {
		uiLogger.error('metaData is not defined', {
			code: ERROR_CODES.VARIABLE_PRICE_META_INVALID,
			context: ownerContext(owner),
		});
		return null;
	}

	const metaDataEntry = metaData.find((m) => m.key === '_woocommerce_pos_variable_prices');

	if (!metaDataEntry) {
		// The server does not send the key with a null value — `inject_meta_entry`
		// REMOVES it when no visible variation carries a price at all. Absence is
		// therefore two different states wearing one face, told apart by whether
		// the augmentation that would have written the key ran at all.
		if (!augmentationRan(owner)) {
			uiLogger.error("No '_woocommerce_pos_variable_prices' key found in metaData", {
				code: ERROR_CODES.VARIABLE_PRICE_META_INVALID,
				context: ownerContext(owner),
			});
		}
		return null;
	}

	// Legacy tolerance: a stored `null` value from before the sync lane started
	// removing the entry outright (see the absence branch above).
	if (metaDataEntry.value === null) {
		return null;
	}

	try {
		const value = metaDataEntry.value;
		let parsed = value;
		if (typeof value === 'string') {
			parsed = JSON.parse(value);
		}
		if (!isVariablePrices(parsed)) {
			uiLogger.error("'_woocommerce_pos_variable_prices' has invalid structure", {
				code: ERROR_CODES.VARIABLE_PRICE_META_INVALID,
				context: {
					...ownerContext(owner),
					value: metaDataEntry.value,
				},
			});
			return null;
		}
		return parsed;
	} catch (error) {
		uiLogger.error("Unable to parse '_woocommerce_pos_variable_prices' value into JSON", {
			code: ERROR_CODES.VARIABLE_PRICE_META_INVALID,
			context: {
				...ownerContext(owner),
				value: metaDataEntry.value,
				error: getErrorMessage(error),
			},
		});
		return null;
	}
}
