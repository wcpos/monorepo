import { v4 as uuidv4 } from 'uuid';

import type { StoreDatabase } from '@wcpos/database';

import type { LocalPrinterProfile } from '../reads/store-local';
import type { LocalDatabaseWithReset } from '../use-local-collection';

export type PrinterStoreDatabase = LocalDatabaseWithReset | null | undefined;
export type PrinterProfileFields = Omit<LocalPrinterProfile, 'id'>;
export const SYSTEM_PRINTER_ID = '__system__';

export class StoreDatabaseUnavailableError extends Error {
	constructor() {
		super('Store database is unavailable');
		this.name = 'StoreDatabaseUnavailableError';
	}
}

export class PrinterProfileNotFoundError extends Error {
	constructor(readonly id: string) {
		super(`Printer profile ${id} no longer exists`);
		this.name = 'PrinterProfileNotFoundError';
	}
}

function printerProfiles(database: PrinterStoreDatabase) {
	if (!database) throw new StoreDatabaseUnavailableError();
	return database.collections.printer_profiles as StoreDatabase['collections']['printer_profiles'];
}

// Store-local configuration has no server counterpart to push, acknowledge or reconcile.
export async function savePrinterProfile(
	database: PrinterStoreDatabase,
	fields: PrinterProfileFields,
	options: { id?: string; reuseByAddress?: boolean } = {}
): Promise<{ id: string; created: boolean }> {
	const collection = printerProfiles(database);
	let existingId = options.id;
	// One printer = one row: the dialog reuses an address that is already set up.
	if (existingId === undefined && options.reuseByAddress && fields.address) {
		const twin = await collection.findOne({ selector: { address: fields.address } }).exec();
		if (twin) existingId = twin.id;
	}
	const id = existingId ?? uuidv4();
	if (existingId !== undefined) {
		const doc = await collection.findOne(existingId).exec();
		if (!doc) throw new PrinterProfileNotFoundError(existingId);
		await doc.patch(fields);
	} else {
		await collection.insert({ id, ...fields });
	}
	// Demote other defaults only once the target is persisted, so a failed save never
	// leaves the store without a default printer.
	if (fields.isDefault) {
		const defaults = await collection.find({ selector: { isDefault: true } }).exec();
		for (const doc of defaults) if (doc.id !== id) await doc.patch({ isDefault: false });
	}
	return { id, created: existingId === undefined };
}

export async function ensureSystemPrinterProfile(
	database: PrinterStoreDatabase
): Promise<'created' | 'present'> {
	const collection = printerProfiles(database);
	if (await collection.findOne(SYSTEM_PRINTER_ID).exec()) return 'present';
	// Only set as default if no other printer is already default.
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
	return 'created';
}

export async function setDefaultPrinterProfile(
	database: PrinterStoreDatabase,
	id: string
): Promise<boolean> {
	const allDocs = await printerProfiles(database).find().exec();
	if (!allDocs.some((doc) => doc.id === id)) return false;
	for (const doc of allDocs) {
		if (doc.id === id && !doc.isDefault) {
			await doc.patch({ isDefault: true });
		} else if (doc.id !== id && doc.isDefault) {
			await doc.patch({ isDefault: false });
		}
	}
	return true;
}

export async function deletePrinterProfile(
	database: PrinterStoreDatabase,
	id: string
): Promise<boolean> {
	const doc = await printerProfiles(database).findOne(id).exec();
	if (!doc || doc.isBuiltIn) return false;
	await doc.remove();
	return true;
}
