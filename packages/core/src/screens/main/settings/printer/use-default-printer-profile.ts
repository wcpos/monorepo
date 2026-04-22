import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { PrinterProfile } from '@wcpos/printer';
import type { PrinterProfileDocument } from '@wcpos/database';

import { useAppState } from '../../../../contexts/app-state';

/**
 * Converts an RxDB printer profile document into a plain PrinterProfile object.
 */
export function toPrinterProfile(doc: PrinterProfileDocument): PrinterProfile {
	return {
		id: doc.id,
		name: doc.name,
		connectionType: doc.connectionType as PrinterProfile['connectionType'],
		vendor: (doc.vendor ?? 'generic') as PrinterProfile['vendor'],
		address: doc.address,
		port: doc.port ?? 9100,
		nativeInterfaceType: doc.nativeInterfaceType,
		language: (doc.language ?? 'esc-pos') as PrinterProfile['language'],
		columns: doc.columns ?? 48,
		autoPrint: doc.autoPrint ?? false,
		autoCut: doc.autoCut ?? true,
		autoOpenDrawer: doc.autoOpenDrawer ?? false,
		isDefault: doc.isDefault ?? false,
		isBuiltIn: doc.isBuiltIn ?? false,
	};
}

/**
 * Returns the default printer profile from the RxDB printer_profiles collection,
 * or undefined when no default has been configured.
 *
 * Reactively updates whenever the collection changes.
 */
export function useDefaultPrinterProfile(): PrinterProfile | undefined {
	const { storeDB } = useAppState();

	const profile$ = React.useMemo(
		() =>
			storeDB.collections.printer_profiles
				.findOne({ selector: { isDefault: true } })
				.$.pipe(map((doc) => (doc ? toPrinterProfile(doc as PrinterProfileDocument) : undefined))),
		[storeDB]
	);

	return useObservableState(profile$, undefined);
}
