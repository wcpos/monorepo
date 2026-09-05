import { v4 as uuidv4 } from 'uuid';

import type { StoreDatabase } from '@wcpos/database';

import { buildPrinterProfileFields, type PrinterProfileFormData } from './profile-config';

export async function persistPrinterProfile(
	storeDB: StoreDatabase,
	data: PrinterProfileFormData,
	existingId?: string
): Promise<string> {
	const collection = storeDB.collections.printer_profiles;
	const profileData = buildPrinterProfileFields(data);
	// One printer = one row: adding an address that is already set up updates that row.
	if (!existingId && profileData.address) {
		const twin = await collection.findOne({ selector: { address: profileData.address } }).exec();
		if (twin) existingId = twin.id;
	}
	const id = existingId ?? uuidv4();
	if (data.isDefault) {
		const existingDefaults = await collection.find({ selector: { isDefault: true } }).exec();
		for (const doc of existingDefaults) {
			if (doc.id !== id) await doc.patch({ isDefault: false });
		}
	}
	if (existingId) {
		const doc = await collection.findOne(existingId).exec();
		if (!doc) throw new Error(`Printer profile ${existingId} no longer exists`);
		await doc.patch(profileData);
	} else {
		await collection.insert({ id, ...profileData });
	}
	return id;
}
