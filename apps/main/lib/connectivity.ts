import type { OnlineStatus } from '@wcpos/hooks/use-online-status';
import type { EngineConnectivity } from '@wcpos/sync-engine';

const engineConnectivityByOnlineStatus = {
	offline: 'offline',
	'online-website-unavailable': 'degraded',
	'online-website-available': 'online',
} satisfies Record<OnlineStatus, EngineConnectivity>;

function initialOnlineStatus(): OnlineStatus | null {
	// The engine is constructed during first render, before any React effect can
	// publish — a till booting offline must not open with an 'online' port. Web
	// and Electron expose navigator.onLine synchronously; native stays gated.
	if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
		return null;
	}
	return navigator.onLine ? 'online-website-available' : 'offline';
}

let appOnlineStatus: OnlineStatus | null = initialOnlineStatus();

export function setAppOnlineStatus(status: OnlineStatus): void {
	appOnlineStatus = status;
}

export function getEngineConnectivity(): EngineConnectivity {
	return appOnlineStatus === null ? 'offline' : engineConnectivityByOnlineStatus[appOnlineStatus];
}
