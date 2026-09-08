import * as Sentry from '@sentry/react-native';
import { File, Paths } from 'expo-file-system';

import { AppInfo } from '../app-info';
import { buildCaptureOptions, scrubEvent, SENTRY_DSN } from './sentry-core';

import type { SentryCaptureInput, TelemetryConsent } from './sentry-core';

let telemetryConsent: TelemetryConsent = 'undecided';
let isInitialized = false;
const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;

function installIdFile() {
	return new File(Paths.document, 'wcpos_install_id');
}

export function setTelemetryConsent(consent: TelemetryConsent): void {
	if (consent === telemetryConsent) return;
	telemetryConsent = consent;
	if (consent === 'allowed') {
		if (isDevelopment) return;
		try {
			Sentry.init({
				dsn: SENTRY_DSN,
				release: `wcpos-app@${AppInfo.version}`,
				dist: AppInfo.buildNumber,
				environment: AppInfo.platform,
				sendDefaultPii: false,
				beforeSend: scrubEvent,
				enableWatchdogTerminationTracking: true,
			});
			isInitialized = true;
			const file = installIdFile();
			const id = file.exists ? file.textSync() : globalThis.crypto.randomUUID();
			if (!file.exists) file.write(id);
			Sentry.setUser({ id });
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
