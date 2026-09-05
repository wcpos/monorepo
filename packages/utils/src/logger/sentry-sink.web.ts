import * as Sentry from '@sentry/browser';

import { AppInfo } from '../app-info';
import { redactSensitiveText } from './redact';

export type SentryCaptureInput = {
	message: string;
	code?: number | string;
	context?: unknown;
};

export type TelemetryConsent = 'undecided' | 'allowed' | 'denied';

// Public DSN for the same Sentry project used by the desktop main process.
const SENTRY_DSN = 'https://39233e9d1e5046cbb67dae52f807de5f@o159038.ingest.sentry.io/1220733';

let telemetryConsent: TelemetryConsent = 'undecided';
let isInitialized = false;

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

function stripOrigin(url: string): string {
	try {
		const parsedUrl = new URL(url);
		return redactSensitiveText(`${parsedUrl.pathname}${parsedUrl.search}`);
	} catch {
		return redactSensitiveText(url);
	}
}

function scrubUrlValues(value: unknown): unknown {
	if (typeof value === 'string') return stripOrigin(value);
	if (Array.isArray(value)) return value.map(scrubUrlValues);
	if (value === null || typeof value !== 'object' || value instanceof Error) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, nestedValue]) => [key, scrubUrlValues(nestedValue)])
	);
}

export function scrubEvent<T extends Sentry.Event>(event: T): T {
	if (event.request?.url) {
		event.request.url = stripOrigin(event.request.url);
	}
	for (const breadcrumb of event.breadcrumbs ?? []) {
		if (typeof breadcrumb.data?.url === 'string') {
			breadcrumb.data.url = stripOrigin(breadcrumb.data.url);
		}
	}
	if (event.extra) {
		event.extra = Object.fromEntries(
			Object.entries(event.extra).map(([key, value]) => [key, scrubUrlValues(value)])
		);
	}
	return event;
}

export function buildCaptureOptions({ message, code, context }: SentryCaptureInput) {
	return {
		level: 'error' as const,
		...(code !== undefined && {
			tags: { errorCode: String(code) },
			fingerprint: [String(code)],
		}),
		extra: { message, context },
	};
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
] as const;

export function capturePrinterOutcome(
	context: Record<string, string | number | boolean | undefined>
): void {
	if (!isInitialized) return;
	try {
		const safe = Object.fromEntries(
			PRINTER_OUTCOME_FIELDS.filter((key) => context[key] !== undefined).map((key) => [
				key,
				String(context[key]),
			])
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

// Development builds never report, whatever the merchant chose: dev noise
// would drown the production signal. ts-jest leaves __DEV__ undefined.
const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;

export function setTelemetryConsent(consent: TelemetryConsent): void {
	if (consent === telemetryConsent) return;
	telemetryConsent = consent;

	if (consent === 'allowed') {
		if (isDevelopment || typeof window === 'undefined') return;
		Sentry.init({
			dsn: SENTRY_DSN,
			release: `wcpos-app@${AppInfo.version}`,
			environment: AppInfo.platform,
			sendDefaultPii: false,
			integrations: (integrations) => integrations.filter(({ name }) => name !== 'BrowserSession'),
			sampleRate: 1,
			beforeSend: scrubEvent,
			ignoreErrors: [/ResizeObserver loop/],
		});
		const installId = getInstallId();
		if (installId) Sentry.setUser({ id: installId });
		isInitialized = true;
		return;
	}

	if (isInitialized) {
		void Sentry.close();
		isInitialized = false;
	}

	if (consent === 'denied') {
		try {
			window.localStorage.removeItem('wcpos_install_id');
		} catch {
			// Browser storage can be unavailable despite window being present.
		}
	}
}
