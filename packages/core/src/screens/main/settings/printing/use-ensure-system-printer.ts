import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
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
						columns: 48,
						port: 9100,
						autoPrint: false,
						autoCut: false,
						autoOpenDrawer: false,
						isDefault: !currentDefault,
						isBuiltIn: true,
					});
				}
			})
			.catch((err) => {
				logger.error('Failed to ensure system printer', {
					context: { error: err instanceof Error ? err.message : String(err) },
				});
			});
	}, [storeDB]);
}
