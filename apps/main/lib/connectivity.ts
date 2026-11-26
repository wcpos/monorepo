import type { OnlineStatus } from '@wcpos/hooks/use-online-status';
import type { EngineConnectivity } from '@wcpos/sync-engine';

const engineConnectivityByOnlineStatus = {
	offline: 'offline',
	'online-website-unavailable': 'degraded',
	'online-website-available': 'online',
} satisfies Record<OnlineStatus, EngineConnectivity>;

function initialOnlineStatus(): OnlineStatus {
	// The engine is constructed during first render, before any React effect can
	// publish — a till booting offline must not open with an 'online' port. Web
	// and Electron expose navigator.onLine synchronously; native leaves it
	// undefined and stays optimistic until the provider's first report.
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return 'offline';
	}
	return 'online-website-available';
}

// Null while no provider is mounted: before the first report, and after sign-out, when the
// cached engine still has sales to send and must not stay on the last status it was told.
let appOnlineStatus: OnlineStatus | null = null;

export function setAppOnlineStatus(status: OnlineStatus | null): void {
	appOnlineStatus = status;
}

export function getEngineConnectivity(): EngineConnectivity {
	return engineConnectivityByOnlineStatus[appOnlineStatus ?? initialOnlineStatus()];
}
