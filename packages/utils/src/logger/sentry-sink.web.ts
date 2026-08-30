import * as Sentry from '@sentry/browser';

import { AppInfo } from '../app-info';

export type SentryCaptureInput = {
	message: string;
	code?: number | string;
	context?: unknown;
};

// Public DSN for the same Sentry project used by the desktop main process.
const SENTRY_DSN = 'https://39233e9d1e5046cbb67dae52f807de5f@o159038.ingest.sentry.io/1220733';

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
		return `${parsedUrl.pathname}${parsedUrl.search}`;
	} catch {
		return url;
	}
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
	try {
		const error = (input.context as any)?.error;
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

const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
if (typeof window !== 'undefined' && !isDevelopment) {
	Sentry.init({
		dsn: SENTRY_DSN,
		release: `wcpos-app@${AppInfo.version}`,
		environment: AppInfo.platform,
		sendDefaultPii: false,
		sampleRate: 1,
		beforeSend: scrubEvent,
		ignoreErrors: [/ResizeObserver loop/],
	});
	const installId = getInstallId();
	if (installId) Sentry.setUser({ id: installId });
}
