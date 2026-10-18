import * as React from 'react';

import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { ensureSystemPrinterProfile, type PrinterStoreDatabase } from '@wcpos/query';

const logger = getLogger(['wcpos', 'printing', 'system-printer']);

/**
 * Ensures a built-in "Print Dialog" system printer exists in the printer_profiles collection.
 * Inserts one on first load if missing. This runs once per mount.
 */
export function useEnsureSystemPrinter(storeDB: PrinterStoreDatabase) {
	React.useEffect(() => {
		ensureSystemPrinterProfile(storeDB).catch((err) => {
			logger.error('Failed to ensure system printer', {
				code: ERROR_CODES.PRINT_UNEXPECTED,
				context: { error: getErrorMessage(err) },
			});
		});
	}, [storeDB]);
}
