import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
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

// Longest the printers list waits for the cloud-printer request before showing what it has.
const CLOUD_SETTLE_GRACE_MS = 2000;

export function useAvailablePrinterProfiles() {
	const { storeDB } = useStoreSession();
	const http = useRestHttpClient();
	const [cloudPayload, setCloudPayload] = React.useState<CloudPrintResponse | null>(null);
	// The page must not show its empty state while cloud printers are still being fetched; a hung
	// request must not blank the page either, so the wait is capped.
	const [cloudSettled, setCloudSettled] = React.useState(false);
	// Routing needs the real answer, not the capped wait: a receipt routed to a cloud printer
	// must not fall back to another target just because the request took longer than the grace.
	const [cloudPending, setCloudPending] = React.useState(true);

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
				setCloudSettled(true);
				setCloudPending(false);
			})
			.catch((error) => {
				if (cancelled) return;
				// Local printers still work, and this runs on every settings/receipt mount:
				// lifecycle (offline: forensic), not an amber row.
				printerLogger[isExpectedPreflightBlock(error) ? 'debug' : 'info'](
					'Cloud printers could not be loaded; local printers still work',
					{
						context: { error: getErrorMessage(error) },
					}
				);
				setCloudPayload(null);
				setCloudSettled(true);
				setCloudPending(false);
			});
		const grace = setTimeout(() => {
			if (!cancelled) setCloudSettled(true);
		}, CLOUD_SETTLE_GRACE_MS);

		return () => {
			cancelled = true;
			clearTimeout(grace);
		};
	}, [http]);

	return React.useMemo(
		() => ({
			printers: mergeAvailablePrinterProfiles(localProfiles ?? [], cloudPayload),
			/** The list can be shown: local profiles loaded and the cloud request settled or graced. */
			isLoading: localProfiles === undefined || !cloudSettled,
			/** The cloud request has not answered yet (uncapped; the http client times out at 30 s). */
			cloudPending,
		}),
		[localProfiles, cloudPayload, cloudSettled, cloudPending]
	);
}
