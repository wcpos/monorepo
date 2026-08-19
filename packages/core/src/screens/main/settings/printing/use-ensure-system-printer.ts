import * as React from 'react';

import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { StoreDatabase } from '@wcpos/database';

const logger = getLogger(['wcpos', 'printing', 'system-printer']);

const SYSTEM_PRINTER_ID = '__system__';

/**
 * Ensures a built-in "Print Dialog" system printer exists in the printer_profiles collection.
 * Inserts one on first load if missing. This runs once per mount.
 */
export function useEnsureSystemPrinter(storeDB: StoreDatabase) {
	React.useEffect(() => {
		const collection = storeDB.collections.printer_profiles;

		collection
			.findOne(SYSTEM_PRINTER_ID)
			.exec()
			.then(async (existing) => {
				if (!existing) {
					// Only set as default if no other printer is already default
					const currentDefault = await collection.findOne({ selector: { isDefault: true } }).exec();

					await collection.insert({
						id: SYSTEM_PRINTER_ID,
						name: 'Print Dialog',
						connectionType: 'system',
						vendor: 'generic',
						language: 'esc-pos',
						// System/browser print does not use ESC/POS columns; keep a safe value only because
						// printer_profiles requires the shared columns field.
						columns: 42,
						port: 9100,
						autoCut: false,
						autoOpenDrawer: false,
						isDefault: !currentDefault,
						isBuiltIn: true,
					});
				}
			})
			.catch((err) => {
				logger.error('Failed to ensure system printer', {
					code: ERROR_CODES.PRINT_UNEXPECTED,
					context: { error: getErrorMessage(err) },
				});
			});
	}, [storeDB]);
}
