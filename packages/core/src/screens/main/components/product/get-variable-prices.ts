import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

const uiLogger = getLogger(['wcpos', 'ui', 'product']);

/**
 *
 */
export function getVariablePrices(metaData: { key?: string; value?: string }[] | undefined) {
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
		const variablePrices = JSON.parse(metaDataEntry.value ?? '');
		return variablePrices;
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
