import * as React from 'react';

import { AppMetrics, Observe } from 'expo-observe';

import { AppInfo } from '@wcpos/utils/app-info';
import { DEFAULT_APP_SCHEME } from '@wcpos/utils/app-info/scheme';
import type { TelemetryConsent } from '@wcpos/utils/logger/sentry-sink';

/**
 * EAS Observe: app startup and per-route timings (time to first render, time to
 * interactive) plus unhandled JS errors, dispatched to the project's Observe tab
 * on expo.dev. Metrics are collected on-device and sent when the app backgrounds.
 *
 * Two gates, both mirrors of the Sentry sink
 * (packages/utils/src/logger/sentry-sink.native.ts):
 *
 * - Only the STORE build reports. The dev client (`wcpos-dev`) and ad-hoc builds
 *   (`wcpos-adhoc`) stay silent, whatever the merchant chose: dev noise would
 *   drown the production signal. The scheme comes from the binary's application
 *   id, the one value that cannot disagree with the installed build.
 * - Nothing leaves the device before the merchant has said yes. Dispatching is
 *   OFF from import and switches on only while the store's `tracking_consent`
 *   is `allowed`; `denied` (or logout) switches it off again, which drops
 *   whatever was pending.
 *
 * `Observe.configure` REPLACES the whole configuration on every call, so every
 * option lives in this one function and a consent change re-sends all of it.
 *
 * On web and Electron `expo-observe` resolves to its web stub, so this module
 * is safe to import from the shared root layout: nothing is recorded there.
 */

/**
 * Flip to `true` ONLY for a local check in the dev client, and never commit it:
 * it makes the dev client and ad-hoc builds report as well (debug-build
 * dispatch plus the scheme gate), so the Observe dashboard fills with dev noise.
 */
const DISPATCH_FROM_NON_STORE_BUILDS = false;

const REPORTING_BUILD = DISPATCH_FROM_NON_STORE_BUILDS || AppInfo.scheme === DEFAULT_APP_SCHEME;

/**
 * Every dynamic segment under apps/main/app, plus the query-string ids the app
 * navigates with (`?closureId=&registerId=` into Reports, `?store=` on web).
 * The dashboard groups by the route PATTERN (`orders/(modals)/view/[orderId]`),
 * which survives filtering; the ids are a merchant's records and add nothing
 * to a timing. A filtered key also hides the resolved URL.
 */
const FILTERED_ROUTE_PARAMS = [
	'orderId',
	'customerId',
	'productId',
	'variationId',
	'couponId',
	'closureId',
	'registerId',
	'store',
	'id',
	'component',
];

let dispatchingEnabled: boolean | null = null;

function configure(nextDispatchingEnabled: boolean): void {
	// Re-sending an unchanged configuration re-initialises the router integration
	// for nothing; `dispatchingEnabled: false` also discards pending metrics, so
	// only a real change is worth a call.
	if (dispatchingEnabled === nextDispatchingEnabled) return;
	dispatchingEnabled = nextDispatchingEnabled;
	Observe.configure({
		dispatchingEnabled: nextDispatchingEnabled,
		dispatchInDebug: DISPATCH_FROM_NON_STORE_BUILDS,
		integrations: { 'expo-router': { filteredParams: FILTERED_ROUTE_PARAMS } },
	});
}

// Configured at import, before any screen mounts: the router integration must be
// on before the first route renders or its timings are never recorded, and
// dispatching stays off until the merchant's answer is known.
configure(false);

/**
 * Drops every metric and error still stored on the device. Switching
 * `dispatchingEnabled` off does NOT: the SDK discards pending events only when
 * a dispatch runs while disabled, so what a store that said no collected would
 * otherwise upload the moment a store that said yes takes over the till.
 */
function discardStoredEvents(): Promise<void> {
	return AppMetrics.clearStoredEntries().catch(() => {
		// Diagnostics must never interrupt the app.
	});
}

let appliedConsent: TelemetryConsent | null = null;

/**
 * Applies the merchant's telemetry preference. `null` is boot, before the
 * session has restored (see `useTelemetryConsent`): no opinion, nothing changes.
 */
export function setObserveConsent(consent: TelemetryConsent | null): void {
	if (consent === null || consent === appliedConsent) return;
	const leavingDenied = appliedConsent === 'denied';
	appliedConsent = consent;

	if (consent === 'denied') {
		// Off first, then drop what was held: what the merchant refused never leaves.
		configure(false);
		void discardStoredEvents();
		return;
	}

	const dispatch = REPORTING_BUILD && consent === 'allowed';
	if (leavingDenied) {
		// Everything collected under the refusal goes BEFORE dispatching can resume.
		void discardStoredEvents().then(() => configure(dispatch));
		return;
	}
	configure(dispatch);
}

export function useObserveConsent(consent: TelemetryConsent | null): void {
	// An effect because the Observe module is an external system: the reactive
	// merchant preference is synchronised into it, the same shape as the Sentry
	// sink in `useTelemetryConsent`.
	React.useEffect(() => {
		setObserveConsent(consent);
	}, [consent]);
}
