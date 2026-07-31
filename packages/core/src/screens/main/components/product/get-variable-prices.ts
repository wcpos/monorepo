import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

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
	metaData: { key?: string; value?: unknown }[] | undefined
): VariablePrices | null {
	if (!metaData) {
		uiLogger.error('metaData is not defined', {
			context: {
				errorCode: ERROR_CODES.MISSING_REQUIRED_FIELD,
			},
		});
		return null;
	}

	const metaDataEntry = metaData.find((m) => m.key === '_woocommerce_pos_variable_prices');

	if (!metaDataEntry) {
		uiLogger.error("No '_woocommerce_pos_variable_prices' key found in metaData", {
			context: {
				errorCode: ERROR_CODES.MISSING_REQUIRED_FIELD,
			},
		});
		return null;
	}

	// The server injects `null` when no visible variation carries any price at
	// all — a legitimate state, not an error.
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
				context: {
					errorCode: ERROR_CODES.INVALID_DATA_TYPE,
					value: metaDataEntry.value,
				},
			});
			return null;
		}
		return parsed;
	} catch (error) {
		uiLogger.error("Unable to parse '_woocommerce_pos_variable_prices' value into JSON", {
			context: {
				errorCode: ERROR_CODES.INVALID_DATA_TYPE,
				value: metaDataEntry.value,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return null;
	}
}
