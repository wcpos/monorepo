import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { PrinterProfile } from '@wcpos/printer';
import type { PrinterProfileDocument } from '@wcpos/database';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import {
	type CloudPrintResponse,
	mergeAvailablePrinterProfiles,
} from './available-printer-profiles';
import { toPrinterProfile } from './printer-profile';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { useStoreSession } from '../../../../contexts/app-state';

const printerLogger = getLogger(['wcpos', 'printer', 'available-profiles']);

export function useAvailablePrinterProfiles() {
	const { storeDB } = useStoreSession();
	const http = useRestHttpClient();
	const [cloudPayload, setCloudPayload] = React.useState<CloudPrintResponse | null>(null);

	const profiles$ = React.useMemo(
		() =>
			storeDB.collections.printer_profiles
				.find()
				.$.pipe(map((docs) => (docs as PrinterProfileDocument[]).map(toPrinterProfile))),
		[storeDB]
	);
	const localProfiles = useObservableState<PrinterProfile[] | undefined>(profiles$, undefined);

	React.useEffect(() => {
		let cancelled = false;
		// External store fetch: cloud printers are server-owned and synthesized at runtime.
		http
			.get('/settings/cloud-print')
			.then((response) => {
				if (cancelled) return;
				const data = (response as { data?: CloudPrintResponse })?.data;
				setCloudPayload(data ?? null);
			})
			.catch((error) => {
				if (cancelled) return;
				printerLogger.warn('Unable to load cloud printer settings', {
					context: { error: getErrorMessage(error) },
				});
				setCloudPayload(null);
			});

		return () => {
			cancelled = true;
		};
	}, [http]);

	return React.useMemo(
		() => ({
			printers: mergeAvailablePrinterProfiles(localProfiles ?? [], cloudPayload),
			isLoading: localProfiles === undefined,
		}),
		[localProfiles, cloudPayload]
	);
}
