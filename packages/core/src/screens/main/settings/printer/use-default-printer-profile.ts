import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { PrinterProfile } from '@wcpos/printer';
import type { PrinterProfileDocument } from '@wcpos/database';

import { toPrinterProfile } from './printer-profile';
import { useAppState } from '../../../../contexts/app-state';

export { toPrinterProfile } from './printer-profile';

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
