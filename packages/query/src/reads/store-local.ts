import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import type {
	PrinterProfileDocument,
	TemplateDocument,
	TemplatePrinterOverrideDocument,
} from '@wcpos/database';

import { type LocalDatabaseWithReset, observeFollowedCollection } from '../use-local-collection';

type StoreDatabase = LocalDatabaseWithReset | null | undefined;
export type ActiveTemplate = ReturnType<TemplateDocument['toJSON']>;
export type LocalPrinterProfile = ReturnType<PrinterProfileDocument['toJSON']>;
type TemplatePrinterOverride = ReturnType<TemplatePrinterOverrideDocument['toJSON']>;

/** All store-local routing overrides; absent database → []. */
export function observeTemplatePrinterOverrides(database: StoreDatabase) {
	return observeFollowedCollection<TemplatePrinterOverride>(
		database,
		'template_printer_overrides'
	).pipe(
		switchMap((collection) =>
			collection ? collection.find().$.pipe(map((docs) => docs.map((doc) => doc.toJSON()))) : of([])
		)
	);
}

/** Persisted printer profiles (cloud profiles are merged by the caller); absent → []. */
export function observePrinterProfiles(database: StoreDatabase) {
	return observeFollowedCollection<LocalPrinterProfile>(database, 'printer_profiles').pipe(
		switchMap((collection) =>
			collection ? collection.find().$.pipe(map((docs) => docs.map((doc) => doc.toJSON()))) : of([])
		)
	);
}

/** Published/virtual templates in menu order; closure templates belong to the viewed store. */
export function observeActiveTemplates(
	database: StoreDatabase,
	{ type, storeId }: { type: 'receipt' | 'report' | 'closure'; storeId?: number }
) {
	return observeFollowedCollection<ActiveTemplate>(database, 'templates').pipe(
		switchMap((collection) =>
			collection
				? collection
						.find({
							selector: { type, ...(type === 'closure' ? { closure_store_id: storeId } : {}) },
							sort: [{ menu_order: 'asc' }],
						})
						.$.pipe(
							map((docs) =>
								docs
									.map((doc) => doc.toJSON())
									.filter((doc) => doc.is_virtual || doc.status === 'publish')
							)
						)
				: of([])
		)
	);
}
