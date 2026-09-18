import * as React from 'react';

import { Observe } from 'expo-observe';

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
 *   is `allowed`. A refusal (`denied`) also discards what was collected, on the
 *   way in and again on the way out, so a store that said no followed by one
 *   that said yes on the same till never uploads the refusal's events.
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
 * Every dynamic segment under apps/main/app, plus every id-bearing query
 * parameter the app navigates with (`?closureId=&registerId=` into Reports,
 * `?document=refund:<id>` into a receipt, `?store=` on web). The dashboard
 * groups by the route PATTERN (`orders/(modals)/view/[orderId]`), which
 * survives filtering; the ids are a merchant's records and add nothing to a
 * timing. A filtered key also hides the resolved URL.
 */
const FILTERED_ROUTE_PARAMS = [
	'orderId',
	'customerId',
	'productId',
	'variationId',
	'couponId',
	'closureId',
	'registerId',
	'document',
	'store',
	'id',
	'component',
];

let dispatchingEnabled: boolean | null = null;

function configure(nextDispatchingEnabled: boolean): void {
	// Re-sending an unchanged configuration re-initialises the router integration
	// for nothing, so only a real change is worth a call.
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
 * Discards every metric and log still pending on the device. This is the SDK's
 * own discard path: a dispatch that runs while dispatching is disabled advances
 * the sent-cursor past everything pending without sending it (expo-observe
 * 57.0.23, `Observability.swift` dispatchMetrics/dispatchLogs and
 * `ObservabilityManager.kt` dispatchUnsentMetrics/Logs), and it leaves the live
 * session alone. `AppMetrics.clearStoredEntries` is NOT it: a no-op on iOS, and
 * on Android it deletes the session the running SDK keeps writing to.
 *
 * Must be called with dispatching OFF, or it sends. The one gap: a retry
 * backoff armed by an earlier failed send makes the dispatch return early
 * without moving the cursor.
 */
function discardPendingEvents(): Promise<void> {
	return Observe.dispatchEvents().catch(() => {
		// Diagnostics must never interrupt the app.
	});
}

let appliedConsent: TelemetryConsent | null = null;
let pendingDiscard: Promise<void> | null = null;

function applyLatestConsent(): void {
	configure(REPORTING_BUILD && appliedConsent === 'allowed');
}

/**
 * Runs a discard and, once it has finished, applies whatever consent is current
 * BY THEN. Consent can change again while a discard is in flight; the newest
 * discard is the only one whose completion counts, and dispatching cannot be
 * switched on by anyone while one is pending, so a refusal's events are never
 * in the queue when sending resumes.
 */
function discardThenApplyLatestConsent(): void {
	const discard: Promise<void> = discardPendingEvents().then(() => {
		if (pendingDiscard !== discard) return;
		pendingDiscard = null;
		applyLatestConsent();
	});
	pendingDiscard = discard;
}

/**
 * Applies the merchant's telemetry preference. `null` is boot, before the
 * session has restored (see `useTelemetryConsent`): no opinion, nothing changes.
 * A logout (`undecided`) only stops dispatching; what an allowed store collected
 * stays and goes out once a store that allows reporting is back.
 */
export function setObserveConsent(consent: TelemetryConsent | null): void {
	if (consent === null || consent === appliedConsent) return;
	const previousConsent = appliedConsent;
	appliedConsent = consent;

	if (consent === 'denied' || previousConsent === 'denied') {
		// Off first (a no-op when leaving a refusal, it already is), so the discard
		// sends nothing; the discard's completion applies the consent current by then.
		configure(false);
		discardThenApplyLatestConsent();
		return;
	}
	// A discard in flight applies the latest consent when it completes.
	if (pendingDiscard) return;
	applyLatestConsent();
}

export function useObserveConsent(consent: TelemetryConsent | null): void {
	// An effect because the Observe module is an external system: the reactive
	// merchant preference is synchronised into it, the same shape as the Sentry
	// sink in `useTelemetryConsent`.
	React.useEffect(() => {
		setObserveConsent(consent);
	}, [consent]);
}
