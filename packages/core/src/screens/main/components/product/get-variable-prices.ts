import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

const uiLogger = getLogger(['wcpos', 'ui', 'product']);

type VariableRange = { min: string; max: string };

export type VariablePrices = {
	price: VariableRange;
	regular_price: VariableRange;
	sale_price: VariableRange;
};

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
	return (
		isVariableRange(v.price) && isVariableRange(v.regular_price) && isVariableRange(v.sale_price)
	);
}

/**
 *
 */
export function getVariablePrices(
	metaData: { key?: string; value?: string }[] | undefined
): VariablePrices | null {
	if (!metaData) {
		uiLogger.error('metaData is not defined', {
			context: {
				errorCode: ERROR_CODES.MISSING_REQUIRED_FIELD,
			},
		});
		return null;
	}

	const metaDataEntry = metaData.find(
		(m: { key?: string; value?: string }) => m.key === '_woocommerce_pos_variable_prices'
	);

	if (!metaDataEntry) {
		uiLogger.error("No '_woocommerce_pos_variable_prices' key found in metaData", {
			context: {
				errorCode: ERROR_CODES.MISSING_REQUIRED_FIELD,
			},
		});
		return null;
	}

	try {
		const parsed = JSON.parse(metaDataEntry.value ?? '');
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
