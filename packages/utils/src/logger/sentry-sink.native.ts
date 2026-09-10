import * as Sentry from '@sentry/react-native';
import { File, Paths } from 'expo-file-system';

import { AppInfo } from '../app-info';
import { DEFAULT_APP_SCHEME } from '../app-info/scheme';
import { buildCaptureOptions, scrubEvent, SENTRY_DSN } from './sentry-core';

import type { SentryCaptureInput, TelemetryConsent } from './sentry-core';

let telemetryConsent: TelemetryConsent = 'undecided';
let isInitialized = false;

// Development builds never report, whatever the merchant chose: dev noise would
// drown the production signal. `__DEV__` alone is not enough on native — the E2E
// suite runs the development client with `expo start --no-dev`, a production-mode
// bundle inside a development binary. The application id is compiled into the
// binary, so only the store build (`wcpos`) reports; the dev client (`wcpos-dev`)
// and ad-hoc builds (`wcpos-adhoc`) stay silent.
const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
function isReportingBuild(): boolean {
	return !isDevelopment && AppInfo.scheme === DEFAULT_APP_SCHEME;
}

function installIdFile() {
	return new File(Paths.document, 'wcpos_install_id');
}

// The last consent the store handed us. A returning install that already allowed
// reporting initialises at import — before hydration, where startup crashes
// happen — instead of waiting for the root layout to mount and re-send it. Only
// `allowed` is ever persisted; anything else removes the marker, so a fresh or
// denied install defaults to silence.
function consentMarkerFile() {
	return new File(Paths.document, 'wcpos_telemetry_consent');
}

function persistConsent(consent: TelemetryConsent): void {
	try {
		const marker = consentMarkerFile();
		if (consent === 'allowed') {
			marker.write('allowed');
		} else if (marker.exists) {
			marker.delete();
		}
	} catch {
		// Storage may be unavailable; the store re-sends consent on every launch.
	}
}

function initialize(): void {
	// No custom release/dist: the SDK derives `<applicationId>@<version>+<build>`
	// natively, which is the key the Xcode and Gradle upload steps file source
	// maps and debug symbols under. A `wcpos-app@` release here would never match
	// an upload, so native frames would stay unsymbolicated. Native events are
	// therefore filtered by `environment:ios|android`, not by the web/Electron
	// `wcpos-app@` release namespace; grouping is unaffected (error-code fingerprint).
	Sentry.init({
		dsn: SENTRY_DSN,
		environment: AppInfo.platform,
		sendDefaultPii: false,
		beforeSend: scrubEvent,
		enableWatchdogTerminationTracking: true,
	});
	isInitialized = true;
	const file = installIdFile();
	let id = file.exists ? file.textSync() : '';
	if (!id) {
		id = globalThis.crypto.randomUUID();
		file.write(id);
	}
	Sentry.setUser({ id });
}

export function setTelemetryConsent(consent: TelemetryConsent): void {
	if (consent === telemetryConsent && (consent !== 'allowed' || isInitialized)) return;
	telemetryConsent = consent;
	persistConsent(consent);
	if (consent === 'allowed') {
		if (!isReportingBuild()) return;
		try {
			initialize();
		} catch {
			// Diagnostics (including unavailable storage) must never interrupt the app.
		}
		return;
	}
	if (isInitialized) {
		isInitialized = false;
		try {
			void Sentry.close().catch(() => {});
		} catch {
			// Diagnostics must never interrupt the app.
		}
	}
	if (consent === 'denied') {
		try {
			const file = installIdFile();
			if (file.exists) file.delete();
		} catch {
			// Storage may be unavailable.
		}
	}
}

try {
	if (isReportingBuild()) {
		const marker = consentMarkerFile();
		if (marker.exists && marker.textSync() === 'allowed') {
			telemetryConsent = 'allowed';
			initialize();
		}
	}
} catch {
	// Diagnostics must never interrupt startup.
}

export function captureLoggedError(input: SentryCaptureInput): void {
	if (!isInitialized) return;
	try {
		const error =
			input.context !== null && typeof input.context === 'object' && 'error' in input.context
				? input.context.error
				: undefined;
		const options = buildCaptureOptions(input);
		if (error instanceof Error) {
			Sentry.captureException(error, options);
		} else {
			Sentry.captureMessage(input.message, options);
		}
	} catch {
		// Diagnostics must never interfere with the logger.
	}
}

export function capturePrinterOutcome(
	context: Record<string, string | number | boolean | undefined>
): void {
	if (!isInitialized) return;
	try {
		// Only stable, address-free fields leave the device, matching the web sink.
		const fields = [
			'result',
			'platform',
			'source',
			'vendor',
			'model',
			'lane',
			'columns',
			'testPages',
			'securePrinting',
			'troubleReason',
		];
		const safe = Object.fromEntries(
			fields.filter((key) => context[key] !== undefined).map((key) => [key, String(context[key])])
		);
		Sentry.captureMessage('Printer setup outcome', {
			level: 'info',
			tags: safe,
			extra: { context: safe },
		});
	} catch {
		// Diagnostics must never interfere with the logger.
	}
}
