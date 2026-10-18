import type { StoreDatabase } from '@wcpos/database';

import { type PrinterStoreDatabase, StoreDatabaseUnavailableError } from './printer-profiles';

/** Store-local routing has no server counterpart; this command owns its writes. */
export async function setTemplatePrinterOverride(
	database: PrinterStoreDatabase,
	templateId: string,
	printerProfileId: string | null
): Promise<void> {
	if (!database) throw new StoreDatabaseUnavailableError();
	const collection = database.collections
		.template_printer_overrides as StoreDatabase['collections']['template_printer_overrides'];
	if (printerProfileId === null) {
		const existing = await collection.findOne(templateId).exec();
		if (existing) await existing.remove();
	} else {
		await collection.upsert({ template_id: templateId, printer_profile_id: printerProfileId });
	}
}
