import { AppInfo } from '../app-info';
import {
	buildCaptureOptions,
	createPendingCaptures,
	prepareEvent,
	SENTRY_DSN,
} from './sentry-core';

import type { SentryCaptureInput, TelemetryConsent } from './sentry-core';
export { buildCaptureOptions, messageTemplate, scrubEvent } from './sentry-core';
export type { SentryCaptureInput, TelemetryConsent } from './sentry-core';

let telemetryConsent: TelemetryConsent = 'undecided';
let isInitialized = false;
let sdk: typeof import('@sentry/browser') | null = null;
let loading: Promise<void> | null = null;
const pendingCaptures = createPendingCaptures();

function getInstallId(): string | undefined {
	const electronInstallId = (window as unknown as { electron?: { installId?: unknown } }).electron
		?.installId;
	if (typeof electronInstallId === 'string' && electronInstallId.trim()) {
		return electronInstallId;
	}

	try {
		const storedInstallId = window.localStorage.getItem('wcpos_install_id');
		if (storedInstallId) return storedInstallId;
	} catch {
		// Browser storage can be unavailable despite window being present.
	}

	try {
		const installId = window.crypto.randomUUID();
		window.localStorage.setItem('wcpos_install_id', installId);
		return installId;
	} catch {
		return undefined;
	}
}

function send(input: SentryCaptureInput): void {
	if (!sdk) {
		pendingCaptures.hold(input);
		return;
	}
	try {
		const error =
			input.context !== null && typeof input.context === 'object' && 'error' in input.context
				? input.context.error
				: undefined;
		const options = buildCaptureOptions(input);
		if (error instanceof Error) {
			sdk.captureException(error, options);
		} else {
			sdk.captureMessage(input.message, options);
		}
	} catch {
		// Diagnostics must never interfere with the logger.
	}
}

export function captureLoggedError(input: SentryCaptureInput): void {
	if (!isInitialized) {
		// Hold boot errors and captures waiting for the consented SDK load.
		if (telemetryConsent === 'undecided' || (telemetryConsent === 'allowed' && loading)) {
			pendingCaptures.hold(input);
		}
		return;
	}
	send(input);
}

/**
 * Opt-in printer setup outcome (roadmap#161 P0): one info-level message per terminal setup
 * phase, tagged so Sentry can pivot by vendor/lane/platform. Sent only when the merchant
 * allowed telemetry; carries no addresses or device keys.
 */
// Only stable, address-free fields leave the device; failure text can carry a printer endpoint.
export const PRINTER_OUTCOME_FIELDS = [
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
] as const;

export function capturePrinterOutcome(
	context: Record<string, string | number | boolean | undefined>
): void {
	if (!isInitialized || !sdk) return;
	try {
		const safe = Object.fromEntries(
			PRINTER_OUTCOME_FIELDS.filter((key) => context[key] !== undefined).map((key) => [
				key,
				String(context[key]),
			])
		);
		sdk.captureMessage('Printer setup outcome', {
			level: 'info',
			tags: safe,
			extra: { context: safe },
		});
	} catch {
		// Diagnostics must never interfere with the logger.
	}
}

// Development builds never report, whatever the merchant chose: dev noise
// would drown the production signal. ts-jest leaves __DEV__ undefined.
const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;

export function setTelemetryConsent(consent: TelemetryConsent): void {
	if (consent === telemetryConsent) return;
	telemetryConsent = consent;

	if (consent === 'allowed') {
		if (isDevelopment || typeof window === 'undefined') {
			pendingCaptures.drain();
			return;
		}
		if (loading) return;
		loading = import('@sentry/browser')
			.then((m) => {
				sdk = m;
				loading = null;
				sdk.init({
					dsn: SENTRY_DSN,
					release: `wcpos-app@${AppInfo.version}`,
					environment: AppInfo.platform,
					sendDefaultPii: false,
					integrations: (integrations) =>
						integrations.filter(({ name }) => name !== 'BrowserSession'),
					sampleRate: 1,
					beforeSend: prepareEvent,
					ignoreErrors: [/ResizeObserver loop/],
				});
				if (telemetryConsent !== 'allowed') {
					void sdk.close();
					return;
				}
				const installId = getInstallId();
				if (installId) sdk.setUser({ id: installId });
				isInitialized = true;
				for (const input of pendingCaptures.drain()) send(input);
			})
			.catch(() => {
				// Keep failed loads settled: no retries, and held captures stay local.
			});
		return;
	}

	if (sdk && isInitialized) {
		void sdk.close();
		isInitialized = false;
	}
	// Captures held for a load whose consent has since left must not reach a later consent.
	if (loading) pendingCaptures.drain();
	// Denied: what was held before the answer never leaves the device.
	if (consent === 'denied') pendingCaptures.drain();

	if (consent === 'denied') {
		try {
			window.localStorage.removeItem('wcpos_install_id');
		} catch {
			// Browser storage can be unavailable despite window being present.
		}
	}
}
