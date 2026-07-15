import type { OnlineStatus } from '@wcpos/hooks/use-online-status';
import type { EngineConnectivity } from '@wcpos/sync-engine';

const engineConnectivityByOnlineStatus = {
	offline: 'offline',
	'online-website-unavailable': 'degraded',
	'online-website-available': 'online',
} satisfies Record<OnlineStatus, EngineConnectivity>;

let appOnlineStatus: OnlineStatus = 'online-website-available';

export function setAppOnlineStatus(status: OnlineStatus): void {
	appOnlineStatus = status;
}

export function getEngineConnectivity(): EngineConnectivity {
	return engineConnectivityByOnlineStatus[appOnlineStatus];
}
