import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { observePrinterProfiles } from '@wcpos/query';
import type { PrinterProfile } from '@wcpos/printer';
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
// A till may run for days (desk ruling, 26 Nov 2026): older answers refetch in the background.
const CLOUD_PRINT_MAX_AGE_MS = 10 * 60_000;

type CloudAnswer = { payload: CloudPrintResponse | null; at: number } | null;
type CloudPrintEntry = { answers: BehaviorSubject<CloudAnswer>; inFlight?: Promise<boolean> };
const cloudCache = new Map<string, CloudPrintEntry>(); // One per store session; failures not kept.
const cloudPrintEntry = (key: string): CloudPrintEntry =>
	cloudCache.get(key) ??
	cloudCache.set(key, { answers: new BehaviorSubject<CloudAnswer>(null) }).get(key)!;
export function __resetCloudPrintCacheForTests() {
	cloudCache.clear();
}

export function useAvailablePrinterProfiles({ refresh = false }: { refresh?: boolean } = {}) {
	const { storeDB, site, store } = useStoreSession();
	const key = `${site.wp_api_url}|${store.id}`;
	const http = useRestHttpClient();
	const latestHttp = React.useEffectEvent(() => http);
	const answer = useObservableEagerState(cloudPrintEntry(key).answers);
	const cloudPayload = answer?.payload ?? null;
	// The page must not show its empty state while cloud printers are still being fetched; a hung
	// request must not blank the page either, so the wait is capped.
	const [cloudSettled, setCloudSettled] = React.useState(false);
	// Routing needs the real answer, not the capped wait: a receipt routed to a cloud printer
	// must not fall back to another target just because the request took longer than the grace.
	const [cloudFailed, setCloudFailed] = React.useState(false);

	const profiles$ = React.useMemo(
		() => observePrinterProfiles(storeDB).pipe(map((docs) => docs.map(toPrinterProfile))),
		[storeDB]
	);
	const localProfiles = useObservableState<PrinterProfile[] | undefined>(profiles$, undefined);

	React.useEffect(() => {
		let cancelled = false;
		const entry = cloudPrintEntry(key);
		const cached = entry.answers.value;
		const due = refresh || !cached || Date.now() - cached.at >= CLOUD_PRINT_MAX_AGE_MS;
		// External store fetch: cloud printers are server-owned and synthesized at runtime.
		entry.inFlight ??= (due ? latestHttp() : undefined)
			?.get('/settings/cloud-print')
			.then((response) => {
				const data = (response as { data?: CloudPrintResponse })?.data;
				entry.answers.next({ payload: data ?? null, at: Date.now() });
				return true;
			})
			.catch((error) => {
				// Local printers still work, and this runs on every settings/receipt mount:
				// lifecycle (offline: forensic), not an amber row.
				printerLogger[isExpectedPreflightBlock(error) ? 'debug' : 'info'](
					'Cloud printers could not be loaded; local printers still work',
					{
						context: { error: getErrorMessage(error) },
					}
				);
				return false;
			})
			.finally(() => (entry.inFlight = undefined));
		void entry.inFlight?.then((ok) => !ok && !cancelled && setCloudFailed(true));
		const grace = setTimeout(() => {
			if (!cancelled) setCloudSettled(true);
		}, CLOUD_SETTLE_GRACE_MS);

		return () => {
			cancelled = true;
			clearTimeout(grace);
		};
	}, [key, refresh]); // Not http: a new client (every online-status flip) must not refetch.

	return React.useMemo(
		() => ({
			printers: mergeAvailablePrinterProfiles(localProfiles ?? [], cloudPayload),
			/** The list can be shown: local profiles loaded and the cloud request settled or graced. */
			isLoading: localProfiles === undefined || (!answer && !cloudSettled && !cloudFailed),
			/** The cloud request has not answered yet (uncapped; the http client times out at 30 s). */
			cloudPending: !answer && !cloudFailed,
		}),
		[localProfiles, cloudPayload, answer, cloudSettled, cloudFailed]
	);
}
